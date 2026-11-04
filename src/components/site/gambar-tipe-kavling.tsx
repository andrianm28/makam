/** A Jenis Makam's Gambar Tipe Kavling (an illustration or plan), as its card shows it; a short-lived signed URL, so a plain <img>. */
export function GambarTipeKavlingFigure({ gambar, className }: { gambar: { url: string; keterangan: string }; className?: string }) {
  return (
    <figure className={className ?? "mb-3 overflow-hidden rounded-xl bg-muted"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gambar.url} alt={gambar.keterangan} className="aspect-[16/9] w-full object-cover" loading="lazy" />
      <figcaption className="px-3 py-1.5 text-caption text-muted-foreground">{gambar.keterangan}</figcaption>
    </figure>
  );
}
