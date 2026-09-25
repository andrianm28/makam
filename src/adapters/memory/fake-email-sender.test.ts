import { emailSenderContract } from "@/adapters/email-sender.contract";
import { FakeEmailSender } from "./fake-senders";

emailSenderContract("in-memory fake", async () => {
  const sender = new FakeEmailSender();
  return {
    sender,
    delivered: async () =>
      sender.sent.map((email) => ({
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: (email.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          content: Buffer.from(attachment.content),
        })),
      })),
    refuseNextSend: () => sender.failNextSend(),
    close: async () => {},
  };
});
