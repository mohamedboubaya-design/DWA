import type { Metadata } from "next";
import Link from "next/link";
import { PillNav } from "@/components/pill-nav";
import { SiteFooter } from "@/components/site-footer";
import { getT } from "@/lib/i18n-server";
import { DirScript, LocaleProvider } from "@/lib/locale";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/* Every unknown URL: same shell as the app pages, in the visitor's language, with a way back. */
export default async function NotFound() {
  const { locale, t } = await getT();
  return (
    <LocaleProvider locale={locale}>
      <DirScript locale={locale} />
      <PillNav />
      <main className="flex-1">
        <section className="dusk-band">
          <div className="mx-auto max-w-xl px-4 pt-36 pb-24 text-center sm:px-6">
            <p className="font-mono text-sm text-dusk-muted">404</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{t("nf.title")}</h1>
            <p className="mt-3 text-dusk-muted">{t("nf.body")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/search" className="inline-flex h-10 items-center rounded-xl bg-dusk-mint px-4 text-sm font-semibold text-[#06241f] hover:bg-white">
                {t("rv.searchCta")}
              </Link>
              <Link href="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-dusk-ink ring-1 ring-white/20 hover:ring-white/40">
                {t("nf.home")}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </LocaleProvider>
  );
}
