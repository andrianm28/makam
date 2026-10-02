"use client";

import { useActionState, useRef, useState } from "react";
import { Camera, CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { ServerResult, idleFormState } from "../../form-feedback";
import { simpanBuktiTpu } from "./bukti-actions";

type Jenis = "foto_sebelum" | "foto_sesudah" | "video";

/**
 * One shot of a TPU job's proof, taken with the browser camera and nothing else: there is no
 * file input and no gallery on this screen, so a proof cannot be a picture of a picture. The
 * frame goes up as captured with the moment the camera produced it (the phone is the witness).
 */
export function AmbilBuktiTpu({ pekerjaanId, kind, sudahAda }: { pekerjaanId: string; kind: Jenis; sudahAda: boolean }) {
  const [state, kirim, menyimpan] = useActionState(simpanBuktiTpu, idleFormState);
  const [sibuk, setSibuk] = useState(false);
  const [ditangkap, setDitangkap] = useState<{ file: File; preview: string; takenAt: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  function jadiBerkas(blob: Blob, type: string, ekstensi: string) {
    setDitangkap({ file: new File([blob], `${kind}.${ekstensi}`, { type }), preview: URL.createObjectURL(blob), takenAt: new Date().toISOString() });
  }

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

  function simpan(formData: FormData) {
    if (!ditangkap) return;
    formData.set("pekerjaanId", pekerjaanId);
    formData.set("kind", kind);
    formData.set("takenAt", ditangkap.takenAt);
    formData.set("file", ditangkap.file);
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`bukti-tpu-${kind}`}>
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
        <form action={(formData) => kirim(simpan(formData) ?? formData)} className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">
            {labelBuktiPekerjaan(kind)} diambil {formatTanggalJam(new Date(ditangkap.takenAt))}. Periksa sekali lagi, lalu simpan.
          </p>
          {ditangkap.file.type.startsWith("video/") ? (
            <video src={ditangkap.preview} controls playsInline className="max-h-64 rounded-lg" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never next/image's remote loader.
            <img src={ditangkap.preview} alt="Pratinjau bukti yang baru diambil" className="max-h-64 rounded-lg" />
          )}
          <Button type="submit" size="sm" className="self-start" disabled={menyimpan}>
            {menyimpan ? "Menyimpan…" : "Simpan bukti"}
          </Button>
        </form>
      ) : null}
      <ServerResult state={state} />
    </div>
  );
}
