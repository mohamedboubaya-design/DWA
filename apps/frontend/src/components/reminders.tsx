"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Pill, Plus, RotateCcw, Trash2 } from "lucide-react";
import { REFILL_LEAD_DAYS, addRefillReminder, markRefilled, stopAlert, useGuest, useTables, validPhone, writeErrorText } from "@/lib/db/api";
import type { MedicineRow, StockAlertReminderRow } from "@/lib/db/schema";
import { medLabel, medName } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useT } from "@/lib/locale";
import { ConsentField } from "./consent-field";

const DAY = 86_400_000;
const noop = () => () => {};

/** Days of treatment left: next_trigger_at is REFILL_LEAD_DAYS before the box runs out. */
const daysLeft = (a: StockAlertReminderRow, now: number) => Math.floor((Date.parse(a.next_trigger_at ?? "") + REFILL_LEAD_DAYS * DAY - now) / DAY);

function useMyReminders() {
  const db = useTables();
  const guest = useGuest();
  return db.stock_alerts_reminders
    .filter((a) => guest.alert_ids.includes(a.id) && a.alert_type === "refill_reminder" && a.is_active && a.next_trigger_at)
    .map((a) => ({ a, m: db.medicines.find((m) => m.id === a.medicine_id)! }))
    .filter((x) => x.m);
}

/*
 * Long-term treatments (stock_alerts_reminders, refill_reminder): the patient
 * says how long a box lasts and how much is left; the reminder fires
 * REFILL_LEAD_DAYS before the box is empty. The backend sends it by SMS; while
 * the site is open, this device can also show a notification.
 */
export function Reminders() {
  const { t: tr } = useT();
  const reminders = useMyReminders();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const permission = useSyncExternalStore(
    noop,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => null,
  );
  const [answered, setAnswered] = useState<NotificationPermission | null>(null);
  const notifyState = answered ?? permission;

  // While the site is open, remind on this device once per day for treatments that are due.
  useEffect(() => {
    if (!now || notifyState !== "granted") return;
    const today = new Date().toDateString();
    for (const { a, m } of reminders) {
      const left = daysLeft(a, now.getTime());
      const key = `dwa-reminded-${a.id}`;
      if (left <= REFILL_LEAD_DAYS && localStorage.getItem(key) !== today) {
        new Notification(tr("tr.notifTitle", { name: medName(m) }), { body: left <= 0 ? tr("tr.notifOut") : tr("tr.notifLeft", { n: left }), tag: a.id });
        localStorage.setItem(key, today);
      }
    }
  }, [now, notifyState, reminders, tr]);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Pill className="size-5" aria-hidden /> {tr("tr.title")}
        </h2>
        {notifyState === "default" && (
          <button
            type="button"
            onClick={async () => setAnswered(await Notification.requestPermission())}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-green ring-1 ring-line hover:bg-surface"
          >
            <BellRing className="size-4" aria-hidden /> {tr("tr.remind")}
          </button>
        )}
        {notifyState === "granted" && <span className="ms-auto text-xs text-green">{tr("tr.remindOn")}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{tr("tr.lede", { n: REFILL_LEAD_DAYS })}</p>

      {reminders.length > 0 && (
        <ul className="surface mt-4 divide-y divide-line/70 rounded-card p-1.5">
          {reminders.map(({ a, m }) => (
            <ReminderRow key={a.id} a={a} m={m} now={now?.getTime() ?? null} />
          ))}
        </ul>
      )}

      {adding ? (
        <AddReminder onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium ring-1 ring-line hover:bg-surface">
          <Plus className="size-4" aria-hidden /> {tr("tr.add")}
        </button>
      )}
    </section>
  );
}

