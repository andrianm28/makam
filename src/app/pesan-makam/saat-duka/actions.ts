"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  identityMessage,
  type IdentityRefusal,
} from "@/components/kode-masuk/state";
import { pemesananResource } from "@/domain/identity";
import { bytesOf } from "@/lib/files/base64";
import { pengurusanMessage } from "@/lib/pengurusan-labels";
import { pemesananMessage } from "@/lib/pemesanan-labels";
import { codeInput, emailInput } from "@/server/code-inputs";
import { guarded, GuardRejected } from "@/server/guard";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";
import {
  draftSchema,
  draftTpuSchema,
  KOTA_PILIHAN,
  pengurusanPath,
  pesananPath,
  type DraftSaatDuka,
  type DraftTpu,
  type KirimState,
  type MasalahDraft,
} from "./draft";

/*
 * The wizard's thin Server Actions (AGENTS.md), in this order: authenticate,
 * check the role, validate with Zod, call the domain module — the Pemesanan
 * module for a Lokasi Mitra, the Pengurusan module for a TPU.
 *
 * - `kirimPesanan` and `kirimPengurusanTpu` are signed-in actions: the guard
 *   resolves the actor from the session cookie itself.
 * - `verifikasiKodeMasukDanKirim` and `verifikasiKodeMasukDanKirimTpu` are the
 *   login itself, so they skip the guard's first two steps the way Masuk does:
 *   the Kode Masuk proves the email and creates or finds the Akun, and the same
 *   request places the order for it.
 * - `ingatKota` remembers the city the visitor filtered by; it is the third
 *   documented exception in AGENTS.md — it changes no domain data, only the
 *   visitor's own filter for the next visit, and a first-time visitor is not
 *   signed in yet.
 */

/**
 * Kirim for a Pemesan who is already signed in. A visitor with no session is
 * answered with "perlu_kode_masuk", which opens the Kode Masuk step under the
 * form instead of refusing silently: the wizard's login is that step.
 */
export async function kirimPesanan(draft: unknown): Promise<KirimState> {
  return kirimTerpakai(draftSchema, draft, pemesananMessage, kirim);
}

/** The Kode Masuk step: a correct code creates or finds the Akun of that email, logs it in, and places the order in the same request, landing the family on the order page. A refusal says why, in identity's own words. */
export async function verifikasiKodeMasukDanKirim(
  draft: unknown,
  _state: KirimState,
  formData: FormData,
): Promise<KirimState> {
  return masukLaluKirim(draftSchema, draft, formData, kirim, pesananPath);
}

const kotaSchema = z.object({
  kota: z.string().trim().max(120),
  /** The type chip the list was filtered by; it is carried through the redirect, never stored. */
  jenis: z.enum(["semua", "lokasi_mitra", "tpu_dki"]).catch("semua"),
  // Only the wizard's own first screen may be returned to.
  kembali: z
    .string()
    .trim()
    .regex(/^\/pesan-makam\/saat-duka(\?|$)/),
});

