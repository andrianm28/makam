"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { aktifkanPush, matikanPush } from "./push-actions";


/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** The VAPID public key as the bytes `pushManager.subscribe()` wants. */
function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const noSubscription = () => () => {};

/** Whether this browser can take push at all (iPhone Safari cannot until Area Staf is on the Layar Utama). */
function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

const standaloneQuery = "(display-mode: standalone)";

function subscribeDisplayMode(onChange: () => void) {
  const query = window.matchMedia(standaloneQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Opened as the installed app (Android, or iPhone's navigator.standalone). */
function runsInstalled(): boolean {
  return (
    window.matchMedia(standaloneQuery).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function staffServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/staf", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export function PushPanelClient({ vapidPublicKey, knownEndpoints }: { vapidPublicKey: string; knownEndpoints: string[] }) {
  const supported = useSyncExternalStore(noSubscription, pushSupported, () => null);
  const installed = useSyncExternalStore(subscribeDisplayMode, runsInstalled, () => false);
  const [checked, setChecked] = useState<"belum" | "siap" | "gagal">("belum");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const known = knownEndpoints.join("\n");

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      const registration = await staffServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setChecked("siap");
      // A browser drops its subscription when notification permission is revoked, so a subscription means push is on.
      if (!subscription) {
        setEndpoint(null);
        return;
      }
      // This browser has push, but the Akun does not know it yet (another Akun Staf used it, or the browser renewed it).
      if (!known.split("\n").includes(subscription.endpoint)) {
        const result = await aktifkanPush(subscription.toJSON());
        if (cancelled) return;
        if (!result.ok) {
          setEndpoint(null);
          return;
        }
      }
      setEndpoint(subscription.endpoint);
    })().catch(() => {
      if (!cancelled) setChecked("gagal");
    });
    return () => {
      cancelled = true;
    };
  }, [known, supported]);

  const support =
    supported === false || checked === "gagal" ? "tidak_didukung" : checked === "siap" ? "siap" : "memeriksa";

  async function aktifkan() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Izin notifikasi ditolak di browser ini. Ubah izinnya di pengaturan situs, lalu coba lagi.");
        return;
      }
      const registration = await staffServiceWorker();
      // A subscription made with an older key cannot be reused: start afresh.
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey),
      });
      const result = await aktifkanPush(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe();
        setMessage(result.message);
        return;
      }
      setEndpoint(subscription.endpoint);
    } catch {
      setMessage("Notifikasi push tidak bisa diaktifkan di browser ini.");
    } finally {
      setBusy(false);
    }
  }

  async function matikan() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await staffServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      const current = subscription?.endpoint ?? endpoint;
      await subscription?.unsubscribe();
      if (current) {
        const result = await matikanPush(current);
        if (!result.ok) setMessage(result.message);
      }
      setEndpoint(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Pemasangan dan notifikasi push" className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      {installed ? null : (
        <div className="flex flex-col gap-2">
          <p>
            Pasang Area Staf ke layar utama agar terbuka seperti aplikasi. Di Android, pilih <em>Instal aplikasi</em> dari
            menu Chrome. Di iPhone, notifikasi push hanya berfungsi setelah Area Staf dipasang ke Layar Utama: buka di
            Safari, ketuk <em>Bagikan</em>, lalu <em>Tambahkan ke Layar Utama</em>, dan aktifkan push dari aplikasi itu.
          </p>
          {installPrompt ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
              >
                Pasang Area Staf
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {support === "tidak_didukung" ? (
          <p>Browser ini tidak mendukung notifikasi push. Peringatan Staf tetap dikirim lewat WhatsApp.</p>
        ) : support === "memeriksa" ? (
          <p className="text-muted-foreground">Memeriksa notifikasi push…</p>
        ) : endpoint ? (
          <>
            <p>Notifikasi push aktif di perangkat ini.</p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={matikan}>
              Matikan notifikasi push
            </Button>
          </>
        ) : (
          <>
            <p>Terima Peringatan Staf juga sebagai notifikasi push di perangkat ini (WhatsApp tetap dikirim).</p>
            <Button type="button" size="sm" disabled={busy} onClick={aktifkan}>
              Aktifkan notifikasi push
            </Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground">Push aktif di {knownEndpoints.length} perangkat untuk Akun ini.</p>
      {message ? (
        <p role="alert" className="text-destructive">
          {message}
        </p>
      ) : null}
    </section>
  );
}
