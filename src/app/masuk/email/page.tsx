import { redirect } from "next/navigation";

/** The old "Masuk dengan email" address: Masuk itself is by email now. */
export default function MasukDenganEmailPage(): never {
  redirect("/masuk");
}
