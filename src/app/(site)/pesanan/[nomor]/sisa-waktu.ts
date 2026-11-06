/** "Sisa 1 jam 05 menit 09 detik" for a positive span; once it has run out, the order is still being processed. */
export function sisaWaktuLabel(sisaMs: number): string {
  if (sisaMs <= 0) return "Batas waktu terlewati, pesanan masih kami proses";
  const total = Math.floor(sisaMs / 1000);
  const jam = Math.floor(total / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const detik = total % 60;
  const dua = (n: number) => String(n).padStart(2, "0");
  return jam > 0 ? `Sisa ${jam} jam ${dua(menit)} menit` : `Sisa ${dua(menit)}:${dua(detik)}`;
}
