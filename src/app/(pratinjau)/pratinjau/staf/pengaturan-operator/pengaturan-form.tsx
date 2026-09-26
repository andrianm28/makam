"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormSection } from "@/components/makam/form-section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * PROTOTYPE copy of the schema shape. The real form shares the Zod schema its
 * Server Action validates with; here nothing is sent anywhere.
 */
const schema = z.object({
  legalName: z.string().trim().min(3, "Isi nama resmi Operator seperti di akta."),
  address: z.string().trim().min(10, "Isi alamat terdaftar lengkap, sampai kode pos."),
  phone: z.string().trim().regex(/^(\+62|62|0)[0-9 -]{8,15}$/, "Tulis nomor telepon diawali 0 atau +62."),
  email: z.email("Tulis alamat email lengkap, misalnya halo@makam.co.id."),
  csWhatsApp: z
    .string()
    .trim()
    .regex(/^(62|0)8[0-9]{8,11}$/, "Nomor WhatsApp CS diawali 08 atau 628, 10 sampai 13 angka tanpa spasi."),
  csReplyHours: z.string().trim().min(5, "Tulis kapan CS membalas, misalnya: dibalas mulai pukul 06.00."),
  reason: z.string().trim().max(500).optional(),
});

type Values = z.infer<typeof schema>;

const saved: Values = {
  legalName: "PT Jaya Korpora Prima",
  address: "Jl. Kemang Raya No. 8, Bangka, Mampang Prapatan, Jakarta Selatan 12730",
  phone: "021 7179 0000",
  email: "halo@makam.co.id",
  csWhatsApp: "0812 3456",
  csReplyHours: "Dibalas mulai pukul 06.00, setiap hari",
  reason: "",
};

export function PengaturanForm() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: saved, mode: "onTouched" });

  // PROTOTYPE: show one inline error on load so the pattern is visible.
  useEffect(() => {
    void form.trigger("csWhatsApp");
  }, [form]);

  const onSubmit = form.handleSubmit(
    (values) => {
      form.reset(values);
      toast.success("Pengaturan Operator disimpan", {
        description: "Berlaku mulai sekarang. Tagihan dan Bukti yang sudah terbit tetap memakai nilai lama.",
      });
    },
    () => toast.error("Belum disimpan", { description: "Perbaiki isian yang ditandai merah, lalu simpan lagi." }),
  );

  const field = (name: keyof Values, label: string, props: { description?: string; type?: string; inputMode?: "tel" | "email"; multiline?: boolean; placeholder?: string } = {}) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field: input, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`po-${name}`}>{label}</FieldLabel>
          {props.multiline ? (
            <Textarea {...input} value={input.value ?? ""} id={`po-${name}`} aria-invalid={fieldState.invalid} rows={2} placeholder={props.placeholder} />
          ) : (
            <Input
              {...input}
              value={input.value ?? ""}
              id={`po-${name}`}
              type={props.type}
              inputMode={props.inputMode}
              aria-invalid={fieldState.invalid}
              placeholder={props.placeholder}
            />
          )}
          {props.description && !fieldState.invalid ? <FieldDescription>{props.description}</FieldDescription> : null}
          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <FormSection title="Identitas Operator" description="Muncul di kepala dokumen, footer situs dan halaman Tentang Kami.">
        {field("legalName", "Nama resmi Operator")}
        {field("address", "Alamat terdaftar", { multiline: true })}
      </FormSection>
      <FormSection title="Kontak Operator" description="Untuk dokumen dan halaman Hubungi Kami.">
        <div className="grid gap-5 sm:grid-cols-2">
          {field("phone", "Telepon Operator", { type: "tel", inputMode: "tel" })}
          {field("email", "Email Operator", { type: "email", inputMode: "email" })}
        </div>
      </FormSection>
      <FormSection title="Layanan pelanggan" description="Tombol WhatsApp CS di situs dan di setiap pesan ke Pemesan memakai nomor ini.">
        {field("csWhatsApp", "Nomor WhatsApp CS", { type: "tel", inputMode: "tel", description: "Diawali 08 atau 628, tanpa spasi." })}
        {field("csReplyHours", "Jam balas CS", { placeholder: "Dibalas mulai pukul 06.00", description: "Ditampilkan di samping tombol WhatsApp CS." })}
      </FormSection>
      <FormSection title="Alasan perubahan" description="Opsional. Dicatat di Audit Log bersama nilai lama dan baru.">
        {field("reason", "Alasan", { multiline: true, placeholder: "Misalnya: nomor CS pindah ke WhatsApp Business" })}
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-(--page-gutter) mt-2 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-(--page-gutter) py-3 backdrop-blur-md">
        <p className="mr-auto text-small text-muted-foreground">
          {form.formState.isDirty ? "Ada perubahan yang belum disimpan." : "Berlaku sejak disimpan 20 September 2026."}
        </p>
        <Button type="button" variant="outline" onClick={() => form.reset(saved)} disabled={!form.formState.isDirty}>
          Batalkan perubahan
        </Button>
        <Button type="submit">Simpan</Button>
      </div>
    </form>
  );
}
