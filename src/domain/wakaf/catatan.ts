/** Admin Platform's notes (to the Wakif, or internal), the Nazhir match and a document's link: all `wakaf.kelola`, all audited. */
import { eq } from "drizzle-orm";
import { wakafResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { WakafDeps } from "./deps";
import { wakafCatatan, wakafNazhir, wakafPengajuan } from "./schema";
import { cocokkanNazhirSchema, tulisCatatanSchema } from "./skema";
import { SIGNED_URL_DETIK, type BerkasUrlResult } from "./wakif";

export type CatatanResult = { ok: true } | WriteRefusal | { ok: false; reason: "input_tidak_valid" | "pengajuan_tidak_ditemukan" | "nazhir_tidak_ditemukan" };

/**
 * A note on a Pengajuan: `wakif` is written to the Wakif and shown in their Wakaf tab, `internal`
 * stays with Admin Platform. The Entri Audit records who wrote which kind, never the text.
 */
export async function tulisCatatan(deps: WakafDeps, by: Actor, raw: unknown): Promise<CatatanResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = tulisCatatanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select({ id: wakafPengajuan.id }).from(wakafPengajuan).where(eq(wakafPengajuan.id, input.pengajuanId));
    if (!row) return { ok: false as const, reason: "pengajuan_tidak_ditemukan" as const };
    await tx.insert(wakafCatatan).values({ pengajuanId: row.id, jenis: input.jenis, isi: input.isi, penulisAccountId: by.accountId, pada: deps.clock.now() });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "wakaf.catatan",
      entity: { kind: "pengajuan_wakaf", id: row.id },
      before: null,
      after: { jenis: input.jenis },
      reason: null,
    });
    return { ok: true as const };
  });
}

/** Admin Platform matches the Pengajuan to a Nazhir on the list; the Pengajuan keeps the name as it stands. */
export async function cocokkanNazhir(deps: WakafDeps, by: Actor, raw: unknown): Promise<CatatanResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = cocokkanNazhirSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pengajuanId, nazhirId } = parsed.data;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(wakafPengajuan).where(eq(wakafPengajuan.id, pengajuanId)).for("update");
    if (!row) return { ok: false as const, reason: "pengajuan_tidak_ditemukan" as const };
    const [nazhir] = await tx.select({ nama: wakafNazhir.nama }).from(wakafNazhir).where(eq(wakafNazhir.id, nazhirId));
    if (!nazhir) return { ok: false as const, reason: "nazhir_tidak_ditemukan" as const };
    await tx.update(wakafPengajuan).set({ nazhirId, nazhirNama: nazhir.nama, diubahPada: deps.clock.now() }).where(eq(wakafPengajuan.id, pengajuanId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "wakaf.cocokkan_nazhir",
      entity: { kind: "pengajuan_wakaf", id: pengajuanId },
      before: { nazhir: row.nazhirNama },
      after: { nazhir: nazhir.nama },
      reason: null,
    });
    return { ok: true as const };
  });
}

/** A short-lived link to any document of a Pengajuan, for Admin Platform. */
export async function berkasUrlStaf(deps: WakafDeps, by: Actor, pengajuanId: string, berkasId: string): Promise<BerkasUrlResult | WriteRefusal> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  if (!/^[0-9a-f-]{36}$/i.test(pengajuanId)) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const [row] = await deps.db.select({ berkas: wakafPengajuan.berkas }).from(wakafPengajuan).where(eq(wakafPengajuan.id, pengajuanId));
  if (!row) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const berkas = row.berkas.find((satu) => satu.id === berkasId);
  if (!berkas) return { ok: false, reason: "berkas_tidak_ditemukan" };
  return { ok: true, url: await deps.files.signedUrl(berkas.fileKey, { expiresInSeconds: SIGNED_URL_DETIK }) };
}
