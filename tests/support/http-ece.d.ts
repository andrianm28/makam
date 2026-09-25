/** The few bits of `http_ece` (RFC 8188) the WebPush contract test uses to decrypt what a push service received. */
declare module "http_ece" {
  import type { ECDH } from "node:crypto";

  const ece: {
    decrypt(buffer: Buffer, params: { version: "aes128gcm"; privateKey: ECDH; authSecret: string }): Buffer;
  };
  export default ece;
}
