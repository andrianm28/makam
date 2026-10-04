import { Resolver } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailSenderContract, SAMPLE_PDF, type DeliveredEmail } from "@/adapters/email-sender.contract";
import { EmailSendError } from "@/ports/email-sender";
import {
  liveSenderFor,
  RELAY_USER,
  startSilentServer,
  startTestSmtpRelay,
  type AcceptedMessage,
} from "../../../tests/support/smtp-relay";
import type { MailDomainResolver } from "./mail-domain";

/**
 * No test in this file may depend on the network's DNS. Under this guard the system resolver, which a sender uses when
 * a test gives it none, answers "no such domain" to every name: a test that forgets its own resolver then fails the
 * same way on every runner, instead of passing or failing with what the runner's DNS happens to say about its recipient.
 */
beforeEach(() => {
  const noSuchDomain = Object.assign(new Error("query failed: ENOTFOUND"), { code: "ENOTFOUND" });
  vi.spyOn(Resolver.prototype, "resolveMx").mockRejectedValue(noSuchDomain);
  vi.spyOn(Resolver.prototype, "resolve4").mockRejectedValue(noSuchDomain);
  vi.spyOn(Resolver.prototype, "resolve6").mockRejectedValue(noSuchDomain);
});
afterEach(() => {
  vi.restoreAllMocks();
});

type MxRecord = { exchange: string; priority: number };
/** What a lookup of one record type gives: the records, or a failure with the c-ares code the resolver would report. */
type Lookup<T> = T[] | { failing: string };
type DnsEntry = { mx?: Lookup<MxRecord>; a?: Lookup<string>; aaaa?: Lookup<string> };

/** What the resolver reports when it has no answer: `code` is c-ares' (ENOTFOUND: no such domain, ENODATA: none of that type). */
function dnsFailure(code: string): Error {
  return Object.assign(new Error(`query failed: ${code}`), { code });
}

/** A domain whose every lookup fails with `code`, as a resolver does when its servers are down. */
const dnsDown = (code: string): DnsEntry => ({ mx: { failing: code }, a: { failing: code }, aaaa: { failing: code } });

/**
 * A DNS that knows only `zone`, keyed by the domain as DNS spells it (lower case, ASCII, no root dot): a name outside
 * it does not exist, and a record type a name lacks has no data, the way c-ares answers.
 */
