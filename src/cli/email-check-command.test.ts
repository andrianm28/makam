import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SmtpEmailSender } from "@/adapters/live/smtp-email-sender";
import { mailEverywhere } from "../../tests/support/mail-domain-resolver";
import { RELAY_PASSWORD, RELAY_USER, startTestSmtpRelay, type TestSmtpRelay } from "../../tests/support/smtp-relay";
import { emailCheckCommand } from "./email-check-command";

describe("npm run email-check -- <to>", () => {
  let relay: TestSmtpRelay;
  beforeEach(async () => {
    relay = await startTestSmtpRelay();
  });
  afterEach(() => relay.close());

  const env = () => ({
    APP_ENV: "staging",
    SMTP_HOST: relay.host,
    SMTP_PORT: String(relay.port),
    SMTP_USER: RELAY_USER,
    SMTP_PASSWORD: RELAY_PASSWORD,
    EMAIL_FROM: "no-reply@makam.co.id",
  });
  // The local relay's self-signed certificate is trusted here; on staging the system roots verify SumoPod's.
  const deps = () => ({
    createSender: (smtp: ConstructorParameters<typeof SmtpEmailSender>[0]) =>
      new SmtpEmailSender(smtp, { trustedCertificate: relay.certificate, resolver: mailEverywhere }),
  });

  it("sends one test email through the relay and prints its Message-ID, not the address", async () => {
    const result = await emailCheckCommand(["operator@contoh.co.id"], env(), deps());

    expect(result.exitCode).toBe(0);
    expect(relay.accepted).toHaveLength(1);
    const [message] = relay.accepted;
    expect(message.envelopeTo).toEqual(["operator@contoh.co.id"]);
    expect(message.parsed.subject).toMatch(/^\[makam v1\] email-check [0-9a-f]{8}$/);
    expect(message.parsed.from?.value).toEqual([{ address: "no-reply@makam.co.id", name: "Makam.co.id" }]);
    expect(result.output).toContain(message.parsed.messageId!);
    expect(result.output).not.toContain("operator@contoh.co.id");
  });

  it("refuses without a valid recipient address", async () => {
    expect(await emailCheckCommand([], env(), deps())).toMatchObject({ exitCode: 2 });
    expect(await emailCheckCommand(["bukan-email"], env(), deps())).toMatchObject({ exitCode: 2 });
    expect(relay.accepted).toEqual([]);
  });

  it("stops when the SMTP settings are missing, sending nothing", async () => {
    const result = await emailCheckCommand(["operator@contoh.co.id"], { APP_ENV: "development" }, deps());

    expect(result.exitCode).toBe(78);
    expect(result.output).toMatch(/SMTP_USER/);
    expect(relay.accepted).toEqual([]);
  });

  it("refuses an address that cannot receive mail without contacting the relay", async () => {
    const result = await emailCheckCommand(["operator@contoh.makam.invalid"], env(), deps());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/Gagal kirim: .*rejected/);
    expect(result.output).not.toContain("operator@contoh.makam.invalid");
    expect(relay.accepted).toEqual([]);
  });

  it("reports a refused send by its codes only", async () => {
    relay.refuseNextRecipient();

    const result = await emailCheckCommand(["operator@contoh.co.id"], env(), deps());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/rejected.*550/);
    expect(result.output).not.toContain("operator@contoh.co.id");
    expect(result.output).not.toContain(RELAY_PASSWORD);
  });
});
