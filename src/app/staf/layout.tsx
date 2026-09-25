import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { keluar } from "@/app/akun/actions";

export const metadata: Metadata = {
  title: "Area Staf | Makam.co.id",
  robots: { index: false, follow: false },
};

/** The staff area: its own section of the app, apart from the public site and Akun Saya. */
export default function StafLayout({ children }: LayoutProps<"/staf">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/staf" className="font-semibold">
            Makam.co.id <span className="font-normal text-muted-foreground">· Area Staf</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/akun" className="text-sm underline underline-offset-4">
              Akun Saya
            </Link>
            <form action={keluar}>
              <Button type="submit" variant="outline" size="sm">
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">{children}</main>
    </div>
  );
}