function dnsWith(zone: Record<string, DnsEntry>): MailDomainResolver {
  function lookup<T>(domain: string, type: keyof DnsEntry): Promise<T[]> {
    const entry = zone[domain];
    if (entry === undefined) return Promise.reject(dnsFailure("ENOTFOUND"));
    const answer = entry[type] as Lookup<T> | undefined;
    if (answer === undefined) return Promise.reject(dnsFailure("ENODATA"));
    return Array.isArray(answer) ? Promise.resolve(answer) : Promise.reject(dnsFailure(answer.failing));
  }
  return {
    resolveMx: (domain) => lookup(domain, "mx"),
    resolve4: (domain) => lookup(domain, "a"),
    resolve6: (domain) => lookup(domain, "aaaa"),
  };
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
    sender: liveSenderFor(relay),
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

    const { messageId } = await liveSenderFor(tlsRelay).send({
      to: "pemesan@contoh.co.id",
      subject: "Bukti BKT-2026-000045",
      text: "Terlampir Bukti pembayaran Anda.",
      attachments: [{ filename: "BKT-2026-000045.pdf", contentType: "application/pdf", content: SAMPLE_PDF }],
    });

    expect(tlsRelay.accepted).toHaveLength(1);
    const [message] = tlsRelay.accepted;
    expect(message.overTls).toBe(true);
    expect(message.authenticatedAs).toBe(RELAY_USER);
    expect(message.envelopeFrom).toBe("no-reply@makam.co.id");
    expect(message.envelopeTo).toEqual(["pemesan@contoh.co.id"]);
    expect(message.parsed.from?.value).toEqual([{ address: "no-reply@makam.co.id", name: "Makam.co.id" }]);
    expect(message.parsed.messageId).toMatch(/^<[^@<>\s]+@makam\.co\.id>$/);
    expect(messageId).toBe(message.parsed.messageId);
    expect(message.parsed.date).toBeInstanceOf(Date);
    expect(message.raw).toMatch(/^Content-Type: application\/pdf; name=BKT-2026-000045\.pdf/m);
    expect(message.raw).toMatch(/^Content-Disposition: attachment; filename=BKT-2026-000045\.pdf/m);
  });

  it("verifies the relay's certificate: an untrusted one is refused before anything is sent", async () => {
    const tlsRelay = await relay();
    const sender = liveSenderFor({ host: tlsRelay.host, port: tlsRelay.port }); // no trusted certificate given

    const failure = await sender.send({ to: "a@contoh.co.id", subject: "x", text: "x" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(tlsRelay.accepted).toEqual([]);
  });

  it("never falls back to plaintext: a relay without TLS gets nothing", async () => {
    const plainRelay = await relay({ tls: false });

    const failure = await liveSenderFor(plainRelay)
      .send({ to: "a@contoh.co.id", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).kind).toBe("unavailable");
    expect(plainRelay.accepted).toEqual([]);
  });

  it("a refused login throws EmailSendError (rejected) naming no credential", async () => {
    const tlsRelay = await relay();

    const failure = await liveSenderFor(tlsRelay, { password: "wrong-password-xyz" })
      .send({ to: "a@contoh.co.id", subject: "x", text: "x" })
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

    const failure = await liveSenderFor(tlsRelay)
      .send({ to: "tidak-ada@contoh.co.id", subject: "Undangan Staf", text: "Undangan untuk 0812-3456-7890" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: "rejected", responseCode: 550 });
    const shown = `${(failure as Error).message} ${(failure as Error).stack} ${JSON.stringify(failure)}`;
    expect(shown).not.toContain("tidak-ada@contoh.co.id");
    expect(shown).not.toContain("0812-3456-7890");
    expect(shown).not.toContain("Mailbox unavailable");
  });

  it("a relay that cannot be reached throws EmailSendError (unavailable)", async () => {
    const closed = await relay();
    await closed.close();
    cleanups.pop();

    await expect(liveSenderFor(closed).send({ to: "a@contoh.co.id", subject: "x", text: "x" })).rejects.toMatchObject({
      name: "EmailSendError",
      kind: "unavailable",
    });
  });

  it("gives up on a relay that never answers within 15 s, without retrying", { timeout: 25_000 }, async () => {
    const silent = await startSilentServer();
    cleanups.push(() => silent.close());
    const startedAt = performance.now();

    const failure = await liveSenderFor(silent)
      .send({ to: "a@contoh.co.id", subject: "x", text: "x" })
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: "EmailSendError", kind: "unavailable", code: "ETIMEDOUT" });
    expect(performance.now() - startedAt).toBeLessThan(16_000);
  });

  it("writes nothing to the console while sending or failing", async () => {
    const tlsRelay = await relay();
    const written = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await liveSenderFor(tlsRelay).send({ to: "pemesan@contoh.co.id", subject: "Kode Masuk", text: "Kode Masuk: 123456" });
    tlsRelay.refuseNextRecipient();
    await liveSenderFor(tlsRelay)
      .send({ to: "pemesan@contoh.co.id", subject: "Kode Masuk", text: "Kode Masuk: 123456" })
      .catch(() => {});

    for (const spy of written) expect(spy).not.toHaveBeenCalled();
  });

  describe("an address that cannot receive mail", () => {
    /** A relay that is not there: a sender that tried to connect would fail as `unavailable`, not `rejected`. */
    async function absentRelay() {
      const gone = await relay();
      await gone.close();
      cleanups.pop();
      return gone;
    }

    it.each([
      "keluarga@contoh.makam.invalid",
      "keluarga@contoh.test",
      "keluarga@contoh.example",
      "keluarga@contoh.localhost",
      "keluarga@localhost",
      "KELUARGA@Contoh.Makam.INVALID",
      "keluarga@contoh.makam.invalid.",
      "Keluarga <keluarga@contoh.makam.invalid>",
    ])("a Kode Masuk to %s is refused as rejected before the relay is contacted", async (to) => {
      const failure = await liveSenderFor(await absentRelay())
        .send({ to, subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(EmailSendError);
      expect((failure as EmailSendError).kind).toBe("rejected");
    });

    it("a relay that would accept a reserved name still gets nothing: the Kode Masuk says gagal kirim, not terkirim", async () => {
      const acceptingRelay = await relay();

      await expect(
        liveSenderFor(acceptingRelay).send({ to: "keluarga@contoh.makam.invalid", subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" }),
      ).rejects.toMatchObject({ name: "EmailSendError", kind: "rejected" });

      expect(acceptingRelay.accepted).toEqual([]);
    });

    it.each(["keluarga@invalid.co.id", "keluarga@test.co.id", "keluarga@example.co.id", "keluarga@localhost.co.id"])(
      "%s is sent: a reserved word that is not the last part of the domain does not make it one",
      async (to) => {
        const acceptingRelay = await relay();

        await liveSenderFor(acceptingRelay).send({ to, subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" });

        expect(acceptingRelay.accepted.map((message) => message.envelopeTo)).toEqual([[to]]);
      },
    );

    it.each(["keluarga", "keluarga@", "keluarga@[192.0.2.7]"])(
      "a recipient with no domain DNS could name (%s) is left to the relay: the check does not refuse it",
      async (to) => {
        // The DNS here knows no domain at all, so a name the check had looked up would be refused as rejected; a sender
        // that went on to the relay, which is not there, fails as unavailable.
        const failure = await liveSenderFor(await absentRelay(), {}, { resolver: dnsWith({}) })
          .send({ to, subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" })
          .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(EmailSendError);
        expect((failure as EmailSendError).kind).toBe("unavailable");
      },
    );

    it.each<[string, Record<string, DnsEntry>]>([
      ["the domain does not exist", {}],
      ["the domain has no MX, A or AAAA record", { "tidak-ada.co.id": {} }],
      ["the domain publishes a null MX, which says it takes no mail, whatever else it has", { "tidak-ada.co.id": { mx: [{ exchange: "", priority: 0 }], a: ["192.0.2.7"] } }],
      ["the domain publishes a null MX written as the root", { "tidak-ada.co.id": { mx: [{ exchange: ".", priority: 0 }] } }],
    ])("a Kode Masuk is refused as rejected before the relay is contacted when %s", async (_why, zone) => {
      const failure = await liveSenderFor(await absentRelay(), {}, { resolver: dnsWith(zone) })
        .send({ to: "keluarga@tidak-ada.co.id", subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(EmailSendError);
      expect((failure as EmailSendError).kind).toBe("rejected");
    });

    it.each<[string, DnsEntry]>([
      ["an MX record", { mx: [{ exchange: "mail.keluarga.co.id", priority: 10 }] }],
      ["no MX but an A record: the domain's own address takes its mail", { a: ["192.0.2.7"] }],
      ["no MX but an AAAA record", { aaaa: ["2001:db8::7"] }],
    ])("a Kode Masuk to a domain with %s is sent", async (_what, entry) => {
      const acceptingRelay = await relay();

      await liveSenderFor(acceptingRelay, {}, { resolver: dnsWith({ "keluarga.co.id": entry }) }).send({
        to: "pemesan@keluarga.co.id",
        subject: "Kode Masuk",
        text: "Kode Masuk Anda: 123456",
      });

      expect(acceptingRelay.accepted.map((message) => message.envelopeTo)).toEqual([["pemesan@keluarga.co.id"]]);
    });

    it("looks the domain up as DNS spells it: in lower case and in ASCII", async () => {
      const acceptingRelay = await relay();
      const resolver = dnsWith({ "keluarga.co.id": { a: ["192.0.2.7"] }, "xn--m-eha.co.id": { a: ["192.0.2.8"] } });
      const sender = liveSenderFor(acceptingRelay, {}, { resolver });

      await sender.send({ to: "pemesan@KELUARGA.Co.Id", subject: "Satu", text: "1" });
      await sender.send({ to: "pemesan@mü.co.id", subject: "Dua", text: "2" });

      expect(acceptingRelay.accepted.map((message) => message.parsed.subject)).toEqual(["Satu", "Dua"]);
    });

    it.each(["ESERVFAIL", "ETIMEOUT", "ECONNREFUSED", "EREFUSED", "ECANCELLED"])(
      "a Kode Masuk goes out when DNS fails with %s: the check cannot tell, so the relay decides",
      async (code) => {
        const acceptingRelay = await relay();

        await liveSenderFor(acceptingRelay, {}, { resolver: dnsWith({ "keluarga.co.id": dnsDown(code) }) }).send({
          to: "pemesan@keluarga.co.id",
          subject: "Kode Masuk",
          text: "Kode Masuk Anda: 123456",
        });

        expect(acceptingRelay.accepted.map((message) => message.envelopeTo)).toEqual([["pemesan@keluarga.co.id"]]);
      },
    );

    it.each<[string, DnsEntry]>([
      ["the MX lookup fails and the domain has an A record", { mx: { failing: "ESERVFAIL" }, a: ["192.0.2.7"] }],
      ["the domain has no MX or AAAA and its A lookup times out", { a: { failing: "ETIMEOUT" } }],
      ["the MX lookup times out and the domain has no A or AAAA record", { mx: { failing: "ETIMEOUT" } }],
    ])("a Kode Masuk goes out when %s: one failed lookup keeps the check from saying no", async (_what, entry) => {
      const acceptingRelay = await relay();

      await liveSenderFor(acceptingRelay, {}, { resolver: dnsWith({ "keluarga.co.id": entry }) }).send({
        to: "pemesan@keluarga.co.id",
        subject: "Kode Masuk",
        text: "Kode Masuk Anda: 123456",
      });

      expect(acceptingRelay.accepted).toHaveLength(1);
    });

    it("a DNS that never answers cannot hold a Kode Masuk back: when the check's time is up the send goes ahead", async () => {
      const acceptingRelay = await relay();
      const silent = () => new Promise<never>(() => {});

      await liveSenderFor(
        acceptingRelay,
        {},
        { resolver: { resolveMx: silent, resolve4: silent, resolve6: silent }, addressCheckTimeoutMs: 50 },
      ).send({ to: "pemesan@keluarga.co.id", subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" });

      expect(acceptingRelay.accepted).toHaveLength(1);
    });
  });
});
