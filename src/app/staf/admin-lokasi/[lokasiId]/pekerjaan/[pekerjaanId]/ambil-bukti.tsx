"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuktiPekerjaan } from "@/domain/layanan/pesanan-schema";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { unggahBuktiLokasi, type PekerjaanActionState } from "./actions";

const initialState: PekerjaanActionState = { status: "idle" };

/**
 * One piece of photo proof, taken in the app (spec, Pekerjaan Layanan: "Proof is
 * in-app camera capture with a timestamp"; AC 4: "captured through the browser
 * camera in-app (no gallery upload), timestamped").
 *
 * There is no file input and no "choose from gallery" anywhere on this screen: the
 * only way to attach a proof is to open the camera and take one, so a proof cannot
 * be a picture of a picture from another device. The frame is sent as it was
 * captured, with the moment the camera produced it, because the phone in the Admin
 * Lokasi's hand is the witness and the server clock is not asked to be one.
 */
export function AmbilBukti({
  lokasiId,
  pekerjaanId,
  kind,
  sudahAda,
}: {
  lokasiId: string;
  pekerjaanId: string;
  kind: BuktiPekerjaan;
  sudahAda: boolean;
}) {
  const [state, kirim, menyimpan] = useActionState(unggahBuktiLokasi, initialState);
  const [sibuk, setSibuk] = useState(false);
  const [ditangkap, setDitangkap] = useState<{ file: File; preview: string; takenAt: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Opens the rear camera. A phone that refuses it says so rather than offering a gallery upload. */
  async function bukaKamera() {
    setSibuk(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: kind === "video" });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (kind === "video") {
        const recorder = new MediaRecorder(stream, { mimeType: "video/mp4" });
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.start();
        recorderRef.current = recorder;
      }
    } catch {
      setSibuk(false);
    }
  }

  function tutupKamera() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSibuk(false);
  }

  /** A photo: one frame off the video element, as a JPEG the FileStore accepts. */
  async function tangkapFoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((selesai) => canvas.toBlob(selesai, "image/jpeg", 0.9));
    if (!blob) return;
    jadiBerkas(blob, "image/jpeg", "jpg");
    tutupKamera();
  }

  /** A video: whatever the recorder has collected, as an MP4. */
  function rekamSelesai() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      jadiBerkas(new Blob(chunksRef.current, { type: "video/mp4" }), "video/mp4", "mp4");
      recorderRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      setSibuk(false);
    };
    recorder.stop();
  }

  /** The captured bytes become a `File` here, in the event handler, never in render. */
  function jadiBerkas(blob: Blob, type: string, ekstensi: string) {
    setDitangkap({
      file: new File([blob], `${kind}.${ekstensi}`, { type }),
      preview: URL.createObjectURL(blob),
      takenAt: new Date().toISOString(),
    });
  }

  /**
   * The proof is handed over in a `FormData` built here, not through an input on
   * the screen: a file input is the one control a gallery could reach, and a photo
   * is not something a hidden field could carry as text.
   */
  function simpanBukti(formData: FormData) {
    if (!ditangkap) return;
    formData.set("lokasiId", lokasiId);
    formData.set("pekerjaanId", pekerjaanId);
    formData.set("kind", kind);
    formData.set("takenAt", ditangkap.takenAt);
    formData.set("file", ditangkap.file);
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`bukti-${kind}`}>
      <p className="text-body font-medium">{labelBuktiPekerjaan(kind)}</p>
      {sudahAda ? <p className="text-small text-muted-foreground">Sudah ada. Ambil ulang kalau mau mengganti.</p> : null}

      {!sibuk ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={bukaKamera} disabled={menyimpan}>
          <Camera aria-hidden className="size-4" />
          Ambil dengan kamera
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <video ref={videoRef} playsInline muted aria-label="Pratinjau kamera" className="max-h-64 w-full rounded-lg bg-foreground" />
          {kind === "video" ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={rekamSelesai}>
              <CircleStop aria-hidden className="size-4" />
              Selesai merekam
            </Button>
          ) : (
            <Button type="button" size="sm" className="self-start" onClick={tangkapFoto}>
              <Camera aria-hidden className="size-4" />
              Ambil foto
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={tutupKamera}>
            Batal
          </Button>
        </div>
      )}

      {ditangkap ? (
        <form action={(formData) => kirim(simpanBukti(formData) ?? formData)} className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">
            {labelBuktiPekerjaan(kind)} diambil {formatTanggalJam(new Date(ditangkap.takenAt))}. Periksa sekali lagi, lalu simpan.
          </p>
          <BuktiPratinjau url={ditangkap.preview} type={ditangkap.file.type} />
          <Button type="submit" size="sm" className="self-start" disabled={menyimpan}>
            {menyimpan ? "Menyimpan…" : "Simpan bukti"}
          </Button>
        </form>
      ) : null}

      {state.status === "gagal" ? (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "berhasil" ? (
        <p role="status" className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/** What was just taken, so the Admin Lokasi sees the frame before it is saved. */
function BuktiPratinjau({ url, type }: { url: string; type: string }) {
  return type.startsWith("video/") ? (
    <video src={url} controls playsInline className="max-h-64 rounded-lg" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never next/image's remote loader.
    <img src={url} alt="Pratinjau bukti yang baru diambil" className="max-h-64 rounded-lg" />
  );
}
