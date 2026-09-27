import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { ContentPage, ContentPageFooter } from "@/components/site/content-page";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Hubungi Kami — Makam.co.id",
  description: "Nomor WhatsApp CS, telepon, dan alamat pengelola makam.co.id.",
};

/**
 * Hubungi Kami (spec, Content pages): the CS on WhatsApp, the Operator's phone and
 * its registered address. Every value is read from Pengaturan Operator, so this
 * page is the one place a family is told, and the Tagihan headers copy the same
 * values onto their own rows.
 *
 * The page says what happens when Pengaturan Operator is still empty: it names
 * the CS's role and points to the site, rather than showing a number that is
 * not there.
 */
export default async function HubungiKamiPage() {
  const settings = await serverRuntime().operatorSettings.current();

  return (
    <ContentPage title="Hubungi Kami" lead="Kalau ada yang membingungkan, tanyakan saja. CS kami menjawab lewat WhatsApp.">
      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <h2 className="text-title-3 font-semibold">Customer Service</h2>
          {settings ? (
            <>
              <CsLink contact={{ whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours }} showHours className="text-body-lg" />
              <p className="text-body text-muted-foreground">
                CS kami menjawab di aplikasi WhatsApp, bukan pesan otomatis. Keluarga yang lebih sulit memakai WhatsApp
                bisa menghubungi nomor telepon di bawah.
              </p>
            </>
          ) : (
            <p className="text-body text-muted-foreground">
              Nomor WhatsApp CS belum tersedia di halaman ini.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <h2 className="text-title-3 font-semibold">Telepon dan email</h2>
          {settings ? (
            <dl className="flex flex-col gap-2 text-body-lg">
              <div className="flex flex-col gap-0.5">
                <dt className="text-small text-muted-foreground">Telepon</dt>
                <dd>
                  <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="text-brand underline underline-offset-4">
                    {settings.phone}
                  </a>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-small text-muted-foreground">Email</dt>
                <dd>
                  <a href={`mailto:${settings.email}`} className="text-brand underline underline-offset-4">
                    {settings.email}
                  </a>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-body text-muted-foreground">Nomor telepon dan email belum tersedia di halaman ini.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <h2 className="text-title-3 font-semibold">Alamat</h2>
          {settings ? (
            <address className="text-body-lg not-italic">
              {settings.legalName}
              <br />
              {settings.address}
            </address>
          ) : (
            <p className="text-body text-muted-foreground">Alamat belum tersedia di halaman ini.</p>
          )}
        </CardContent>
      </Card>

      <ContentPageFooter current="Hubungi Kami" />
    </ContentPage>
  );
}
