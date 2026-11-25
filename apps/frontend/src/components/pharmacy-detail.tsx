"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Clock, MapPin, Phone, Search, Star } from "lucide-react";
import { maxReservable, useTables } from "@/lib/db/api";
import { dutyShift, isOpenAt, lastUpdated, medicineAvailability, pharmacyDirectory, ratingCount } from "@/lib/db/views";
import { agoText, dciText, fmtPriceRange, hoursToday, medName, minutesSince, strengthText } from "@/lib/format";
import { useT } from "@/lib/locale";
import { useNow } from "@/lib/use-now";
import { ChifaBadge, RatingBadge } from "./pharmacy-meta";
import { ReserveDialog } from "./reserve-dialog";
import { SendPrescription } from "./send-prescription";
import { OpenBadge, StatusBadge } from "./status";

const PharmacyMap = dynamic(() => import("./pharmacy-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
});

export function PharmacyDetail({ id }: { id: string }) {
  const { t, intl } = useT();
  const db = useTables();
  const now = useNow();
  const nowMs = now?.getTime() ?? null;
  const [q, setQ] = useState("");

  const p = useMemo(() => pharmacyDirectory(db, nowMs).find((x) => x.id === id), [db, nowMs, id]);
  const owner = useMemo(() => {
    const row = db.pharmacies.find((x) => x.id === id);
    return row ? db.users.find((u) => u.id === row.owner_id) : undefined;
  }, [db, id]);
  const items = useMemo(() => {
    const meds = new Map(db.medicines.map((m) => [m.id, m]));
    return medicineAvailability(db, nowMs ?? 0, { pharmacyId: id }).map((a) => ({ a, m: meds.get(a.medicine_id)! }));
  }, [db, nowMs, id]);

  const lines = useMemo(() => {
    const needle = q.toLowerCase();
    return items
      .filter(({ m }) => !needle || (m.commercial_name + m.generic_dci_name).toLowerCase().includes(needle))
      .sort((x, y) => x.m.commercial_name.localeCompare(y.m.commercial_name));
  }, [items, q]);

  if (!p) {
    return (
      <section className="mx-auto max-w-xl px-4 py-32 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("ph.notFound")}</h1>
        <Link href="/search" className="mt-6 inline-flex h-10 items-center rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700">
          {t("rv.searchCta")}
        </Link>
      </section>
    );
  }

  const open = nowMs === null ? null : isOpenAt(p.opening_hours, nowMs);
  const shift = nowMs === null ? undefined : dutyShift(p.id, nowMs);
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const inStock = items.filter(({ a }) => a.stock_status !== "out_of_stock").length;

  return (
    <>
      <section className="dusk-band">
        <div className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6">
          <Link href="/search" className="inline-flex items-center gap-1.5 text-sm text-dusk-muted hover:text-dusk-ink">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t("ph.back")}
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{p.name}</h1>
            <OpenBadge open={open} onDuty={p.is_on_duty_now} night />
          </div>
          {owner && <p className="mt-2 text-dusk-muted">{t("ph.inCharge", { name: owner.full_name })}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <RatingBadge avg={p.rating_avg} count={ratingCount(db, p.id)} night />
          </div>
          <div className="mt-6">
            <SendPrescription wilaya={p.wilaya} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <dl className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <Fact icon={<MapPin className="size-4" />} label={t("ph.address")} value={`${p.address}, ${p.commune}, ${p.wilaya}`} />
            <Fact
              icon={<Clock className="size-4" />}
              label={t("ph.hours")}
              value={
                nowMs === null
                  ? "–"
                  : shift
                    ? t("ph.onDutyShift", { hours: hoursToday(t, p.opening_hours, nowMs), from: time.format(Date.parse(shift.starts_at)), to: time.format(Date.parse(shift.ends_at)) })
                    : hoursToday(t, p.opening_hours, nowMs)
              }
            />
            {p.phone && (
              <Fact
                icon={<Phone className="size-4" />}
                label={t("ph.phone")}
                value={
                  <a href={`tel:${p.phone.replace(/\s/g, "")}`} dir="ltr" className="font-mono text-sm underline decoration-line underline-offset-4 hover:decoration-green">
                    {p.phone}
                  </a>
                }
              />
            )}
          </dl>
          <div className="h-56 overflow-hidden rounded-card bg-paper-2 ring-1 ring-line lg:h-full lg:min-h-64">
            {p.location ? (
              <PharmacyMap origin={p.location} points={[{ id: p.id, name: p.name, lat: p.location.lat, lng: p.location.lng, status: "in", onDuty: p.is_on_duty_now }]} highlighted={p.id} />
            ) : (
              <p className="grid h-full place-items-center p-6 text-center text-sm text-muted">{t("ph.noLocation")}</p>
            )}
          </div>
        </div>

        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{t("ph.shelf")}</h2>
              <p className="mt-1 font-mono text-sm text-muted nums">{t("ph.linesIn", { n: inStock, total: items.length })}</p>
            </div>
            <label className="surface flex h-10 w-full items-center gap-2 rounded-xl px-3 sm:w-72">
              <Search className="size-4 text-muted" aria-hidden />
              <span className="sr-only">{t("ph.filterLabel")}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ph.filter")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
            </label>
          </div>

          <div className="surface relative mt-5 overflow-x-auto rounded-card">
            <table className="w-full min-w-[560px] text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 text-start font-medium">{t("ph.colMedicine")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("ph.colDci")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("ph.colPrice")}</th>
                  <th className="px-5 py-3 text-start font-medium">{t("ph.colAvail")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {lines.map(({ a, m }) => {
                  const updated = lastUpdated(db, p.id, m.id);
                  const reservable = maxReservable(db, p.id, m.id);
                  return (
                    <tr key={m.id}>
                      <td className="px-5 py-3.5">
                        <span className="font-medium">{medName(m)}</span> <span className="font-mono text-xs text-muted">{strengthText(m.strength)}</span>
                        {m.chifa_reimbursable && <span className="ms-2 align-middle"><ChifaBadge /></span>}
                      </td>
                      <td className="px-5 py-3.5 text-muted">{dciText(m)}</td>
                      <td className="px-5 py-3.5 font-mono nums">{fmtPriceRange(a.min_price_dzd, a.max_price_dzd) || "–"}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <StatusBadge status={a.stock_status} qty={a.total_available} />
                          {updated && nowMs !== null && <span className="hidden font-mono text-[11px] text-muted md:inline">{agoText(t, minutesSince(updated, nowMs))}</span>}
                          <span className="ms-auto">
                            <ReserveDialog pharmacy={p} medicine={m} available={reservable} priceDzd={a.min_price_dzd} compact />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!lines.length && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted">
                      {q ? t("ph.noLine", { q }) : t("ph.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <Reviews pharmacyId={p.id} />
      </div>
    </>
  );
}

/* pharmacy_ratings with a comment, newest first. Ratings exist only for completed reservations. */
function Reviews({ pharmacyId }: { pharmacyId: string }) {
  const { t, intl } = useT();
  const db = useTables();
  const date = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Algiers" });
  const reviews = db.pharmacy_ratings
    .filter((r) => r.pharmacy_id === pharmacyId && r.comment)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  if (!reviews.length) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t("ph.reviews")}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {reviews.map((r) => (
          <li key={r.id} className="surface rounded-card p-4 text-sm">
            <p className="flex items-center gap-0.5" aria-label={t("rv.stars", { n: r.rating })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`size-4 ${n <= r.rating ? "fill-amber text-amber" : "text-line"}`} aria-hidden />
              ))}
              <span className="ms-2 font-mono text-xs text-muted">{date.format(Date.parse(r.created_at))}</span>
            </p>
            <p className="mt-2 whitespace-pre-line break-words">{r.comment}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 text-sm">{value}</dd>
    </div>
  );
}
