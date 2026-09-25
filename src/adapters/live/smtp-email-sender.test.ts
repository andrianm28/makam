import { afterEach, describe, expect, it, vi } from "vitest";
import { emailSenderContract, SAMPLE_PDF, type DeliveredEmail } from "@/adapters/email-sender.contract";
import type { SmtpSettings } from "@/lib/env";
import { EmailSendError } from "@/ports/email-sender";
import {
  RELAY_PASSWORD,
  RELAY_USER,
  startSilentServer,
  startTestSmtpRelay,
  type AcceptedMessage,
  type TestSmtpRelay,
} from "../../../tests/support/smtp-relay";
import { SmtpEmailSender } from "./smtp-email-sender";

function settingsFor(relay: { host: string; port: number }, overrides: Partial<SmtpSettings> = {}): SmtpSettings {
  return {
    host: relay.host,
    port: relay.port,
    user: RELAY_USER,
    password: RELAY_PASSWORD,
    from: { address: "no-reply@makam.co.id", name: "Makam.co.id" },
    ...overrides,
  };
}

/** The live adapter pointed at a local relay whose self-signed certificate it is told to trust. */
function senderFor(relay: TestSmtpRelay, overrides: Partial<SmtpSettings> = {}) {
  return new SmtpEmailSender(settingsFor(relay, overrides), { trustedCertificate: relay.certificate });
}

function asDelivered(message: AcceptedMessage): DeliveredEmail {
  const { parsed } = message;
  const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
  return {
    to: to?.value[0]?.address ?? "",
    subject: parsed.subject ?? "",
    text: (parsed.text ?? "").replace(/\n$/, ""),
    html: parsed.html === false ? undefined : parsed.html,
    attachments: parsed.attachments.map((attachment) => ({
      filename: attachment.filename ?? "",
      contentType: attachment.contentType,
      content: attachment.content,
    })),
  };
}

emailSenderContract("SumoPod SMTP adapter against a local TLS relay", async () => {
  const relay = await startTestSmtpRelay();
  return {
    sender: senderFor(relay),
    delivered: async () => relay.accepted.map(asDelivered),
    refuseNextSend: () => relay.refuseNextRecipient(),
    close: () => relay.close(),
  };
});

describe("SumoPod SMTP adapter", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    while (cleanups.length) await cleanups.pop()!();
  });
  async function relay(options?: { tls?: boolean }) {
    const started = await startTestSmtpRelay(options);
    cleanups.push(() => started.close());
    return started;
  }

  it("sends over implicit TLS, logged in, from Makam.co.id <no-reply@makam.co.id> with a Message-ID on makam.co.id", async () => {
    const tlsRelay = await relay();

    const { messageId } = await senderFor(tlsRelay).send({
      to: "pemesan@example.test",
      subject: "Bukti BKT-2026-000045",
      text: "Terlampir Bukti pembayaran Anda.",
      attachments: [{ filename: "BKT-2026-000045.pdf", contentType: "application/pdf", content: SAMPLE_PDF }],
    });

    expect(tlsRelay.accepted).toHaveLength(1);
    const [message] = tlsRelay.accepted;
    expect(message.overTls).toBe(true);
    expect(message.authenticatedAs).toBe(RELAY_USER);
    expect(message.envelopeFrom).toBe("no-reply@makam.co.id");
    expect(message.envelopeTo).toEqual(["pemesan@example.test"]);
    expect(message.parsed.from?.value).toEqual([{ address: "no-reply@makam.co.id", name: "Makam.co.id" }]);
    expect(message.parsed.messageId).toMatch(/^<[^@<>\s]+@makam\.co\.id>$/);
    expect(messageId).toBe(message.parsed.messageId);
    expect(message.parsed.date).toBeInstanceOf(Date);
    expect(message.raw).toMatch(/^Content-Type: application\/pdf; name=BKT-2026-000045\.pdf/m);
    expect(message.raw).toMatch(/^Content-Disposition: attachment; filename=BKT-2026-000045\.pdf/m);
  });

  it("verifies the relay's certificate: an untrusted one is refused before anything is sent", async () => {
    const tlsRelay = await relay();
    const sender = new SmtpEmailSender(settingsFor(tlsRelay)); // no trusted certificate given

    const failure = await sender.send({ to: "a@example.test", subject: "x", text: "x" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(tlsRelay.accepted).toEqual([]);
  });

  it("never falls back to plaintext: a relay without TLS gets nothing", async () => {
    const plainRelay = await relay({ tls: false });

    const failure = await senderFor(plainRelay)
      .send({ to: "a@example.test", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(plainRelay.accepted).toEqual([]);
  });

  it("a refused login throws EmailSendError (rejected) naming no credential", async () => {
    const tlsRelay = await relay();

    const failure = await senderFor(tlsRelay, { password: "wrong-password-xyz" })
      .send({ to: "a@example.test", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect(failure).toMatchObject({ kind: "rejected", responseCode: 535, code: "EAUTH" });
    const shown = `${(failure as Error).message} ${(failure as Error).stack} ${JSON.stringify(failure)}`;
    expect(shown).not.toContain("wrong-password-xyz");
    expect(shown).not.toContain(RELAY_USER);
    expect((failure as Error).cause).toBeUndefined();
  });

  it("a relay refusing the recipient gives a 550 EmailSendError with no address, body or relay reply text", async () => {
    const tlsRelay = await relay();
    tlsRelay.refuseNextRecipient();

    const failure = await senderFor(tlsRelay)
      .send({ to: "tidak-ada@example.test", subject: "Undangan Staf", text: "Undangan untuk 0812-3456-7890" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: "rejected", responseCode: 550 });
    const shown = `${(failure as Error).message} ${(failure as Error).stack} ${JSON.stringify(failure)}`;
    expect(shown).not.toContain("tidak-ada@example.test");
    expect(shown).not.toContain("0812-3456-7890");
    expect(shown).not.toContain("Mailbox unavailable");
  });

  it("a relay that cannot be reached throws EmailSendError (unavailable)", async () => {
    const closed = await relay();
    await closed.close();
    cleanups.pop();

    await expect(senderFor(closed).send({ to: "a@example.test", subject: "x", text: "x" })).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "unavailable",
    });
  });

  it("gives up on a relay that never answers within 15 s, without retrying", { timeout: 25_000 }, async () => {
    const silent = await startSilentServer();
    cleanups.push(() => silent.close());
    const startedAt = performance.now();

    const failure = await new SmtpEmailSender(settingsFor(silent))
      .send({ to: "a@example.test", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: "EmailSendError", kind: "unavailable", code: "ETIMEDOUT" });
    expect(performance.now() - startedAt).toBeLessThan(16_000);
  });

  it("writes nothing to the console while sending or failing", async () => {
    const tlsRelay = await relay();
    const written = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await senderFor(tlsRelay).send({ to: "pemesan@example.test", subject: "Kode Masuk", text: "Kode Masuk: 123456" });
    tlsRelay.refuseNextRecipient();
    await senderFor(tlsRelay)
      .send({ to: "pemesan@example.test", subject: "Kode Masuk", text: "Kode Masuk: 123456" })
      .catch(() => {});

    for (const spy of written) expect(spy).not.toHaveBeenCalled();
  });
});