/** Remembers the city the visitor filtered by, so the next visit starts there, and keeps the type chip it was filtered by. */
export async function ingatKota(formData: FormData): Promise<void> {
  const parsed = kotaSchema.safeParse({
    kota: formData.get("kota"),
    kembali: formData.get("kembali"),
    jenis: formData.get("jenis"),
  });
  if (!parsed.success) throw new GuardRejected("input_tidak_valid");
  const { kota, kembali, jenis } = parsed.data;
  const store = await cookies();
  if (kota === "") store.delete(KOTA_PILIHAN);
  else
    store.set(KOTA_PILIHAN, kota, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  const query = new URLSearchParams();
  if (kota !== "") query.set("kota", kota);
  if (jenis !== "semua") query.set("jenis", jenis);
  const suffix = query.toString();
  redirect(
    `${kembali}${suffix === "" ? "" : `${kembali.includes("?") ? "&" : "?"}${suffix}`}`,
  );
}

/** Places the order for one Pemesan, and words the outcome for the screen. */
async function kirim(
  pemesan: { accountId: string; email: string },
  draft: DraftSaatDuka,
): Promise<KirimState> {
  const hasil = await serverRuntime().pemesanan.placeSaatDuka({
    pemesan,
    pemesanName: draft.pemesanName,
    phoneNumber: draft.phoneNumber,
    lokasiId: draft.lokasiId,
    jenisMakamId: draft.jenisMakamId,
    almarhumName: draft.almarhumName,
    tanggalWafat: draft.tanggalWafat,
    // The screen's own values: the module reads the plan as WIB and an empty field as none.
    rencanaPemakamanAt: draft.rencanaPemakamanAt,
    keinginanPenempatan: draft.keinginanPenempatan,
    pemegangHak: draft.pemegangHak,
  });
  if (!hasil.ok)
    return { status: "gagal", message: pemesananMessage(hasil.reason) };
  return { status: "selesai", nomor: hasil.pemesanan.nomor };
}

/**
 * Kirim for a Saat Duka TPU order by a Pemesan already signed in. The same three
 * steps as `kirimPesanan`, with the Pengurusan module on the other end; a
 * visitor with no session is answered with "perlu_kode_masuk", which opens the
 * Kode Masuk step under the form.
 */
export async function kirimPengurusanTpu(draft: unknown): Promise<KirimState> {
  return kirimTerpakai(draftTpuSchema, draft, pengurusanMessage, kirimTpu);
}

/** What a draft must carry for the guard's email check and the Kode Masuk's account name: the same two fields in both wizards. */
type NamaDanEmail = { pemesanName: string; email: string };

/**
 * The only refusals the guard itself can end a signed-in Kirim with, and the
 * ones both label maps already carry a message for (the other two are answered
 * above, before any wording is needed).
 */
type KataSebab = (reason: "tidak_berwenang" | "perlu_totp") => string;

/**
 * The body both signed-in Kirims share (AGENTS.md's four steps): the guard
 * resolves the actor and checks the role, Zod validates the draft, and `place`
 * calls the module. Only the draft's schema, the wording of a domain refusal and
 * the module call differ between the two wizards.
 */
async function kirimTerpakai<T extends NamaDanEmail>(
  schema: z.ZodType<T>,
  draft: unknown,
  message: KataSebab,
  place: (
    pemesan: { accountId: string; email: string },
    draft: T,
  ) => Promise<KirimState>,
): Promise<KirimState> {
  const hasil = await guarded({
    action: "pemesanan.buat",
    resource: (actor) => pemesananResource(actor.accountId),
    schema,
    input: draft,
    // The email on the draft is what the module checks against the Akun, never
    // the session's own: a signed-in Pemesan's field is read-only, so the two
    // agree, and a request that says otherwise is refused rather than ignored.
    run: (actor, data) =>
      place({ accountId: actor.accountId, email: data.email }, data),
  });
  if (hasil.ok) return hasil.value;
  if (hasil.error === "belum_masuk") return { status: "perlu_kode_masuk" };
  if (hasil.error === "input_tidak_valid") {
    const pesan = masalah(hasil.issues ?? []);
    return { status: "gagal", pesan, message: isianMessage(pesan) };
  }
  return { status: "gagal", message: message(hasil.error) };
}

/**
 * The Kode Masuk step of the TPU form: a correct code creates or finds the Akun
 * of that email, logs it in, and places the Pengurusan order in the same
 * request, landing the family on its order page.
 */
export async function verifikasiKodeMasukDanKirimTpu(
  draft: unknown,
  _state: KirimState,
  formData: FormData,
): Promise<KirimState> {
  return masukLaluKirim(
    draftTpuSchema,
    draft,
    formData,
    kirimTpu,
    pengurusanPath,
  );
}

/**
 * The Kode Masuk step both wizards share: the code proves the email and creates
 * or finds the Akun, the same request places the order for it, and a placed
 * order lands on its own page. A refusal says why, in identity's own words.
 */
async function masukLaluKirim<T extends NamaDanEmail>(
  schema: z.ZodType<T>,
  draft: unknown,
  formData: FormData,
  place: (
    pemesan: { accountId: string; email: string },
    draft: T,
  ) => Promise<KirimState>,
  halaman: (nomor: string) => string,
): Promise<KirimState> {
  const parsedDraft = schema.safeParse(draft);
  if (!parsedDraft.success) {
    const pesan = masalah(parsedDraft.error.issues);
    return { status: "gagal", pesan, message: isianMessage(pesan) };
  }
  const parsedCode = kodeMasukSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });
  if (!parsedCode.success)
    return {
      status: "gagal",
      message: "Masukkan 6 angka Kode Masuk dari email Anda.",
    };

  const { identity, adapters } = serverRuntime();
  const login = await identity.verifyKodeMasuk({
    ...parsedCode.data,
    name: parsedDraft.data.pemesanName,
  });
  if (!login.ok)
    return {
      status: "gagal",
      message: identityMessage(
        login.reason as IdentityRefusal,
        undefined,
        adapters.clock.now(),
      ),
    };
  await setSessionCookies(login.session.cookies);

  // The address the Kode Masuk actually proved is the one on the order, and the
  // screen has just said which address the code went to.
  const hasil = await place(
    { accountId: login.account.id, email: login.account.email },
    parsedDraft.data,
  );
  if (hasil.status !== "selesai") return hasil;
  redirect(halaman(hasil.nomor));
}

/** Places one Saat Duka TPU order for a Pemesan, and words the outcome for the screen. */
async function kirimTpu(
  pemesan: { accountId: string; email: string },
  draft: DraftTpu,
): Promise<KirimState> {
  const hasil = await serverRuntime().pengurusan.placeSaatDukaTpu({
    pemesan,
    pemesanName: draft.pemesanName,
    phoneNumber: draft.phoneNumber,
    tpuId: draft.tpuId,
    almarhumName: draft.almarhumName,
    tanggalWafat: draft.tanggalWafat,
    jenis: draft.jenis,
    kelayakan: draft.kelayakan,
    kuburan: draft.kuburan,
    // The photo crosses the boundary as base64 (see `@/lib/files/base64`); the module keeps the bytes.
    fotoIptm: draft.fotoIptm
      ? {
          body: bytesOf(draft.fotoIptm.isi),
          contentType: draft.fotoIptm.contentType,
        }
      : null,
    pemegangHak: draft.pemegangHak,
  });
  if (!hasil.ok)
    return { status: "gagal", message: pengurusanMessage(hasil.reason) };
  return { status: "selesai", nomor: hasil.pengurusan.nomor };
}

/** The Kode Masuk at Kirim, in the shape the Kode Masuk on Masuk uses. */
const kodeMasukSchema = z.object({ email: emailInput, code: codeInput });

/**
 * One message per field, keyed by the field that has to be fixed
 * (`pemegangHak.name` for a Pemegang Hak's own name), in the order the schema
 * complained: the first is the one to say under the button.
 */
function masalah(issues: readonly z.core.$ZodIssue[]): MasalahDraft {
  const satuPerField: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.join(".");
    if (field !== "" && !(field in satuPerField))
      satuPerField[field] = issue.message;
  }
  return satuPerField;
}

/** The first thing wrong with the draft, in the words the field itself would use. */
function isianMessage(issues: MasalahDraft): string {
  return Object.values(issues)[0] ?? "Periksa lagi isian Anda.";
}
