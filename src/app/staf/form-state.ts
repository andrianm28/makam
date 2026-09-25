/** What a staff-area form's Server Action hands back to it. */
export type FormState = { status: "idle" } | { status: "berhasil" | "gagal"; message: string };
