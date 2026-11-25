"use client";

import type { StockStatus } from "@/lib/db/schema";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";

const styles: Record<StockStatus, { label: MessageKey; cls: string; dot: string }> = {
  in_stock: { label: "status.in", cls: "bg-green-soft text-green", dot: "bg-green" },
  low_stock: { label: "status.low", cls: "bg-amber-soft text-amber-ink", dot: "bg-amber" },
  out_of_stock: { label: "status.out", cls: "bg-danger-soft text-danger", dot: "bg-danger" },
};

/** fn_stock_status() as a badge; qty is the available count (total minus reserved). */
export function StatusBadge({ status, qty }: { status: StockStatus; qty?: number }) {
  const { t } = useT();
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${s.cls}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {t(s.label)}
      {qty !== undefined && status !== "out_of_stock" && <span className="font-mono nums">· {qty}</span>}
    </span>
  );
}

export function OpenBadge({ open, onDuty, night = false }: { open: boolean | null; onDuty: boolean; night?: boolean }) {
  const { t } = useT();
  if (onDuty)
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-neon ${
          night ? "bg-dusk-mint/10 ring-1 ring-dusk-mint/40" : "bg-night"
        }`}
      >
        <span className="size-1.5 rounded-full bg-neon" aria-hidden />
        {t("open.garde")}
      </span>
    );
  if (open === null) return null;
  const tone = night ? (open ? "text-dusk-mint" : "text-dusk-muted") : open ? "text-green" : "text-muted";
  return <span className={`text-xs font-medium ${tone}`}>{open ? t("open.now") : t("open.closed")}</span>;
}
