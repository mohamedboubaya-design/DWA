"use client";

import { TrendingUp } from "lucide-react";
import { useTables } from "@/lib/db/api";
import type { PharmacyRow } from "@/lib/db/schema";
import { medicineAvailability, unmetDemand } from "@/lib/db/views";
import { titleCase } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useT } from "@/lib/locale";

/*
 * Missed demand (v_unmet_demand): medicines people in this wilaya searched for
 * over the last 30 days without finding them in stock, with how many are still
 * waiting for a back-in-stock text. Anonymous: counts only.
 */
export function DemandPanel({ pharmacy }: { pharmacy: PharmacyRow }) {
  const { t } = useT();
  const db = useTables();
  const now = useNow();
  if (!now) return <section className="surface mt-6 h-40 animate-pulse rounded-card" aria-hidden />;

  const mine = new Map(medicineAvailability(db, now.getTime(), { pharmacyId: pharmacy.id }).map((a) => [a.medicine_id, a.total_available]));
  const rows = unmetDemand(db, now.getTime(), pharmacy.wilaya)
    .filter((r) => r.medicine_id)
    .slice(0, 5)
    .map((r) => ({ ...r, waiting: db.stock_alerts_reminders.filter((a) => a.medicine_id === r.medicine_id && a.alert_type === "back_in_stock" && a.is_active).length, here: mine.get(r.medicine_id!) ?? 0 }));
  const total = rows.reduce((s, r) => s + r.search_count, 0);

  return (
    <section className="surface mt-6 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <TrendingUp className="size-4 text-green" aria-hidden /> {t("demand.title")}
        </h2>
        <span className="ms-auto font-mono text-xs text-muted">{t("demand.scope", { wilaya: pharmacy.wilaya })}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{t("demand.total", { n: total })}</p>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">{t("demand.none")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.medicine_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="min-w-0 flex-1 font-medium">{titleCase(r.commercial_name ?? "")}</span>
              <span className="font-mono text-xs nums">{t("demand.searches", { n: r.search_count })}</span>
              {r.waiting > 0 && <span className="text-xs font-medium text-green">{t("demand.waiting", { n: r.waiting })}</span>}
              <span className={`text-xs ${r.here > 0 ? "text-green" : "text-muted"}`}>{r.here > 0 ? t("demand.youHave", { n: r.here }) : t("demand.youDont")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
