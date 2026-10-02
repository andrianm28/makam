import type { ThreadTerbaca } from "@/domain/layanan";
import { formatTanggalJam } from "@/lib/time/jakarta";

/**
 * A Pekerjaan Layanan's thread as one reader sees it (read-only list; the write box is `FormPesanThread`).
 * The Pemesan sees a Mitra Jasa by first name and photo only: the module's read carries nothing else of them.
 */
export function DaftarPesanThread({ thread }: { thread: ThreadTerbaca }) {
  return (
    <div className="flex flex-col gap-2" data-testid="thread-pesan">
      {thread.mitraJasa ? (
        <div className="flex items-center gap-3">
          {thread.mitraJasa.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL of a private file
            <img src={thread.mitraJasa.fotoUrl} alt={`Foto ${thread.mitraJasa.namaDepan}`} className="size-10 rounded-full border border-border object-cover" />
          ) : null}
          <p className="text-body">
            Percakapan dengan <span className="font-semibold">{thread.mitraJasa.namaDepan}</span>
          </p>
        </div>
      ) : null}
      {thread.pesan.length === 0 ? <p className="text-small text-muted-foreground">Belum ada pesan.</p> : null}
      <ul className="flex flex-col gap-2">
        {thread.pesan.map((pesan) => (
          <li key={pesan.id} className={`flex flex-col gap-1 rounded-lg p-3 ${pesan.milikSaya ? "bg-muted" : "border border-border bg-card"}`}>
            <p className="text-small text-muted-foreground">
              <span className="font-semibold text-foreground">{pesan.label}</span> · {formatTanggalJam(pesan.at)}
            </p>
            {pesan.teks ? <p className="whitespace-pre-line text-body">{pesan.teks}</p> : null}
            {pesan.foto.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {pesan.foto.map((foto, index) => (
                  <li key={index}>
                    {foto.url ? (
                      <a href={foto.url} target="_blank" rel="noopener" className="text-body font-medium text-brand underline underline-offset-4">
                        Foto {index + 1}
                      </a>
                    ) : (
                      <span className="text-small text-muted-foreground">Foto {index + 1} (belum bisa dibuka)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {thread.tertutup ? <p className="text-small text-muted-foreground">Percakapan ditutup karena masa keluhan sudah berakhir. Pesan masih bisa dibaca.</p> : null}
    </div>
  );
}
