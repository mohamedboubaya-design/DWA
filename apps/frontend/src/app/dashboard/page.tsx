import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getLocale } from "@/lib/i18n-server";
import { DirScript, LocaleProvider } from "@/lib/locale";

export const metadata: Metadata = { title: "Stock", robots: { index: false } };

export default async function DashboardPage() {
  const locale = await getLocale();
  return (
    <LocaleProvider locale={locale}>
      <DirScript locale={locale} />
      <Dashboard />
    </LocaleProvider>
  );
}
