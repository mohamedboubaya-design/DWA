"use client";

import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { prescriptionImageUrl, respondToPrescription, useTables, writeErrorText } from "@/lib/db/api";
import { AVAILABILITY_STATUSES, type AvailabilityStatus, type PharmacyRow, type PrescriptionRow } from "@/lib/db/schema";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";

const AVAIL_KEY: Record<AvailabilityStatus, MessageKey> = { available: "avail.available", partial: "avail.partial", unavailable: "avail.unavailable" };

/*
 * Prescriptions sent to this pharmacy's wilaya. Every pharmacy there sees them;
 * each answers once (prescription_responses): what it has, a note, and
 * optionally a colleague to send the patient to.
 */
export function PrescriptionsInbox({ pharmacy, pharmacistId }: { pharmacy: PharmacyRow; pharmacistId: string }) {
  const { t } = useT();
  const db = useTables();
  const mine = db.prescriptions
    .filter((p) => p.status !== "closed" && (p.wilaya ?? "").toLowerCase() === pharmacy.wilaya.toLowerCase())
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const answered = new Set(db.prescription_responses.filter((r) => r.pharmacy_id === pharmacy.id).map((r) => r.prescription_id));
  const waiting = mine.filter((p) => !answered.has(p.id)).length;

  return (
    <section id="prescriptions" className="surface mt-6 scroll-mt-6 rounded-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <FileText className="size-4 text-green" aria-hidden /> {t("rxi.title")}
        </h2>
        {waiting > 0 && <span className="rounded-full bg-green px-2 py-0.5 font-mono text-xs font-medium text-white">{t("rxi.toAnswer", { n: waiting })}</span>}
        <span className="ms-auto text-xs text-muted">{t("rxi.scope", { wilaya: pharmacy.wilaya })}</span>
      </div>
      {mine.length === 0 ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">{t("rxi.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {mine.map((p) => (
            <PrescriptionItem key={p.id} p={p} pharmacy={pharmacy} pharmacistId={pharmacistId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PrescriptionItem({ p, pharmacy, pharmacistId }: { p: PrescriptionRow; pharmacy: PharmacyRow; pharmacistId: string }) {
  const { t, intl } = useT();
  const db = useTables();
  const time = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = prescriptionImageUrl(p.image_storage_path);
  const patient = db.users.find((u) => u.id === p.patient_id);
  const mine = db.prescription_responses.find((r) => r.prescription_id === p.id && r.pharmacy_id === pharmacy.id);
  const others = db.prescription_responses.filter((r) => r.prescription_id === p.id && r.pharmacy_id !== pharmacy.id).length;
  const colleagues = db.pharmacies.filter((x) => x.id !== pharmacy.id && x.wilaya === pharmacy.wilaya);

  return (
    <li className="flex gap-4 rounded-xl p-3 ring-1 ring-line">
      <button type="button" onClick={() => setZoom((z) => !z)} className={`shrink-0 overflow-hidden rounded-lg bg-paper ring-1 ring-line ${zoom ? "w-56" : "w-20"} transition-[width] duration-200`} aria-label={zoom ? t("rxi.shrink") : t("rxi.enlarge")}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from the mock storage
          <img src={image} alt={t("rxi.photo")} className="h-full w-full object-cover" />
        ) : (
          <span className="block h-20 w-full bg-paper-2" />
        )}
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-mono text-xs text-muted">
          <span dir="ltr">{patient?.phone}</span> · {time.format(Date.parse(p.created_at))}
          {others > 0 && <> · {t("rxi.others", { n: others })}</>}
        </p>
        {p.patient_notes && <p className="mt-1">“{p.patient_notes}”</p>}
        {mine ? (
          <p className="mt-2 rounded-lg bg-green-soft px-3 py-2 text-green">
            <strong>{t(AVAIL_KEY[mine.availability_status])}</strong>
            {mine.response_notes && <> · {mine.response_notes}</>}
          </p>
        ) : (
          <form
            noValidate
            className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const availability_status = String(d.get("availability")) as AvailabilityStatus;
              const referred = String(d.get("referred") ?? "");
              if (!AVAILABILITY_STATUSES.includes(availability_status)) return setError(t("rxi.sayWhat"));
              try {
                await respondToPrescription({
                  prescription_id: p.id,
                  pharmacy_id: pharmacy.id,
                  pharmacist_id: pharmacistId,
                  availability_status,
                  response_notes: String(d.get("message") ?? ""),
                  referred_pharmacy_id: referred || null,
                });
              } catch (err) {
                setError(writeErrorText(t, err));
              }
            }}
          >
            <label className="block">
              <span className="sr-only">{t("rxi.availability")}</span>
              <select name="availability" defaultValue="available" className="h-9 w-full rounded-lg bg-paper px-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-green">
                {AVAILABILITY_STATUSES.map((a) => (
                  <option key={a} value={a}>
                    {t(AVAIL_KEY[a])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">{t("rxi.messageLabel")}</span>
              <input name="message" maxLength={300} placeholder={t("rxi.messagePh")} className="h-9 w-full min-w-0 rounded-lg bg-paper px-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-green" />
            </label>
            <label className="block">
              <span className="sr-only">{t("rxi.referLabel")}</span>
              <select name="referred" defaultValue="" className="h-9 w-full rounded-lg bg-paper px-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-green">
                <option value="">{t("rxi.noReferral")}</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t("rxi.referTo", { name: c.name })}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-green px-3 text-xs font-medium text-white hover:bg-green-700 sm:justify-self-start">
              <Send className="size-3.5 rtl:-scale-x-100" aria-hidden /> {t("rxi.answer")}
            </button>
            {error && (
              <p role="alert" className="text-xs text-danger sm:col-span-2">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </li>
  );
}
