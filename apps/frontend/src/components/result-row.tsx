"use client";

import Link from "next/link";
import { Phone, ChevronRight } from "lucide-react";
import type { MedicineRow, PharmacyDirectoryRow, SearchResultItem } from "@/lib/db/schema";
import { agoText, fmtKm, fmtPriceRange, minutesSince } from "@/lib/format";
import { useT } from "@/lib/locale";
import { useNow } from "@/lib/use-now";
import { RatingBadge } from "./pharmacy-meta";
import { ReserveDialog } from "./reserve-dialog";
import { StatusBadge, OpenBadge } from "./status";

export type ResultRowData = {
  pharmacy: PharmacyDirectoryRow;
  ratingCount: number;
  distanceMeters: number | null;
  /** The searched medicine at this pharmacy (one row of searchMedicines()). */
  stock?: SearchResultItem;
  /** MAX(updated_at) of the batches behind `stock`. */
  updatedAt?: string | null;
  /** Most boxes a single reservation can hold here. */
  reservable?: number;
};

export function ResultRow({
  row,
  open,
  highlighted = false,
  onHover,
  medicine,
}: {
  row: ResultRowData;
  open: boolean | null;
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
  /** The medicine being searched: shows a Reserve button where it can be held. */
  medicine?: MedicineRow;
}) {
  const { t } = useT();
  const now = useNow();
  const { pharmacy: p, stock } = row;
  const dim = stock?.stockStatus === "out_of_stock";
  const canReserve = !!medicine && !!stock && (row.reservable ?? 0) > 0;
  const price = stock ? fmtPriceRange(stock.minPriceDzd, stock.maxPriceDzd) : "";
  return (
    <li
      onMouseEnter={() => onHover?.(p.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group relative grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-xl px-4 py-4 transition-colors duration-150 sm:grid-cols-[1fr_auto_auto] ${
        highlighted ? "bg-green-soft/60" : "hover:bg-paper"
      }`}
    >
      <div className={`min-w-0 ${dim ? "opacity-60" : ""}`}>
        <Link href={`/pharmacy/${p.id}`} className="font-semibold after:absolute after:inset-0 after:content-['']">
          {p.name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{p.commune}</span>
          {row.distanceMeters !== null && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono text-xs nums">{fmtKm(row.distanceMeters)}</span>
            </>
          )}
          {(p.is_on_duty_now || open !== null) && <span aria-hidden>·</span>}
          <OpenBadge open={open} onDuty={p.is_on_duty_now} />
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <RatingBadge avg={p.rating_avg} count={row.ratingCount} />
          {price && <span className="font-mono text-xs text-muted nums">{price}</span>}
        </p>
      </div>

      {stock ? (
        <div className="flex flex-col items-end gap-1 sm:items-start">
          <StatusBadge status={stock.stockStatus} qty={stock.totalAvailable} />
          {row.updatedAt && now && <span className="font-mono text-[11px] text-muted">{t("row.counted", { ago: agoText(t, minutesSince(row.updatedAt, now.getTime())) })}</span>}
        </div>
      ) : (
        <span className="hidden sm:block" />
      )}

      <div className="relative z-10 col-span-2 flex items-center gap-2 sm:col-span-1">
        {medicine && stock && <ReserveDialog pharmacy={p} medicine={medicine} available={row.reservable ?? 0} priceDzd={stock.minPriceDzd} />}
        {p.phone && (
          <a
            href={`tel:${p.phone.replace(/\s/g, "")}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium ring-1 ring-line transition-colors duration-150 hover:bg-surface"
            aria-label={t("row.call", { name: p.name })}
          >
            <Phone className="size-3.5" aria-hidden />
            {/* With a Reserve button next to it, the call button shrinks to its icon so the name keeps its room. */}
            <span className={`font-mono text-xs nums ${canReserve ? "sr-only" : ""}`} dir="ltr">
              {p.phone.replace(/^\+213\s?/, "0")}
            </span>
          </a>
        )}
        <ChevronRight className="hidden size-4 text-muted transition-transform duration-150 group-hover:translate-x-0.5 sm:block rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
      </div>
    </li>
  );
}
