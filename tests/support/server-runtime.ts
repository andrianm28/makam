import { afterAll, inject } from "vitest";
import type { FakeWhatsAppSender } from "@/adapters/memory";
import { serverRuntime } from "@/server/runtime";

/**
 * The `web` process's real runtime (`serverRuntime()`) on the run's test
 * Postgres, with the test environment's in-memory fakes. For tests that drive
 * Server Actions; pair with tests/support/next-request.ts.
 */
export function testServerRuntime() {
  process.env.APP_ENV = "test";
  process.env.DATABASE_URL = inject("databaseUrl");
  afterAll(async () => {
    const holder = globalThis as unknown as { __makamRuntime?: ReturnType<typeof serverRuntime> };
    await holder.__makamRuntime?.database.close();
    delete holder.__makamRuntime;
  });
  return {
    runtime: () => serverRuntime(),
    /** Logs a number in through the identity module and returns the session cookies to store. */
    async logIn(phoneNumber: string) {
      const { identity, adapters } = serverRuntime();
      const whatsapp = adapters.whatsapp as FakeWhatsAppSender;
      await identity.requestOtp({ phoneNumber });
      const code = whatsapp.sent.filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
      if (!code) throw new Error("no OTP was sent");
      const login = await identity.verifyOtp({ phoneNumber, code });
      if (!login.ok) throw new Error(`login failed: ${login.reason}`);
      return login;
    },
  };
}
