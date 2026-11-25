"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { subscribeBackInStock, useGuest, useTables, validPhone, writeErrorText } from "@/lib/db/api";
import type { MedicineRow } from "@/lib/db/schema";
import { medName } from "@/lib/format";
import { useT } from "@/lib/locale";
import { ConsentField } from "./consent-field";

/* Back-in-stock alert (stock_alerts_reminders, back_in_stock): leave a number, get a text when a pharmacy has it again. */
export function NotifyMe({ medicine, scarce = false }: { medicine: MedicineRow; scarce?: boolean }) {
  const { t } = useT();
  const db = useTables();
  const guest = useGuest();
  const [error, setError] = useState<string | null>(null);
  const subscribed = db.stock_alerts_reminders.some((a) => guest.alert_ids.includes(a.id) && a.medicine_id === medicine.id && a.alert_type === "back_in_stock" && a.is_active);

  if (subscribed)
    return (
      <p className="mt-4 flex items-center gap-2 text-sm font-medium text-green" role="status">
        <Check className="size-4" aria-hidden /> {t(scarce ? "notify.doneMore" : "notify.doneBack", { name: medName(medicine) })}
      </p>
    );

  return (
    <form
      noValidate
      className="mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const phone = String(d.get("phone") ?? "");
        if (!validPhone(phone)) return setError(t("common.phoneError"));
        if (d.get("consent") !== "on") return setError(t("consent.required"));
        setError(null);
        try {
          await subscribeBackInStock(medicine.id, phone);
        } catch (err) {
          setError(writeErrorText(t, err));
        }
      }}
    >
      <p className="text-sm font-medium text-ink">{t(scarce ? "notify.more" : "notify.back")}</p>
      <div className="mt-2 flex gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-green">
          <span className="sr-only">{t("common.phone")}</span>
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={guest.phone?.replace(/^\+213/, "0") ?? ""}
            placeholder={t("common.phonePh")}
            dir="ltr"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted/70"
          />
        </label>
        <button type="submit" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-medium text-paper hover:bg-ink/90">
          <Bell className="size-4" aria-hidden /> {t("notify.button")}
        </button>
      </div>
      <div className="mt-2">
        <ConsentField />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
