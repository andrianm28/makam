export class PortNotConfiguredError extends Error {
  constructor(port: string) {
    super(
      `${port} has no live adapter configured. Staging and production never fall back to a fake; ` +
        `wire the live adapter in src/composition/adapters.ts.`,
    );
    this.name = "PortNotConfiguredError";
  }
}

/** Every port instance `notConfigured` handed out, so `isPortConfigured` can tell them apart from a real adapter. */
const unconfiguredPorts = new WeakSet<object>();

/**
 * Stands in for a port whose live adapter is not built yet (SumoPod, kirim.dev,
 * S3 arrive in later tickets). Every method call
 * rejects, so staging and production fail loudly instead of silently faking a send.
 */
export function notConfigured<T extends object>(port: string): T {
  const stub = new Proxy({} as T, {
    get(_target, property) {
      if (property === "then") return undefined; // not a thenable
      return async () => {
        throw new PortNotConfiguredError(port);
      };
    },
  });
  unconfiguredPorts.add(stub as object);
  return stub;
}

/**
 * True for a real adapter (live or fake), false for a `notConfigured` stand-in.
 * Lets a page decide up front whether to offer an action at all (e.g. the
 * Denah site-plan photo upload) instead of only finding out when a call to it
 * throws `PortNotConfiguredError`.
 */
export function isPortConfigured(port: object): boolean {
  return !unconfiguredPorts.has(port);
}
