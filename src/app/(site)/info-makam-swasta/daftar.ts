/**
 * Info Makam Swasta: what public sources say about private cemeteries (TPS)
 * Makam.co.id is talking to but that are not Lokasi Mitra yet. Content, not a
 * domain record: nothing here can be ordered or paid, nothing is labelled
 * Terverifikasi, and no price is shown (prices found online are mostly from
 * agents or old news). A location that signs moves to Lokasi Mitra through the
 * normal publish gate and is taken off this list.
 *
 * Source: makam-prospek/profil-lengkap-21-prospek.md (research, 2 Nov 2026).
 */
export type InfoMakamSwasta = {
  slug: string;
  nama: string;
  kota: string;
  alamat: string;
  pengelola: string;
  segmen: string;
  luas?: string;
  fasilitas?: string;
  sumber: readonly string[];
};

export const DAFTAR_INFO_MAKAM_SWASTA: readonly InfoMakamSwasta[] = [
  {
    slug: "graha-sentosa",
    nama: "Graha Sentosa Memorial Park",
    kota: "Kabupaten Karawang",
    alamat: "Jl. Trans Heksa Karawang, Desa Wanajaya, Kec. Telukjambe Barat (exit Tol Karawang Barat 2 KM 46)",
    pengelola: "PT Permata Bumi Kencana",
    segmen: "Tionghoa dan non-Muslim (Buddha, Katolik, Kristen), konsep Feng Shui",
    luas: "50 ha, perbukitan",
    fasilitas: "Paviliun serbaguna 200 orang, danau dan ruang terbuka hijau, keamanan 24 jam, layanan duka 24 jam bersama Rumah Duka Sentosa.",
    sumber: ["Booklet dan materi penjualan Graha Sentosa (Maret 2026)"],
  },
  {
    slug: "san-diego-hills",
    nama: "San Diego Hills Memorial Park",
    kota: "Kabupaten Karawang",
    alamat: "Telukjambe Barat, akses Tol Jakarta-Cikampek",
    pengelola: "San Diego Hills, grup PT Lippo Karawaci Tbk",
    segmen: "Multi-agama (area Islam, Tionghoa, umum)",
    fasilitas: "Kapel, musala, restoran, danau 8 ha, jogging track.",
    sumber: ["sandiegohills.co.id", "Okezone, Desember 2022"],
  },
  {
    slug: "al-azhar",
    nama: "Al-Azhar Memorial Garden",
    kota: "Kabupaten Karawang",
    alamat: "Jl. Raya Peruri KM 53-54, Desa Pinayungan, Kec. Telukjambe Timur",
    pengelola: "YPI Al-Azhar bersama PT Nuansa Usaha Mandiri",
    segmen: "Khusus Muslim",
    luas: "25 ha",
    fasilitas: "Masjid dan musala, lounge, parkir luas, layanan 24 jam, taman dan jalur pejalan kaki.",
    sumber: ["IDX Channel, April 2025", "Kontan, Juli 2026"],
  },
  {
    slug: "firdaus-bogor",
    nama: "Firdaus Memorial Park Bogor",
    kota: "Kabupaten Bogor",
    alamat: "Jl. Tangkil RT 01/RW 08, Desa Sukaluyu, Kec. Tamansari",
    pengelola: "Sinergi Foundation (lembaga wakaf)",
    segmen: "Muslim, berbasis wakaf",
    luas: "1,7 ha",
    sumber: ["firdausmemorialpark.org", "Republika, Agustus 2022"],
  },
  {
    slug: "heaven-memorial-garden",
    nama: "Heaven Memorial Garden",
    kota: "Kabupaten Tangerang",
    alamat: "Jl. Syeh Nanwawi, Kp. Cibodas, Desa Taban, Kec. Jambe",
    pengelola: "Grup Rumah Duka Heaven",
    segmen: "Semua agama dan suku",
    luas: "13 ha",
    fasilitas: "Konsep taman, keamanan 24 jam.",
    sumber: ["heaven.co.id", "TangerangNews, Agustus 2022"],
  },
  {
    slug: "raudlatul-jannah",
    nama: "Raudlatul Jannah Memorial Park",
    kota: "Kabupaten Karawang",
    alamat: "Jl. Kuta Tandingan, Margakaya, Kec. Telukjambe Barat",
    pengelola: "San Diego Hills, grup PT Lippo Karawaci Tbk",
    segmen: "Khusus Muslim",
    sumber: ["Kontan, 2019-2020", "Okezone, Desember 2022"],
  },
  {
    slug: "heaven-memorial-park",
    nama: "Heaven Memorial Park",
    kota: "Kabupaten Bogor",
    alamat: "Jl. Buanajaya, Kec. Tanjungsari (kawasan Jonggol)",
    pengelola: "Grup Rumah Duka Heaven",
    segmen: "Tionghoa",
    luas: "Sekitar 125 ha",
    sumber: ["heaven.co.id", "Okezone, 2022"],
  },
  {
    slug: "lestari-tangerang",
    nama: "Lestari Memorial Park Tangerang",
    kota: "Kabupaten Tangerang",
    alamat: "Cibodas, Desa Rancabuaya, Kec. Jambe",
    pengelola: "Grup Nirvana Memorial Park",
    segmen: "Tionghoa dan umum",
    sumber: ["tamankenanganlestari.com"],
  },
  {
    slug: "baqi-bogor-timur",
    nama: "BAQI Memorial Park Bogor Timur",
    kota: "Kota Bogor",
    alamat: "Bogor Timur",
    pengelola: "BAQI Memorial Park",
    segmen: "Khusus Muslim",
    fasilitas: "Musala, aula, taman dan jalur pejalan kaki, layanan 24 jam.",
    sumber: ["baqimemorialpark.id", "RRI, Desember 2024"],
  },
  {
    slug: "mount-carmel-cirebon",
    nama: "Mount Carmel Cluster Madinah Cirebon",
    kota: "Kabupaten Cirebon",
    alamat: "Jl. Raya Cirebon-Kuningan KM 8,9, Desa Patapan, Kec. Beber",
    pengelola: "Mount Carmel",
    segmen: "Cluster Madinah (Muslim) dan Cluster Mount Carmel (non-Muslim)",
    fasilitas: "Satu gerbang, keamanan 24 jam, taman, parkir luas, dekat exit tol Ciperna.",
    sumber: ["mountcarmelcirebon.com"],
  },
];

/** The WhatsApp text a family's consultation opens with. */
export function pesanKonsultasi(nama: string): string {
  return `Halo CS Makam.co.id, saya ingin konsultasi tentang ${nama}.`;
}
