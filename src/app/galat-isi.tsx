"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { galatHalaman, isStaleActionByName } from "./galat-halaman";

export function isStaleAction(error: unknown): boolean {
  return unstable_isUnrecognizedActionError(error) || isStaleActionByName(error);
}

/** The shared body of both error pages; plain elements and inline styles so it works without the layout. */
export function GalatIsi({ stale, retry }: { stale: boolean; retry: () => void }) {
  const page = galatHalaman(stale);
  const button = { padding: "0.6rem 1.2rem", border: 0, borderRadius: 6, background: "#1f3d2b", color: "#fff", fontSize: "1rem", cursor: "pointer" };
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem" }}>{page.heading}</h1>
      <p>{page.body}</p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", alignItems: "center" }}>
        <button type="button" style={button} onClick={() => (stale ? window.location.reload() : retry())}>
          Muat ulang
        </button>
        {/* A plain link on purpose: after an error a full page load is what we want, and global-error has no router. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {page.showBeranda ? <a href="/">Beranda</a> : null}
      </div>
    </main>
  );
}
