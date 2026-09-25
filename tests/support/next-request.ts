/**
 * A stand-in for `next/headers` in Vitest, where there is no Next.js request.
 * The request's cookies live in one jar that Server Actions read (`headers()`,
 * `cookies()`) and write (`cookies().set` / `.delete`), as a browser would.
 *
 * Use in a test file:
 *   vi.mock("server-only", () => ({}));
 *   vi.mock("next/headers", () => import("<path>/tests/support/next-request"));
 */
const jar = new Map<string, string>();

export const browser = {
  /** A fresh browser: no cookies. */
  reset(): void {
    jar.clear();
  },
  /** Stores cookies as the browser would after a Set-Cookie. */
  store(cookies: { name: string; value: string }[]): void {
    for (const cookie of cookies) jar.set(cookie.name, cookie.value);
  },
  /** The Cookie header the browser sends now. */
  cookieHeader(): string {
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  },
  has(name: string): boolean {
    return jar.has(name);
  },
};

export async function headers(): Promise<Headers> {
  return new Headers(jar.size > 0 ? { cookie: browser.cookieHeader() } : {});
}

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  };
}
