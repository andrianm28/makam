import { PageHeader } from "@/components/makam/page-header";
import { PengaturanForm } from "./pengaturan-form";

/** PROTOTYPE (d): the form pattern on Pengaturan Operator. */
export default function PengaturanOperatorPratinjau() {
  return (
    <>
      <PageHeader
        title="Pengaturan Operator"
        description="Nilai rujukan Operator yang tidak dimiliki layar lain. Setiap perubahan berlaku sejak disimpan."
      />
      <PengaturanForm />
    </>
  );
}
