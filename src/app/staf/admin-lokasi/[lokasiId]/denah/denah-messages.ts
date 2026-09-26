/** Bahasa Indonesia for every refusal reason the Inventory module (Denah) can return. */
export function denahRefusalMessage(reason: string, extra?: Record<string, unknown>): string {
  switch (reason) {
    case "nama_sudah_ada":
      return "Nama Blok itu sudah ada di Lokasi ini. Nama Blok harus unik.";
    case "pola_tidak_valid":
      return "Pola nomor perlu tempat untuk nomor urut, misalnya {nn} untuk 01, 02, 03.";
    case "jenis_makam_tidak_ditemukan":
      return "Jenis Makam itu tidak ditemukan di Lokasi ini.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
    case "blok_tidak_ditemukan":
      return "Blok itu tidak ditemukan.";
    case "sel_tidak_ditemukan":
      return "Pilih paling sedikit satu sel dulu.";
    case "sudah_jenis_itu":
      return "Sel yang dipilih sudah jenis itu.";
    case "sel_terkunci": {
      const skippedUsed = (extra?.skippedUsed as unknown[] | undefined)?.length ?? 0;
      const skippedKavling = (extra?.skippedKavling as unknown[] | undefined)?.length ?? 0;
      const parts: string[] = [];
      if (skippedUsed) parts.push(`${skippedUsed} sel punya Hak Pakai`);
      if (skippedKavling) parts.push(`${skippedKavling} sel bagian dari Kavling Keluarga`);
      return `Semua sel yang dipilih terkunci (${parts.join(", ")}). Sel yang pernah dipakai tidak bisa dihapus, dipindah, atau diganti jenisnya; pisahkan Kavling Keluarga dulu untuk mengubah jenis sel atau Jenis Makam-nya.`;
    }
    case "bukan_petak":
      return "Kavling Keluarga hanya boleh dari Petak Makam. Lepaskan Jalan dan Bukan Petak dari pilihan.";
    case "kurang_dari_dua":
      return "Kavling Keluarga paling sedikit 2 Petak. Pilih petak lain yang bersebelahan.";
    case "tidak_bersambung":
      return "Petak dalam satu Kavling Keluarga harus bersambung sisi (bukan hanya bersentuhan sudut).";
    case "pernah_dipakai":
      return "Sel yang dipilih sudah punya Hak Pakai, jadi tidak bisa dijadikan Kavling Keluarga, dihapus, atau dipindah.";
    case "sudah_kavling":
      return "Sel yang dipilih sudah bagian dari Kavling Keluarga lain.";
    case "kavling_tidak_ditemukan":
      return "Kavling Keluarga itu tidak ditemukan.";
    case "punya_hak_pakai":
      return "Kavling Keluarga ini punya Hak Pakai, jadi tidak bisa dipisahkan. Satu Hak Pakai berlaku untuk seluruh kavling.";
    case "nomor_wajib":
      return "Isi Nomor Makam.";
    case "ukuran_maksimum":
      return `Blok paling besar ${extra?.max ?? 40} baris/kolom.`;
    case "ukuran_minimum":
      return "Blok paling sedikit 1 baris dan 1 kolom.";
    case "termasuk_kavling":
      return "Baris/kolom ini memotong Kavling Keluarga. Pisahkan kavlingnya dulu.";
    case "berkas_wajib":
      return "Unggah foto denah.";
    case "berkas_tidak_didukung":
      return "Foto harus JPG, PNG atau WebP, paling besar 10 MB.";
    case "penyimpanan_belum_tersedia":
      return "Penyimpanan berkas belum tersedia di lingkungan ini. Foto belum tersimpan.";
    case "petak_tidak_ditemukan":
      return "Petak itu tidak ditemukan.";
    case "bagian_kavling":
      return "Petak ini bagian dari Kavling Keluarga. Bersihkan kavlingnya, bukan petak ini sendiri.";
    case "sudah_ada_hak_pakai":
      return "Petak atau Kavling Keluarga ini sudah punya Hak Pakai.";
    case "pemegang_hak_wajib":
      return "Isi nama dan nomor telepon Pemegang Hak, atau pilih \"data menyusul\".";
    case "nomor_telepon_tidak_valid":
      return "Nomor telepon Pemegang Hak tidak valid.";
    case "email_tidak_valid":
      return "Email Pemegang Hak tidak valid.";
    case "pemegang_hak_adalah_almarhum":
      return "Pemegang Hak tidak boleh sama dengan Almarhum.";
    case "petak_bukan_anggota_kavling":
      return "Petak itu bukan anggota Kavling Keluarga ini.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "belum_masuk":
      return "Sesi Anda sudah berakhir. Silakan masuk lagi.";
    default: {
      const conflicts = extra?.conflicts as string[] | undefined;
      if (reason === "nomor_sudah_dipakai" && conflicts?.length) {
        return `Nomor Makam harus unik di Lokasi ini. Sudah dipakai: ${conflicts.slice(0, 4).join(", ")}.`;
      }
      return "Perubahan tidak bisa disimpan. Coba lagi.";
    }
  }
}
