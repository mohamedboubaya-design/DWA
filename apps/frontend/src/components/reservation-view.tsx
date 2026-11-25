"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Clock, FlaskConical, Loader2, MapPin, Phone, ShieldCheck, Star, Store, X } from "lucide-react";
import { DEPOSIT_DZD, closeReservation, depositPayment, errorKey, ratePharmacy, startDepositCheckout, sweepExpiredReservations, useTables, writeErrorText } from "@/lib/db/api";
import type { ReservationStatus } from "@/lib/db/schema";
import { fmtPrice, medName, strengthText } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";
import { useNow } from "@/lib/use-now";

const STEPS: { key: ReservationStatus; label: MessageKey }[] = [
  { key: "pending_payment", label: "rv.step.sent" },
  { key: "confirmed_held", label: "rv.step.confirmed" },
  { key: "ready_for_pickup", label: "rv.step.ready" },
  { key: "completed", label: "rv.step.collected" },
];

export const STATUS_KEY: Record<ReservationStatus, MessageKey> = {
  pending_payment: "rv.st.pending",
  confirmed_held: "rv.st.confirmed",
  ready_for_pickup: "rv.st.ready",
  completed: "rv.st.completed",
  expired: "rv.st.expired",
  cancelled: "rv.st.cancelled",
};

