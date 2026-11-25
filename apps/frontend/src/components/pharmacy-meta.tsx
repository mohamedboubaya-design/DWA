"use client";

import { CreditCard, Star } from "lucide-react";
import { useT } from "@/lib/locale";

/* pharmacies.rating_avg with the number of pharmacy_ratings rows; "New" until someone rates. */
export function RatingBadge({ avg, count, night = false }: { avg: number | null; count: number; night?: boolean }) {
  const { t } = useT();
  const muted = night ? "text-dusk-muted" : "text-muted";
  if (avg === null || count === 0) return <span className={`text-xs ${muted}`}>{t("meta.unrated")}</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${muted}`} title={t("meta.ratingTitle", { rating: avg.toFixed(1), n: count })}>
      <Star className="size-3.5 fill-amber text-amber" aria-hidden />
      <span className={`font-mono font-medium nums ${night ? "text-dusk-ink" : "text-ink"}`}>{avg.toFixed(1)}</span>
      <span className="font-mono nums">({count})</span>
    </span>
  );
}

/* medicines.chifa_reimbursable: the CNAS CHIFA card covers this medicine. */
export function ChifaBadge() {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e6eefb] px-2 py-0.5 text-[11px] font-medium text-[#1e4a8c]" title={t("meta.chifaTitle")}>
      <CreditCard className="size-3" aria-hidden /> CHIFA
    </span>
  );
}
