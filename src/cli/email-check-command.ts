import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SmtpEmailSender } from "@/adapters/live/smtp-email-sender";
import { readEmailEnv, type SmtpSettings } from "@/lib/env";
import { EmailSendError, type EmailSender } from "@/ports/email-sender";

const USAGE = "Pakai: email-check <alamat-email-tujuan>";
const MISSING = "SMTP_USER, SMTP_PASSWORD dan EMAIL_FROM belum diatur; tidak ada yang dikirim.";

const argsSchema = z.tuple([z.email()]);

export interface EmailCheckDeps {
  createSender?: (smtp: SmtpSettings) => EmailSender;
}

/**
 * Sends one real test email through the live EmailSender (the SumoPod SMTP
 * relay), so an Operator can read its received headers: DKIM for makam.co.id,
 * SPF and DMARC. Prints the Message-ID to look for, never the address.
 */
export async function emailCheckCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  deps: EmailCheckDeps = {},
): Promise<{ exitCode: number; output: string }> {
  const args = argsSchema.safeParse(argv);
  if (!args.success) return { exitCode: 2, output: USAGE };
  const [to] = args.data;

  let smtp: SmtpSettings | undefined;
  try {
    smtp = readEmailEnv(source).smtp;
  } catch {
    return { exitCode: 78, output: MISSING };
  }
  if (!smtp) return { exitCode: 78, output: MISSING };

  const sender = (deps.createSender ?? ((settings) => new SmtpEmailSender(settings)))(smtp);
  const check = randomBytes(4).toString("hex");
  try {
    const { messageId } = await sender.send({
      to,
      subject: `[makam v1] email-check ${check}`,
      text: [
        "Email uji dari makam.co.id v1 (npm run email-check).",
        `Kode cek: ${check}`,
        "Periksa header: DKIM-Signature d=makam.co.id, Authentication-Results dkim=pass, spf=pass, dmarc=pass.",
      ].join("\n"),
    });
    return {
      exitCode: 0,
      output: `Email uji ${check} diterima relay ${smtp.host}:${smtp.port}, Message-ID ${messageId}. Periksa header DKIM, SPF dan DMARC di kotak masuk tujuan.`,
    };
  } catch (error) {
    if (error instanceof EmailSendError) return { exitCode: 1, output: `Gagal kirim: ${error.message}.` };
    throw error;
  }
}
