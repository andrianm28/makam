export class PortNotConfiguredError extends Error {
  constructor(port: string) {
    super(
      `${port} has no live adapter configured. Production never falls back to a fake; ` +
        `wire the live adapter in src/composition/adapters.ts.`,
    );
    this.name = "PortNotConfiguredError";
  }
}

/**
 * Stands in for a port whose live adapter is not built yet (SumoPod, kirim.dev,
 * SES, web push, S3, PDF arrive in later tickets). Every method call
 * rejects, so production fails loudly instead of silently faking a send.
 */
export function notConfigured<T extends object>(port: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (property === "then") return undefined; // not a thenable
      return async () => {
        throw new PortNotConfiguredError(port);
      };
    },
  });
}
