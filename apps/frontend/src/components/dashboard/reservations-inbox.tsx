"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, PackageCheck, ShieldCheck, X } from "lucide-react";
import { advanceReservation, closeReservation, depositPayment, errorKey, sweepExpiredReservations, useTables, writeErrorText } from "@/lib/db/api";
import type { ReservationStatus } from "@/lib/db/schema";
import { medName, strengthText } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";

/** The pharmacist's next step for each open status (fn_guard_reservation_transitions). */
const NEXT: Partial<Record<ReservationStatus, { label: MessageKey; run: (id: string) => Promise<void> }>> = {
  pending_payment: { label: "inbox.confirm", run: (id) => advanceReservation(id, "confirmed_held") },
  confirmed_held: { label: "inbox.markReady", run: (id) => advanceReservation(id, "ready_for_pickup") },
  ready_for_pickup: { label: "inbox.collected", run: (id) => closeReservation(id, "completed") },
};

const STATE_KEY: Partial<Record<ReservationStatus, MessageKey>> = {
  pending_payment: "inbox.stNew",
  confirmed_held: "inbox.stConfirmed",
  ready_for_pickup: "inbox.stReady",
};

/*
 * Incoming "hold it for me" requests for this pharmacy, newest first. Collecting
 * takes the boxes off the batch (fn_close_reservation); declining cancels and
 * puts them back.
 */
export function ReservationsInbox({ pharmacyId }: { pharmacyId: string }) {
  const now = useNow();
  const { t, intl } = useT();
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const db = useTables();
  const [error, setError] = useState<string | null>(null);
  const active = db.reservations
    .filter((r) => r.pharmacy_id === pharmacyId && (r.status === "pending_payment" || r.status === "confirmed_held" || r.status === "ready_for_pickup"))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const waiting = active.filter((r) => r.status === "pending_payment").length;

  useEffect(() => {
    if (now) sweepExpiredReservations(now.getTime());
  }, [now]);

  const act = (p: Promise<void>) => p.catch((e) => setError(["storage_full", "storage_unavailable"].includes(errorKey(e)) ? writeErrorText(t, e) : t("inbox.error")));

  return (
    <section id="reservations" className="surface mt-6 scroll-mt-6 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <BellRing className="size-4 text-green" aria-hidden /> {t("dash.reservations")}
        </h2>
        {waiting > 0 && <span className="rounded-full bg-green px-2 py-0.5 font-mono text-xs font-medium text-white">{t("inbox.new", { n: waiting })}</span>}
        <span className="ms-auto text-xs text-muted">{t("inbox.note")}</span>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {active.length === 0 ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">{t("inbox.empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line/70">
          {active.map((r) => {
            const batch = db.pharmacy_stock.find((s) => s.id === r.stock_id);
            const m = db.medicines.find((x) => x.id === batch?.medicine_id);
            const guest = db.users.find((u) => u.id === r.patient_id);
            const paid = depositPayment(db, r.id)?.status === "paid";
            const next = NEXT[r.status];
            const late = now !== null && r.hold_expires_at !== null && now.getTime() > Date.parse(r.hold_expires_at);
            return (
              <li key={r.id} className={`row-in flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${r.status === "pending_payment" ? "toast-in" : ""}`}>
                <span dir="ltr" className="font-mono text-sm font-semibold tracking-widest text-green">
                  {r.pickup_code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {r.quantity} × {m ? medName(m) : "–"} <span className="font-mono text-xs text-muted">{m ? strengthText(m.strength) : ""}</span>
                    {batch && <span className="ms-1.5 font-mono text-[11px] text-muted" dir="ltr">({batch.batch_barcode})</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {guest?.full_name} · <span dir="ltr" className="font-mono">{guest?.phone}</span>
                    {r.hold_expires_at && <> · {t("inbox.hold", { time: time.format(Date.parse(r.hold_expires_at)) })}</>}
                    {late && <span className="ms-1 font-medium text-danger">· {t("inbox.overdue")}</span>}
                  </span>
                </span>
                {paid && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-xs font-medium text-green">
                    <ShieldCheck className="size-3.5" aria-hidden /> {t("inbox.depositPaid")}
                  </span>
                )}
                <span className="text-xs text-muted">{STATE_KEY[r.status] ? t(STATE_KEY[r.status]!) : ""}</span>
                <span className="flex items-center gap-1.5">
                  {next && (
                    <button type="button" onClick={() => act(next.run(r.id))} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green px-3 text-xs font-medium text-white hover:bg-green-700">
                      {r.status === "ready_for_pickup" ? <PackageCheck className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                      {t(next.label)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => act(closeReservation(r.id, "cancelled"))}
                    aria-label={t("inbox.decline", { code: r.pickup_code ?? "" })}
                    className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
