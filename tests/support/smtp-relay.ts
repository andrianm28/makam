import { createServer, type Server, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { simpleParser, type ParsedMail } from "mailparser";
import { generate } from "selfsigned";
import { SMTPServer } from "smtp-server";
import { SmtpEmailSender, type SmtpEmailSenderOptions } from "@/adapters/live/smtp-email-sender";
import type { SmtpSettings } from "@/lib/env";
import { mailEverywhere } from "./mail-domain-resolver";

/**
 * A local stand-in for the SumoPod relay (never the real one): an in-process
 * SMTP server on 127.0.0.1 with implicit TLS and a self-signed certificate,
 * requiring AUTH, keeping every message it accepted.
 */
export const RELAY_USER = "v1-relay-user";
export const RELAY_PASSWORD = "v1-relay-password-not-real";

export interface AcceptedMessage {
  /** Whether the session was over TLS when the message arrived. */
  overTls: boolean;
  authenticatedAs: string | undefined;
  envelopeFrom: string | undefined;
  envelopeTo: string[];
  raw: string;
  parsed: ParsedMail;
}

export interface TestSmtpRelay {
  host: string;
  port: number;
  /** PEM of the relay's self-signed certificate, for a client that verifies it. */
  certificate: string;
  accepted: AcceptedMessage[];
  /** The next RCPT TO is answered 550. */
  refuseNextRecipient(): void;
  close(): Promise<void>;
}

let certificate: Promise<{ cert: string; key: string }> | undefined;

function localhostCertificate() {
  certificate ??= generate([{ name: "commonName", value: "localhost" }], {
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] },
    ],
  }).then((pems) => ({ cert: pems.cert, key: pems.private }));
  return certificate;
}

async function listen(server: { listen(port: number, host: string, cb: () => void): unknown }, address: () => AddressInfo) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return address().port;
}

/** Starts a relay speaking SMTPS (implicit TLS), or plaintext SMTP when `tls: false`. */
export async function startTestSmtpRelay(options: { tls?: boolean } = {}): Promise<TestSmtpRelay> {
  const { cert, key } = await localhostCertificate();
  const secure = options.tls ?? true;
  const accepted: AcceptedMessage[] = [];
  let refuseRecipients = 0;

  const server = new SMTPServer({
    secure,
    key: secure ? key : undefined,
    cert: secure ? cert : undefined,
    allowInsecureAuth: !secure,
    authMethods: ["PLAIN", "LOGIN"],
    logger: false,
    banner: "makam test relay",
    onAuth(auth, _session, callback) {
      if (auth.username === RELAY_USER && auth.password === RELAY_PASSWORD) {
        return callback(null, { user: auth.username });
      }
      const refused = Object.assign(new Error("Authentication failed"), { responseCode: 535 });
      return callback(refused);
    },
    onRcptTo(_address, _session, callback) {
      if (refuseRecipients > 0) {
        refuseRecipients -= 1;
        return callback(Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 }));
      }
      return callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const raw = Buffer.concat(chunks).toString("latin1");
        simpleParser(Buffer.concat(chunks))
          .then((parsed) => {
            accepted.push({
              overTls: session.secure,
              authenticatedAs: typeof session.user === "string" ? session.user : undefined,
              envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined,
              envelopeTo: session.envelope.rcptTo.map((rcpt) => rcpt.address),
              raw,
              parsed,
            });
            callback();
          })
          .catch((error: Error) => callback(error));
      });
    },
  });
  server.on("error", () => {});

  const port = await listen(server, () => server.server.address() as AddressInfo);
  return {
    host: "127.0.0.1",
    port,
    certificate: cert,
    accepted,
    refuseNextRecipient: () => {
      refuseRecipients += 1;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * The live SumoPod adapter pointed at `relay`, logged in as the relay's user. It trusts the relay's self-signed
 * certificate when the relay has one, and asks a DNS in which every domain has a mail host, so a test of the adapter
 * that is not about the address check depends neither on the network nor on what its recipient's domain resolves to.
 */
export function liveSenderFor(
  relay: { host: string; port: number; certificate?: string },
  settings: Partial<SmtpSettings> = {},
  options: Partial<SmtpEmailSenderOptions> = {},
): SmtpEmailSender {
  return new SmtpEmailSender(
    {
      host: relay.host,
      port: relay.port,
      user: RELAY_USER,
      password: RELAY_PASSWORD,
      from: { address: "no-reply@makam.co.id", name: "Makam.co.id" },
      ...settings,
    },
    { trustedCertificate: relay.certificate, resolver: mailEverywhere, ...options },
  );
}

/** A TCP server that accepts connections and never says anything: a relay that hangs. */
export async function startSilentServer(): Promise<{ host: string; port: number; close(): Promise<void> }> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
  });
  const port = await listen(server, () => server.address() as AddressInfo);
  return {
    host: "127.0.0.1",
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