function ReminderRow({ a, m, now }: { a: StockAlertReminderRow; m: MedicineRow; now: number | null }) {
  const { t: tr, intl } = useT();
  const dateFmt = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Algiers" });
  const left = now === null ? null : daysLeft(a, now);
  const interval = a.refill_interval_days ?? 30;
  const due = left !== null && left <= REFILL_LEAD_DAYS;
  const out = left !== null && left <= 0;
  const runOut = Date.parse(a.next_trigger_at ?? "") + REFILL_LEAD_DAYS * DAY;

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{medLabel(m)}</span>
          <span className="block text-xs text-muted">
            {tr("tr.boxLasts", { n: interval })}
            {now !== null && <> · {tr("tr.runsOut", { date: dateFmt.format(runOut) })}</>}
          </span>
        </span>
        <span className={`font-mono text-sm font-medium nums ${out ? "text-danger" : due ? "text-amber-ink" : "text-green"}`}>
          {left === null ? "–" : out ? tr("tr.out") : left === 1 ? tr("tr.daysLeft1") : tr("tr.daysLeftN", { n: left })}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2" aria-hidden>
        <div
          className={`h-full origin-left rounded-full transition-transform duration-500 ${out ? "bg-danger" : due ? "bg-amber" : "bg-green"}`}
          style={{ transform: `scaleX(${left === null ? 1 : Math.min(1, Math.max(0, left / interval))})` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {due && (
          <Link href={`/search?q=${encodeURIComponent(medName(m))}&stocked=1`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green px-3 text-xs font-medium text-white hover:bg-green-700">
            {tr("tr.refill")}
          </Link>
        )}
        <button type="button" onClick={() => void markRefilled(a.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ring-1 ring-line hover:bg-paper">
          <RotateCcw className="size-3.5" aria-hidden /> {tr("tr.bought")}
        </button>
        <button
          type="button"
          onClick={() => void stopAlert(a.id)}
          aria-label={tr("tr.stop", { name: medName(m) })}
          className="ms-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function AddReminder({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const db = useTables();
  const guest = useGuest();
  const [error, setError] = useState<string | null>(null);
  const meds = [...db.medicines].sort((a, b) => a.commercial_name.localeCompare(b.commercial_name));

  return (
    <form
      noValidate
      className="surface mt-4 grid gap-4 rounded-card p-5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const interval = Number(d.get("interval"));
        const left = Number(d.get("left"));
        const phone = String(d.get("phone") ?? "");
        if (!(interval >= 1 && interval <= 365)) return setError(t("tr.intervalError"));
        if (!(left >= 0 && left <= 365)) return setError(t("tr.leftError"));
        if (!validPhone(phone)) return setError(t("common.phoneError"));
        if (d.get("consent") !== "on") return setError(t("consent.required"));
        try {
          await addRefillReminder({ medicine_id: String(d.get("medicine")), phone, refill_interval_days: interval, days_left: left });
          onDone();
        } catch (err) {
          setError(writeErrorText(t, err));
        }
      }}
    >
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium">{t("tr.medicine")}</span>
        <select name="medicine" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-green">
          {meds.map((m) => (
            <option key={m.id} value={m.id}>
              {medLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t("tr.intervalLabel")}</span>
        <input name="interval" type="number" min={1} max={365} defaultValue={30} inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none focus:ring-2 focus:ring-green" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t("tr.leftLabel")}</span>
        <input name="left" type="number" min={0} max={365} defaultValue={20} inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none focus:ring-2 focus:ring-green" />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-sm font-medium">{t("common.phone")}</span>
        <input name="phone" type="tel" autoComplete="tel" defaultValue={guest.phone?.replace(/^\+213/, "0") ?? ""} placeholder={t("common.phonePh")} dir="ltr" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-green" />
        <span className="mt-1 block text-xs text-muted">{t("tr.smsHint")}</span>
      </label>
      <div className="sm:col-span-2">
        <ConsentField />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onDone} className="h-11 rounded-xl px-3 text-sm font-medium text-muted hover:text-ink">
          {t("common.cancel")}
        </button>
        <button type="submit" className="h-11 rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700">
          {t("tr.addButton")}
        </button>
      </div>
    </form>
  );
}

/* Small banner shown on the search page when a tracked treatment is due. */
export function RefillBanner() {
  const { t } = useT();
  const reminders = useMyReminders();
  const now = useNow();
  if (!now) return null;
  const due = reminders.filter(({ a }) => daysLeft(a, now.getTime()) <= REFILL_LEAD_DAYS);
  if (!due.length) return null;
  const names = due.map(({ m }) => medName(m)).join(", ");
  return (
    <Link href="/me#treatments" className="mb-6 flex items-center gap-3 rounded-card bg-amber-soft px-5 py-4 text-sm text-amber-ink hover:ring-1 hover:ring-amber">
      <BellRing className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">
        <strong>{t("tr.banner")}</strong> {t("tr.bannerBody", { names })}
      </span>
      <span className="font-medium underline underline-offset-4">{t("tr.see")}</span>
    </Link>
  );
}
