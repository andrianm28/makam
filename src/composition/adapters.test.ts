import { describe, expect, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import { FakePaymentProvider, FakeWhatsAppSender } from "@/adapters/memory";
import { PortNotConfiguredError } from "@/adapters/live/not-configured";
import { createAdapters } from "./adapters";

describe("composition root", () => {
  it("wires the in-memory fakes outside production", () => {
    const adapters = createAdapters({ appEnv: "development" });

    expect(adapters.clock).toBeInstanceOf(SystemClock);
    expect(adapters.payments).toBeInstanceOf(FakePaymentProvider);
    expect(adapters.whatsapp).toBeInstanceOf(FakeWhatsAppSender);
  });

  it("never wires a fake in production: a port without a live adapter refuses to run", async () => {
    const adapters = createAdapters({ appEnv: "production" });

    expect(adapters.clock).toBeInstanceOf(SystemClock);
    await expect(
      adapters.whatsapp.sendTemplate({ to: "+6281234567890", template: "t", language: "id", parameters: [] }),
    ).rejects.toBeInstanceOf(PortNotConfiguredError);
    await expect(
      adapters.payments.createPayment({ reference: "TAG-1", amountRupiah: 1, description: "x" }),
    ).rejects.toBeInstanceOf(PortNotConfiguredError);
  });

  it("lets a test inject its own Clock and fakes", () => {
    const whatsapp = new FakeWhatsAppSender();
    const adapters = createAdapters({ appEnv: "test", overrides: { whatsapp } });
    expect(adapters.whatsapp).toBe(whatsapp);
  });
});
