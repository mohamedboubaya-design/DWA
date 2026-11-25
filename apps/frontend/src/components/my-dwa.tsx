"use client";

import Link from "next/link";
import { Bell, ChevronRight, Trash2 } from "lucide-react";
import { closePrescription, prescriptionImageUrl, stopAlert, useGuest, useTables } from "@/lib/db/api";
import type { AvailabilityStatus, PrescriptionRow, Tables } from "@/lib/db/schema";
import { medicineAvailability } from "@/lib/db/views";
import { medLabel, medName } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";
import { useNow } from "@/lib/use-now";
import { Reminders } from "./reminders";
import { STATUS_KEY } from "./reservation-view";
import { SendPrescription } from "./send-prescription";

const AVAIL: Record<AvailabilityStatus, { label: MessageKey; cls: string }> = {
  available: { label: "avail.available", cls: "bg-green-soft text-green" },
  partial: { label: "avail.partial", cls: "bg-amber-soft text-amber-ink" },
  unavailable: { label: "avail.unavailable", cls: "bg-danger-soft text-danger" },
};

/*
 * The guest's own space. There is no account: this page lists what was made on
 * this device (the ids are kept locally), read back from the database by id.
 */
export function MyDwa() {
  const { t, intl } = useT();
  const when = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const db = useTables();
  const guest = useGuest();
  const now = useNow();

  const reservations = db.reservations.filter((r) => guest.reservation_ids.includes(r.id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const prescriptions = db.prescriptions.filter((p) => guest.prescription_ids.includes(p.id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const alerts = db.stock_alerts_reminders.filter((a) => guest.alert_ids.includes(a.id) && a.alert_type === "back_in_stock" && a.is_active);

  return (
    <>
      <section className="dusk-band">
        <div className="mx-auto max-w-4xl px-4 pt-28 pb-10 sm:px-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight">{t("my.title")}</h1>
          <p className="mt-2 text-dusk-muted">{t("my.lede")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-12 px-4 pt-8 pb-24 sm:px-6">
        <section>
          <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{t("my.reservations")}</h2>
          {reservations.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
              <p className="font-semibold">{t("my.none")}</p>
              <p className="mt-1 text-sm text-muted">{t("my.noneHelp")}</p>
              <Link href="/search" className="mt-4 inline-flex h-10 items-center rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700">
                {t("rv.searchCta")}
              </Link>
            </div>
          ) : (
            <ul className="surface divide-y divide-line/70 rounded-card p-1.5">
              {reservations.map((r) => {
                const batch = db.pharmacy_stock.find((s) => s.id === r.stock_id);
                const m = db.medicines.find((x) => x.id === batch?.medicine_id);
                const p = db.pharmacies.find((x) => x.id === r.pharmacy_id);
                return (
                  <li key={r.id}>
                    <Link href={`/reservation/${r.id}`} className="group flex items-center gap-4 rounded-xl px-4 py-4 hover:bg-paper">
                      <span dir="ltr" className="font-mono text-sm font-semibold tracking-widest text-green">{r.pickup_code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {r.quantity} × {m ? medLabel(m) : "–"}
                        </span>
                        <span className="block truncate text-sm text-muted">
                          {p?.name} · {when.format(Date.parse(r.created_at))}
                        </span>
                      </span>
                      <span className="hidden text-sm text-muted sm:block">{t(STATUS_KEY[r.status])}</span>
                      <ChevronRight className="size-4 text-muted transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="prescriptions" className="scroll-mt-28">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{t("my.rxSent")}</h2>
            <span className="ms-auto">
              <SendPrescription tone="day" />
            </span>
          </div>
          {prescriptions.length === 0 ? (
            <p className="text-sm text-muted">{t("my.rxNone")}</p>
          ) : (
            <ul className="space-y-3">
              {prescriptions.map((rx) => (
                <PrescriptionCard key={rx.id} rx={rx} db={db} when={when} />
              ))}
            </ul>
          )}
        </section>

        <div id="treatments" className="scroll-mt-28">
          <Reminders />
        </div>

        <section>
          <h2 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
            <Bell className="size-5" aria-hidden /> {t("my.alerts")}
          </h2>
          {alerts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("my.alertsNone")}</p>
          ) : (
            <ul className="surface mt-4 divide-y divide-line/70 rounded-card p-1.5">
              {alerts.map((a) => {
                const m = db.medicines.find((x) => x.id === a.medicine_id)!;
                const user = db.users.find((u) => u.id === a.user_id);
                const back = now ? medicineAvailability(db, now.getTime(), { medicineIds: [a.medicine_id] }).filter((x) => x.stock_status !== "out_of_stock").length : 0;
                return (
                  <li key={a.id} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{medLabel(m)}</span>
                      {user?.phone && <span className="block font-mono text-xs text-muted">{t("my.textTo", { phone: user.phone })}</span>}
                    </span>
                    <span className={`text-sm ${back ? "font-medium text-green" : "text-muted"}`}>{back ? t("my.haveIt", { n: back }) : t("my.stillOut")}</span>
                    <button type="button" onClick={() => void stopAlert(a.id)} aria-label={t("my.stopAlert", { name: medName(m) })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function PrescriptionCard({ rx, db, when }: { rx: PrescriptionRow; db: Tables; when: Intl.DateTimeFormat }) {
  const { t } = useT();
  const image = prescriptionImageUrl(rx.image_storage_path);
  const responses = db.prescription_responses.filter((r) => r.prescription_id === rx.id);
  return (
    <li className="surface flex gap-4 rounded-card p-3">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the mock storage
        <img src={image} alt={t("rxi.photo")} className="size-20 shrink-0 rounded-lg object-cover ring-1 ring-line" />
      ) : (
        <span className="size-20 shrink-0 rounded-lg bg-paper-2 ring-1 ring-line" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{t("my.rxTo", { wilaya: rx.wilaya ?? "–" })}</p>
        <p className="text-xs text-muted">
          {when.format(Date.parse(rx.created_at))}
          {rx.status === "closed" && <> · {t("my.rxClosed")}</>}
        </p>
        {rx.patient_notes && <p className="mt-1 text-muted">“{rx.patient_notes}”</p>}
        {responses.length === 0 ? (
          <p className="mt-2 text-muted">{t("my.rxWaiting")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {responses.map((r) => {
              const ph = db.pharmacies.find((p) => p.id === r.pharmacy_id);
              const ref = r.referred_pharmacy_id ? db.pharmacies.find((p) => p.id === r.referred_pharmacy_id) : undefined;
              const a = AVAIL[r.availability_status];
              return (
                <li key={r.id} className="rounded-lg bg-paper px-3 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/pharmacy/${r.pharmacy_id}`} className="font-medium hover:underline">
                      {ph?.name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}>{t(a.label)}</span>
                  </span>
                  {r.response_notes && <span className="mt-1 block">{r.response_notes}</span>}
                  {ref && (
                    <span className="mt-1 block text-xs text-muted">
                      {t("my.rxReferred")}{" "}
                      <Link href={`/pharmacy/${ref.id}`} className="font-medium text-green underline underline-offset-4">
                        {ref.name}
                      </Link>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {rx.status !== "closed" && (
          <button type="button" onClick={() => void closePrescription(rx.id)} className="mt-2 text-xs font-medium text-muted underline underline-offset-4 hover:text-ink">
            {t("my.rxClose")}
          </button>
        )}
      </div>
    </li>
  );
}