export function ReservationView({ id, checkout }: { id: string; checkout: "returned" | "cancelled" | null }) {
  const { t, intl } = useT();
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const db = useTables();
  const now = useNow();
  const r = db.reservations.find((x) => x.id === id);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holds past their deadline expire (the server runs fn_expire_due_reservations on a schedule).
  useEffect(() => {
    if (now) sweepExpiredReservations(now.getTime());
  }, [now]);

  if (!r) {
    return (
      <section className="mx-auto max-w-xl px-4 py-32 text-center sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("rv.notFound")}</h1>
        <p className="mt-2 text-muted">{t("rv.notFoundHelp")}</p>
        <Link href="/search" className="mt-6 inline-flex h-10 items-center rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700">
          {t("rv.searchCta")}
        </Link>
      </section>
    );
  }

  const p = db.pharmacies.find((x) => x.id === r.pharmacy_id)!;
  const batch = db.pharmacy_stock.find((s) => s.id === r.stock_id);
  const m = db.medicines.find((x) => x.id === batch?.medicine_id);
  const payment = depositPayment(db, r.id);
  const rating = db.pharmacy_ratings.find((x) => x.reservation_id === r.id);
  const stepIndex = STEPS.findIndex((s) => s.key === r.status);
  const ended = r.status === "cancelled" || r.status === "expired";
  const open = !ended && r.status !== "completed";
  const unit = batch?.price_dzd ?? null;
  const total = unit === null ? null : unit * r.quantity - (payment?.status === "paid" ? DEPOSIT_DZD : 0);

  return (
    <>
      <section className="dusk-band">
        <div className="mx-auto max-w-4xl px-4 pt-28 pb-10 sm:px-6">
          <p className="text-sm text-dusk-muted">{t("rv.code")}</p>
          <p dir="ltr" className="mt-1 text-start font-mono text-5xl font-semibold tracking-[0.2em] text-dusk-mint sm:text-6xl">{r.pickup_code ?? "––––––"}</p>
          <p className="mt-3 text-dusk-muted">{t("rv.giveCode", { name: p.name })}</p>
          <p className="mt-1 text-xs text-dusk-muted">{t("rv.keepLink")}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 pt-8 pb-24 sm:px-6 md:grid-cols-[1.2fr_1fr]">
        <div className="surface rounded-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-semibold">{t(STATUS_KEY[r.status])}</h1>
            {open && r.hold_expires_at && (
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
                <Clock className="size-3.5" aria-hidden /> {t("rv.heldUntil", { time: time.format(Date.parse(r.hold_expires_at)) })}
              </span>
            )}
          </div>

          {!ended && (
            <ol className="mt-6 space-y-5">
              {STEPS.map((s, i) => {
                const done = i < stepIndex || (i === stepIndex && r.status === "completed");
                const current = i === stepIndex && r.status !== "completed";
                return (
                  <li key={s.key} className="flex items-center gap-3">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full ring-1 transition-colors duration-300 ${
                        done ? "bg-green text-white ring-green" : current ? "bg-green-soft text-green ring-green" : "bg-paper text-muted ring-line"
                      }`}
                    >
                      {done ? <Check className="size-4" aria-hidden /> : current ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className="text-xs">{i + 1}</span>}
                    </span>
                    <span className={`text-sm ${done || current ? "font-medium text-ink" : "text-muted"}`}>{t(s.label)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {r.status === "pending_payment" && (
            <p className="mt-6 flex items-start gap-2 rounded-xl bg-paper p-4 text-sm text-muted">
              <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {t("rv.demo")}{" "}
                <Link href="/login" target="_blank" className="font-medium text-green underline underline-offset-4">
                  {t("rv.demoLink")}
                </Link>
              </span>
            </p>
          )}

          {r.status === "completed" && <RateBox reservationId={r.id} pharmacyName={p.name} rated={rating?.rating ?? null} />}

          {open && (
            <button
              type="button"
              onClick={() => closeReservation(r.id, "cancelled").catch((err) => setError(writeErrorText(t, err)))}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-danger"
            >
              <X className="size-4" aria-hidden /> {t("rv.cancel")}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="surface rounded-card p-5 text-sm">
            {m && (
              <p className="font-semibold">
                {r.quantity} × {medName(m)} <span className="font-mono text-xs text-muted">{strengthText(m.strength)}</span>
              </p>
            )}
            <dl className="mt-4 space-y-2.5">
              <Row icon={<Store className="size-4" />} label={p.name} />
              <Row icon={<MapPin className="size-4" />} label={`${p.address}, ${p.commune}`} />
              {p.phone && (
                <Row
                  icon={<Phone className="size-4" />}
                  label={
                    <a href={`tel:${p.phone.replace(/\s/g, "")}`} dir="ltr" className="font-mono underline decoration-line underline-offset-4 hover:decoration-green">
                      {p.phone}
                    </a>
                  }
                />
              )}
            </dl>
            {total !== null && (
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                <span className="text-muted">{t("rv.toPay")}</span>
                <span className="font-mono text-lg font-medium nums">{fmtPrice(total)}</span>
              </div>
            )}
            {m?.is_prescription_only && <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink">{t("rv.bringRx")}</p>}
          </div>

          <div className="surface rounded-card p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-green" aria-hidden /> {t("rv.deposit")}
            </p>
            {r.hold_duration_hours === 2 ? (
              <p className="mt-2 text-muted">{t("rv.noDeposit")}</p>
            ) : payment?.status === "paid" ? (
              <>
                <p className="mt-2 text-green">{t("rv.paid", { price: fmtPrice(payment.amount_dzd) })}</p>
                {!payment.webhook_verified && <p className="mt-1 text-xs text-muted">{t("rv.unverified")}</p>}
              </>
            ) : !open ? (
              <p className="mt-2 text-muted">{t("rv.depositClosed")}</p>
            ) : (
              <>
                <p className="mt-2 text-muted">
                  {payment?.status === "pending" && checkout === "returned"
                    ? t("rv.confirming")
                    : `${payment?.status === "failed" || checkout === "cancelled" ? `${t("rv.failed")} ` : ""}${t("rv.depositHelp", { price: fmtPrice(DEPOSIT_DZD) })}`}
                </p>
                <button
                  type="button"
                  disabled={paying}
                  onClick={async () => {
                    setPaying(true);
                    setError(null);
                    try {
                      await startDepositCheckout(r.id);
                    } catch (err) {
                      setPaying(false);
                      setError(["storage_full", "storage_unavailable"].includes(errorKey(err)) ? writeErrorText(t, err) : t("rv.payError"));
                    }
                  }}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 font-medium text-paper hover:bg-ink/90 disabled:opacity-60"
                >
                  {paying && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {t("rv.pay", { price: fmtPrice(DEPOSIT_DZD) })}
                </button>
              </>
            )}
          </div>

          <Link href="/me" className="block text-center text-sm font-medium text-green underline underline-offset-4">
            {t("rv.all")}
          </Link>
        </div>
      </div>
    </>
  );
}

/* pharmacy_ratings: once, after the reservation is completed. */
function RateBox({ reservationId, pharmacyName, rated }: { reservationId: string; pharmacyName: string; rated: number | null }) {
  const { t } = useT();
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (rated) {
    return (
      <div className="mt-6 rounded-xl bg-paper p-4">
        <p className="text-sm font-medium">{t("rv.rateThanks")}</p>
        <p className="mt-2 flex gap-1" aria-label={t("rv.stars", { n: rated })}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`size-5 ${n <= rated ? "fill-amber text-amber" : "text-line"}`} aria-hidden />
          ))}
        </p>
      </div>
    );
  }
  return (
    <form
      className="mt-6 rounded-xl bg-paper p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stars) return setError(t("rv.pickStars"));
        try {
          await ratePharmacy(reservationId, stars as 1 | 2 | 3 | 4 | 5, comment);
        } catch (err) {
          setError(writeErrorText(t, err));
        }
      }}
    >
      <p className="text-sm font-medium">{t("rv.rateQ", { name: pharmacyName })}</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t("rv.rateLabel")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t("rv.stars", { n })}
            onClick={() => setStars(n)}
            className="grid size-9 place-items-center rounded-lg transition-transform duration-150 hover:scale-110 active:scale-95"
          >
            <Star className={`size-6 ${n <= stars ? "fill-amber text-amber" : "text-line"}`} aria-hidden />
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">{t("rv.comment")}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={500} placeholder={t("rv.comment")} className="w-full rounded-xl bg-surface px-3 py-2 text-sm ring-1 ring-line outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-green" />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="mt-2 h-9 rounded-lg bg-green px-3 text-sm font-medium text-white hover:bg-green-700">
        {t("rv.rateSend")}
      </button>
    </form>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-muted">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-ink">{label}</span>
    </div>
  );
}
