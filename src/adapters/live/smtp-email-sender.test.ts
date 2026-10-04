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
import { SmtpEmailSender, type RecipientResolver } from "./smtp-email-sender";

/** Every domain is deliverable (an MX record exists). */
const deliverable: RecipientResolver = { resolveMx: async () => [{ exchange: "mx.example.com" }], resolveAddresses: async () => [] };

function dnsError(code: string) {
  return Object.assign(new Error(code), { code });
}

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
function senderFor(relay: TestSmtpRelay, overrides: Partial<SmtpSettings> = {}, resolver: RecipientResolver = deliverable) {
  return new SmtpEmailSender(settingsFor(relay, overrides), { trustedCertificate: relay.certificate, resolver });
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
      to: "pemesan@example.com",
      subject: "Bukti BKT-2026-000045",
      text: "Terlampir Bukti pembayaran Anda.",
      attachments: [{ filename: "BKT-2026-000045.pdf", contentType: "application/pdf", content: SAMPLE_PDF }],
    });

    expect(tlsRelay.accepted).toHaveLength(1);
    const [message] = tlsRelay.accepted;
    expect(message.overTls).toBe(true);
    expect(message.authenticatedAs).toBe(RELAY_USER);
    expect(message.envelopeFrom).toBe("no-reply@makam.co.id");
    expect(message.envelopeTo).toEqual(["pemesan@example.com"]);
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

    const failure = await sender.send({ to: "a@example.com", subject: "x", text: "x" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(tlsRelay.accepted).toEqual([]);
  });

  it("never falls back to plaintext: a relay without TLS gets nothing", async () => {
    const plainRelay = await relay({ tls: false });

    const failure = await senderFor(plainRelay)
      .send({ to: "a@example.com", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(plainRelay.accepted).toEqual([]);
  });

  it("a refused login throws EmailSendError (rejected) naming no credential", async () => {
    const tlsRelay = await relay();

    const failure = await senderFor(tlsRelay, { password: "wrong-password-xyz" })
      .send({ to: "a@example.com", subject: "x", text: "x" })
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
      .send({ to: "tidak-ada@example.com", subject: "Undangan Staf", text: "Undangan untuk 0812-3456-7890" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: "rejected", responseCode: 550 });
    const shown = `${(failure as Error).message} ${(failure as Error).stack} ${JSON.stringify(failure)}`;
    expect(shown).not.toContain("tidak-ada@example.com");
    expect(shown).not.toContain("0812-3456-7890");
    expect(shown).not.toContain("Mailbox unavailable");
  });

  it("a relay that cannot be reached throws EmailSendError (unavailable)", async () => {
    const closed = await relay();
    await closed.close();
    cleanups.pop();

    await expect(senderFor(closed).send({ to: "a@example.com", subject: "x", text: "x" })).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "unavailable",
    });
  });

  it("gives up on a relay that never answers within 15 s, without retrying", { timeout: 25_000 }, async () => {
    const silent = await startSilentServer();
    cleanups.push(() => silent.close());
    const startedAt = performance.now();

    const failure = await new SmtpEmailSender(settingsFor(silent))
      .send({ to: "a@example.com", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: "EmailSendError", kind: "unavailable", code: "ETIMEDOUT" });
    expect(performance.now() - startedAt).toBeLessThan(16_000);
  });

  it("writes nothing to the console while sending or failing", async () => {
    const tlsRelay = await relay();
    const written = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await senderFor(tlsRelay).send({ to: "pemesan@example.com", subject: "Kode Masuk", text: "Kode Masuk: 123456" });
    tlsRelay.refuseNextRecipient();
    await senderFor(tlsRelay)
      .send({ to: "pemesan@example.com", subject: "Kode Masuk", text: "Kode Masuk: 123456" })
      .catch(() => {});

    for (const spy of written) expect(spy).not.toHaveBeenCalled();
  });
});

describe("SumoPod SMTP adapter recipient check", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  async function relayWith(resolver: RecipientResolver) {
    const started = await startTestSmtpRelay();
    cleanups.push(() => started.close());
    return { relay: started, sender: senderFor(started, {}, resolver) };
  }
  const send = (sender: SmtpEmailSender, to: string) => sender.send({ to, subject: "Kode Masuk", text: "123456" });
  const noRecords: RecipientResolver = {
    resolveMx: async () => Promise.reject(dnsError("ENODATA")),
    resolveAddresses: async () => Promise.reject(dnsError("ENOTFOUND")),
  };

  it.each(["a@mail.invalid", "a@mail.test", "a@mail.example", "a@mail.localhost", "Nama <a@MAIL.TEST>"])(
    "refuses %s as rejected without looking up DNS and without contacting the relay",
    async (to) => {
      const unused: RecipientResolver = {
        resolveMx: async () => Promise.reject(new Error("must not be called")),
        resolveAddresses: async () => Promise.reject(new Error("must not be called")),
      };
      const { relay, sender } = await relayWith(unused);
      const failure = await send(sender, to).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(EmailSendError);
      expect((failure as EmailSendError).kind).toBe("rejected");
      expect(String((failure as Error).message) + JSON.stringify(failure)).not.toContain("a@");
      expect(relay.accepted).toHaveLength(0);
    },
  );

  it("refuses a domain with neither MX nor A/AAAA records as rejected and the relay receives nothing", async () => {
    const { relay, sender } = await relayWith(noRecords);
    await expect(send(sender, "a@tidak-ada.example.com")).rejects.toMatchObject({ kind: "rejected" });
    expect(relay.accepted).toHaveLength(0);
  });

  it("accepts a domain that has only an A record", async () => {
    const { relay, sender } = await relayWith({
      resolveMx: async () => Promise.reject(dnsError("ENODATA")),
      resolveAddresses: async () => ["192.0.2.1"],
    });
    await send(sender, "a@example.com");
    expect(relay.accepted).toHaveLength(1);
  });

  it.each(["ETIMEOUT", "ESERVFAIL", "SOMETHING_ELSE"])("lets the send go ahead when DNS fails with %s", async (code) => {
    const { relay, sender } = await relayWith({
      resolveMx: async () => Promise.reject(dnsError(code)),
      resolveAddresses: async () => Promise.reject(dnsError(code)),
    });
    await send(sender, "a@example.com");
    expect(relay.accepted).toHaveLength(1);
  });

  it("does not consult DNS for an address whose domain cannot be parsed (the relay judges it)", async () => {
    let lookups = 0;
    const counting: RecipientResolver = {
      resolveMx: async () => (lookups++, Promise.reject(dnsError("ENOTFOUND"))),
      resolveAddresses: async () => (lookups++, Promise.reject(dnsError("ENOTFOUND"))),
    };
    const { sender } = await relayWith(counting);
    const failure = await send(sender, "tanpa-domain").catch((error: unknown) => error);
    expect(lookups).toBe(0);
    expect((failure as { code?: string } | undefined)?.code).not.toBe("ENOTFOUND");
  });
});
