/**
 * Where a Tagihan or Bukti page lives: `/dokumen/<link>`, the link being the
 * document's own unguessable token. Its PDF ("Unduh PDF") is `/dokumen/<link>/pdf`.
 */
export function documentPagePath(link: string): string {
  return `/dokumen/${encodeURIComponent(link)}`;
}

export function documentPdfPath(link: string): string {
  return `${documentPagePath(link)}/pdf`;
}
