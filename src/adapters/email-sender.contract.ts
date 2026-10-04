import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmailSendError, type EmailSender } from "@/ports/email-sender";

/** What arrived at the recipient's side, however the harness reads it back. */
export interface DeliveredEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments: { filename: string; contentType: string; content: Buffer }[];
}

export interface EmailSenderHarness {
  sender: EmailSender;
  /** Everything delivered so far, oldest first. */
  delivered(): Promise<DeliveredEmail[]>;
  /** The next send is refused by the relay at send time (e.g. 550 on RCPT TO). */
  refuseNextSend(): void;
  close(): Promise<void>;
}

/** A small but real PDF, standing in for a Tagihan or Bukti copy. */
export const SAMPLE_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

/**
 * The EmailSender contract: the same assertions for the fake and every live
 * adapter, so the fake the domain tests rely on behaves like the real relay.
 */
export function emailSenderContract(name: string, createHarness: () => Promise<EmailSenderHarness>) {
  describe(`EmailSender contract: ${name}`, () => {
    let harness: EmailSenderHarness;
    beforeEach(async () => {
      harness = await createHarness();
    });
    afterEach(async () => {
      await harness.close();
    });

    it("delivers a Tagihan copy with subject, text, HTML and its PDF, and returns a message id", async () => {
      const { messageId } = await harness.sender.send({
        to: "pemesan@example.com",
        subject: "Tagihan TAG-2026-000123",
        text: "Terlampir Tagihan Anda.",
        html: "<p>Terlampir <b>Tagihan</b> Anda.</p>",
        attachments: [{ filename: "TAG-2026-000123.pdf", contentType: "application/pdf", content: SAMPLE_PDF }],
      });

      expect(messageId).toMatch(/\S/);
      const [email] = await harness.delivered();
      expect(email).toMatchObject({
        to: "pemesan@example.com",
        subject: "Tagihan TAG-2026-000123",
        text: "Terlampir Tagihan Anda.",
        html: "<p>Terlampir <b>Tagihan</b> Anda.</p>",
      });
      expect(email.attachments).toHaveLength(1);
      expect(email.attachments[0]).toMatchObject({ filename: "TAG-2026-000123.pdf", contentType: "application/pdf" });
      expect(Buffer.compare(email.attachments[0].content, SAMPLE_PDF)).toBe(0);
    });

    it("delivers a text-only Kode Masuk email with no attachments", async () => {
      await harness.sender.send({ to: "staf@example.com", subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" });

      const [email] = await harness.delivered();
      expect(email).toMatchObject({ to: "staf@example.com", subject: "Kode Masuk", text: "Kode Masuk Anda: 123456" });
      expect(email.html).toBeUndefined();
      expect(email.attachments).toEqual([]);
    });

    it("gives every email its own message id", async () => {
      const first = await harness.sender.send({ to: "a@example.com", subject: "Satu", text: "1" });
      const second = await harness.sender.send({ to: "a@example.com", subject: "Dua", text: "2" });
      expect(first.messageId).not.toBe(second.messageId);
    });

    it("a send refused by the relay throws EmailSendError (gagal kirim), carrying no address or body", async () => {
      harness.refuseNextSend();

      const failure = await harness.sender
        .send({ to: "ditolak@example.com", subject: "Kode Masuk", text: "Kode Masuk Anda: 654321" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(EmailSendError);
      expect((failure as EmailSendError).kind).toBe("rejected");
      const shown = `${(failure as Error).message} ${JSON.stringify(failure)}`;
      expect(shown).not.toContain("ditolak@example.com");
      expect(shown).not.toContain("654321");
      expect(await harness.delivered()).toEqual([]);
    });

    it("a refused send does not affect the next one, and nothing is retried", async () => {
      harness.refuseNextSend();
      await expect(harness.sender.send({ to: "a@example.com", subject: "Satu", text: "1" })).rejects.toBeInstanceOf(
        EmailSendError,
      );
      await harness.sender.send({ to: "a@example.com", subject: "Dua", text: "2" });

      expect((await harness.delivered()).map((email) => email.subject)).toEqual(["Dua"]);
    });
  });
}
