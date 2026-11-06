CREATE TABLE "lokasi_info_makam_swasta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nama" text NOT NULL,
	"kota" text NOT NULL,
	"alamat" text NOT NULL,
	"pengelola" text NOT NULL,
	"segmen" text NOT NULL,
	"luas" text,
	"fasilitas" text,
	"sumber" jsonb NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"tampil" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lokasi_info_makam_swasta_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "lokasi_info_makam_swasta_urutan_idx" ON "lokasi_info_makam_swasta" USING btree ("tampil","urutan");--> statement-breakpoint
-- The nine Info Makam Swasta entries the page used to carry in code (research of 2 Nov 2026; BAQI Bogor Timur corrected
-- to Kabupaten Bogor, Kec. Tanjungsari, 6 Nov 2026). From here on Admin Platform keeps them.
INSERT INTO "lokasi_info_makam_swasta" ("slug", "nama", "kota", "alamat", "pengelola", "segmen", "luas", "fasilitas", "sumber", "urutan", "created_at", "updated_at") VALUES
('san-diego-hills', 'San Diego Hills Memorial Park', 'Kabupaten Karawang', 'Telukjambe Barat, akses Tol Jakarta-Cikampek', 'San Diego Hills, grup PT Lippo Karawaci Tbk', 'Multi-agama (area Islam, Tionghoa, umum)', NULL, 'Kapel, musala, restoran, danau 8 ha, jogging track.', '["sandiegohills.co.id", "Okezone, Desember 2022"]', 10, now(), now()),
('al-azhar', 'Al-Azhar Memorial Garden', 'Kabupaten Karawang', 'Jl. Raya Peruri KM 53-54, Desa Pinayungan, Kec. Telukjambe Timur', 'YPI Al-Azhar bersama PT Nuansa Usaha Mandiri', 'Khusus Muslim', '25 ha', 'Masjid dan musala, lounge, parkir luas, layanan 24 jam, taman dan jalur pejalan kaki.', '["IDX Channel, April 2025", "Kontan, Juli 2026"]', 20, now(), now()),
('firdaus-bogor', 'Firdaus Memorial Park Bogor', 'Kabupaten Bogor', 'Jl. Tangkil RT 01/RW 08, Desa Sukaluyu, Kec. Tamansari', 'Sinergi Foundation (lembaga wakaf)', 'Muslim, berbasis wakaf', '1,7 ha', NULL, '["firdausmemorialpark.org", "Republika, Agustus 2022"]', 30, now(), now()),
('heaven-memorial-garden', 'Heaven Memorial Garden', 'Kabupaten Tangerang', 'Jl. Syeh Nanwawi, Kp. Cibodas, Desa Taban, Kec. Jambe', 'Grup Rumah Duka Heaven', 'Semua agama dan suku', '13 ha', 'Konsep taman, keamanan 24 jam.', '["heaven.co.id", "TangerangNews, Agustus 2022"]', 40, now(), now()),
('raudlatul-jannah', 'Raudlatul Jannah Memorial Park', 'Kabupaten Karawang', 'Jl. Kuta Tandingan, Margakaya, Kec. Telukjambe Barat', 'San Diego Hills, grup PT Lippo Karawaci Tbk', 'Khusus Muslim', NULL, NULL, '["Kontan, 2019-2020", "Okezone, Desember 2022"]', 50, now(), now()),
('heaven-memorial-park', 'Heaven Memorial Park', 'Kabupaten Bogor', 'Jl. Buanajaya, Kec. Tanjungsari (kawasan Jonggol)', 'Grup Rumah Duka Heaven', 'Tionghoa', 'Sekitar 125 ha', NULL, '["heaven.co.id", "Okezone, 2022"]', 60, now(), now()),
('lestari-tangerang', 'Lestari Memorial Park Tangerang', 'Kabupaten Tangerang', 'Cibodas, Desa Rancabuaya, Kec. Jambe', 'Grup Nirvana Memorial Park', 'Tionghoa dan umum', NULL, NULL, '["tamankenanganlestari.com"]', 70, now(), now()),
('baqi-bogor-timur', 'BAQI Memorial Park Bogor Timur', 'Kabupaten Bogor', 'Kp. Bunder, Desa Buanajaya, Kec. Tanjungsari', 'BAQI Memorial Park', 'Khusus Muslim', NULL, 'Musala, aula, taman dan jalur pejalan kaki, layanan 24 jam.', '["baqimemorialpark.id", "RRI, Desember 2024"]', 80, now(), now()),
('mount-carmel-cirebon', 'Mount Carmel Cluster Madinah Cirebon', 'Kabupaten Cirebon', 'Jl. Raya Cirebon-Kuningan KM 8,9, Desa Patapan, Kec. Beber', 'Mount Carmel', 'Cluster Madinah (Muslim) dan Cluster Mount Carmel (non-Muslim)', NULL, 'Satu gerbang, keamanan 24 jam, taman, parkir luas, dekat exit tol Ciperna.', '["mountcarmelcirebon.com"]', 90, now(), now())
ON CONFLICT ("slug") DO NOTHING;
