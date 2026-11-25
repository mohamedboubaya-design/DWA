"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BellRing, ExternalLink, FileText, LogOut, Minus, MoonStar, Package, Plus, Search, ShieldAlert, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import { deleteBatch, errorKey, restoreBatch, setBatchTotal, signOut, useTables, writeErrorText, type Session } from "@/lib/db/api";
import type { PharmacyRow, PharmacyStockRow } from "@/lib/db/schema";
import { stockStatus } from "@/lib/db/functions";
import { dutyShift } from "@/lib/db/views";
import { agoText, dciText, fmtPrice, medName, minutesSince, strengthText } from "@/lib/format";
import { useT } from "@/lib/locale";
import { LanguageSwitcher } from "../language-switcher";
import { useNow } from "@/lib/use-now";
import { LogoMark } from "../logo";
import { StatusBadge } from "../status";
import { AddBatchDialog } from "./add-batch-dialog";
import { DemandPanel } from "./demand-panel";
import { PrescriptionsInbox } from "./prescriptions-inbox";
import { ReferDialog } from "./refer-dialog";
import { ScanDialog } from "./scan-dialog";
import { ReservationsInbox } from "./reservations-inbox";

const EXPIRY_WINDOW_DAYS = 90;
const MAX_BOXES = 9999;
type Filter = "all" | "attention" | "low" | "out" | "expiring";

export function StockManager({ session }: { session: Session }) {
  const { t } = useT();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const pharmacy = session.pharmacies.find((p) => p.id === picked) ?? session.pharmacies[0];

  const out = () => {
    signOut();
    router.push("/login");
  };

  if (!pharmacy) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <div>
          <p className="font-display text-2xl font-semibold">{t("dash.noPharmacy")}</p>
          <button type="button" onClick={out} className="mt-4 text-sm font-medium text-green underline underline-offset-4">
            {t("dash.signOut")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-paper">
      {/* Side rail */}
      <aside className="dusk-band sticky top-0 hidden h-dvh w-64 shrink-0 flex-col p-5 lg:flex">
        <Link href="/" className="flex items-center gap-2 text-dusk-mint">
          <LogoMark className="size-7 [--color-paper:var(--color-dusk)]" />
          <span className="font-display text-xl font-bold text-dusk-ink">dwa</span>
          <span className="ms-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-dusk-muted">{t("dash.pharmacist")}</span>
        </Link>
        <div className="night-card mt-8 rounded-xl p-4">
          <PharmacyPicker pharmacies={session.pharmacies} value={pharmacy.id} onChange={setPicked} />
          <p className="text-sm text-dusk-muted">
            {pharmacy.commune}, {pharmacy.wilaya}
          </p>
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-dusk-muted">
            {t("dash.signedInAs", { name: session.user.full_name })}
            <span className="block truncate" dir="ltr">
              {session.user.email}
            </span>
          </p>
        </div>
        <nav aria-label={t("dash.navLabel")} className="mt-6 space-y-1 text-sm">
          <a href="#stock" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-dusk-muted hover:bg-white/5 hover:text-dusk-ink">
            <Package className="size-4" aria-hidden /> {t("dash.stock")}
          </a>
          <a href="#reservations" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-dusk-muted hover:bg-white/5 hover:text-dusk-ink">
            <BellRing className="size-4" aria-hidden /> {t("dash.reservations")}
          </a>
          <a href="#prescriptions" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-dusk-muted hover:bg-white/5 hover:text-dusk-ink">
            <FileText className="size-4" aria-hidden /> {t("rxi.title")}
          </a>
          <Link href={`/pharmacy/${pharmacy.id}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-dusk-muted hover:bg-white/5 hover:text-dusk-ink">
            <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden /> {t("dash.publicPage")}
          </Link>
        </nav>
        <button type="button" onClick={out} className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-dusk-muted hover:bg-white/5 hover:text-dusk-ink">
          <LogOut className="size-4 rtl:-scale-x-100" aria-hidden /> {t("dash.signOut")}
        </button>
        <div className="mt-3">
          <LanguageSwitcher />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {/* Small screens: the rail is hidden, so its essentials live here. */}
        <div className="mb-4 flex flex-wrap items-center gap-3 lg:hidden">
          <Link href="/" className="text-green" aria-label={t("nav.homeLabel")}>
            <LogoMark className="size-7" />
          </Link>
          <PharmacyPicker pharmacies={session.pharmacies} value={pharmacy.id} onChange={setPicked} light />
          <button type="button" onClick={out} className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted ring-1 ring-line hover:text-ink">
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden /> {t("dash.signOut")}
          </button>
        </div>
        <Board key={pharmacy.id} pharmacy={pharmacy} session={session} />
      </main>
    </div>
  );
}

function PharmacyPicker({ pharmacies, value, onChange, light = false }: { pharmacies: PharmacyRow[]; value: string; onChange: (id: string) => void; light?: boolean }) {
  const { t } = useT();
  const current = pharmacies.find((p) => p.id === value)!;
  if (pharmacies.length < 2) return <p className={`font-semibold ${light ? "text-ink" : ""}`}>{current.name}</p>;
  return (
    <label className="block">
      <span className="sr-only">{t("dash.pickPharmacy")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-lg px-2 py-1 font-semibold outline-none focus:ring-2 focus:ring-dusk-mint ${light ? "bg-surface text-ink ring-1 ring-line" : "bg-white/10 text-dusk-ink"}`}>
        {pharmacies.map((p) => (
          <option key={p.id} value={p.id} className="text-ink">
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Board({ pharmacy, session }: { pharmacy: PharmacyRow; session: Session }) {
  const { t, intl } = useT();
  const dateFmt = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(intl, { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
  const db = useTables();
  const now = useNow();
  const nowMs = now?.getTime() ?? null;
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [removed, setRemoved] = useState<PharmacyStockRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verification = db.pharmacist_verifications.filter((v) => v.user_id === session.user.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const batches = useMemo(() => db.pharmacy_stock.filter((s) => s.pharmacy_id === pharmacy.id), [db, pharmacy.id]);
  const meds = useMemo(() => new Map(db.medicines.map((m) => [m.id, m])), [db]);
  const shift = nowMs === null ? undefined : dutyShift(pharmacy.id, nowMs);

  const available = (s: PharmacyStockRow) => s.total_quantity - s.reserved_quantity;
  const status = (s: PharmacyStockRow) => stockStatus(available(s), s.low_stock_threshold);
  // Whole calendar days in Algiers: a batch expiring tomorrow is "1 d", today "0 d".
  const today = nowMs === null ? null : Date.parse(new Date(nowMs + 3_600_000).toISOString().slice(0, 10));
  const daysLeft = (iso: string) => (today === null ? Infinity : Math.round((Date.parse(iso) - today) / 86_400_000));
  const isExpiring = (s: PharmacyStockRow) => s.total_quantity > 0 && daysLeft(s.expiry_date) <= EXPIRY_WINDOW_DAYS;

  const counts = {
    all: batches.length,
    low: batches.filter((s) => status(s) === "low_stock").length,
    out: batches.filter((s) => status(s) === "out_of_stock").length,
    expiring: batches.filter(isExpiring).length,
  };
  const attention = counts.low + counts.out + counts.expiring;

  const visible = batches
    .map((s) => ({ s, m: meds.get(s.medicine_id)! }))
    .filter(({ m }) => m)
    .filter(({ m }) => !q || (m.commercial_name + m.generic_dci_name).toLowerCase().includes(q.toLowerCase()))
    .filter(({ s }) => {
      const st = status(s);
      if (filter === "low") return st === "low_stock";
      if (filter === "out") return st === "out_of_stock";
      if (filter === "expiring") return isExpiring(s);
      if (filter === "attention") return st !== "in_stock" || isExpiring(s);
      return true;
    })
    .sort((a, b) => a.m.commercial_name.localeCompare(b.m.commercial_name) || a.s.expiry_date.localeCompare(b.s.expiry_date));

  const setTotal = (s: PharmacyStockRow, total: number) => {
    setError(null);
    if (total < s.reserved_quantity) return setError(t("dash.qtyError"));
    if (total > MAX_BOXES) return setError(t("dash.qtyMax", { n: MAX_BOXES }));
    setBatchTotal(s.id, total).catch((e) => setError(errorKey(e) === "check_violation" ? t("dash.qtyError") : writeErrorText(t, e)));
  };

  /** A typed quantity: empty or invalid input puts the old value back instead of wiping the stock. */
  const commitTyped = (input: HTMLInputElement, s: PharmacyStockRow) => {
    const raw = input.value.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < s.reserved_quantity || n > MAX_BOXES) {
      input.value = String(s.total_quantity);
      if (raw !== "") setError(n > MAX_BOXES ? t("dash.qtyMax", { n: MAX_BOXES }) : n < s.reserved_quantity ? t("dash.qtyError") : t("dash.qtyInvalid"));
      return;
    }
    if (n !== s.total_quantity) setTotal(s, n);
  };

  const remove = async (s: PharmacyStockRow) => {
    setError(null);
    try {
      setRemoved(await deleteBatch(s.id));
    } catch (e) {
      setError(errorKey(e) === "foreign_key_violation" ? t("dash.deleteBlocked") : writeErrorText(t, e));
    }
  };

  return (
    <>
      {verification && verification.status !== "verified" && (
        <div className={`mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${verification.status === "rejected" ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber-ink"}`}>
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{verification.status === "rejected" ? t("dash.rejected", { reason: verification.rejection_reason ?? "" }) : t("dash.pending", { license: verification.license_number })}</p>
        </div>
      )}

      <header className="flex flex-wrap items-center gap-4">
        <div className="me-auto">
          <h1 id="stock" className="scroll-mt-6 font-display text-3xl font-semibold tracking-tight">
            {t("dash.stock")}
          </h1>
        </div>
        <span className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ${shift && nowMs !== null && Date.parse(shift.starts_at) <= nowMs ? "bg-night text-neon ring-night" : "bg-surface text-muted ring-line"}`}>
          <MoonStar className="size-4" aria-hidden />
          {shift ? t("dash.dutyShift", { from: time.format(Date.parse(shift.starts_at)), to: time.format(Date.parse(shift.ends_at)) }) : t("dash.noDuty")}
        </span>
        <ScanDialog pharmacyId={pharmacy.id} />
        <AddBatchDialog pharmacyId={pharmacy.id} />
      </header>

      <div className="grid gap-x-6 xl:grid-cols-2">
        <ReservationsInbox pharmacyId={pharmacy.id} />
        <DemandPanel pharmacy={pharmacy} />
      </div>
      <PrescriptionsInbox pharmacy={pharmacy} pharmacistId={session.user.id} />

      {/* Tiles double as filters */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t("dash.carried")} value={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
        <Tile label={t("dash.lowTile")} value={counts.low} tone="amber" active={filter === "low"} onClick={() => setFilter("low")} />
        <Tile label={t("dash.outTile")} value={counts.out} tone="danger" active={filter === "out"} onClick={() => setFilter("out")} />
        <Tile label={t("dash.expiring", { n: EXPIRY_WINDOW_DAYS })} value={nowMs === null ? null : counts.expiring} tone="amber" active={filter === "expiring"} onClick={() => setFilter("expiring")} />
      </div>

      {attention > 0 && filter === "all" && (
        <button type="button" onClick={() => setFilter("attention")} className="mt-4 flex w-full items-center gap-3 rounded-xl bg-amber-soft px-4 py-3 text-start text-sm text-amber-ink">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>{t("dash.attention", { n: attention })}</strong> {t("dash.attentionBody")}
          </span>
          <span className="font-medium underline underline-offset-4">{t("dash.showThem")}</span>
        </button>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-full items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-green sm:w-72">
          <Search className="size-4 text-muted" aria-hidden />
          <span className="sr-only">{t("dash.searchStock")}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dash.searchStock")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        </label>
        {filter !== "all" && (
          <button type="button" onClick={() => setFilter("all")} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper">
            {t("dash.showing", { filter: filter === "attention" ? t("dash.f.attention") : filter === "low" ? t("dash.f.low") : filter === "out" ? t("dash.f.out") : t("dash.f.expiring") })}
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="surface relative mt-4 overflow-x-auto rounded-card">
        <table className="w-full min-w-[860px] text-start text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-5 py-3 text-start font-medium">{t("dash.colMedicine")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colBatch")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colQty")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colStatus")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colExpiry")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colPrice")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("dash.colUpdated")}</th>
              <th className="px-5 py-3">
                <span className="sr-only">{t("dash.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {visible.map(({ s, m }, i) => {
              const days = daysLeft(s.expiry_date);
              const expiring = isExpiring(s);
              const st = status(s);
              return (
                <tr key={s.id} className="row-in" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <td className="px-5 py-3">
                    <p className="font-medium">
                      {medName(m)} <span className="font-mono text-xs text-muted">{strengthText(m.strength)}</span>
                    </p>
                    <p className="text-xs text-muted">{dciText(m)}</p>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted" dir="ltr">
                    {s.batch_barcode}
                  </td>
                  <td className="px-5 py-3">
                    <div className="inline-flex items-center rounded-lg bg-surface ring-1 ring-line">
                      <button type="button" onClick={() => setTotal(s, s.total_quantity - 1)} disabled={s.total_quantity <= s.reserved_quantity} aria-label={t("dash.oneLess", { name: medName(m) })} className="grid size-9 place-items-center rounded-s-lg text-muted hover:bg-paper hover:text-ink disabled:opacity-30">
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        key={s.updated_at}
                        type="number"
                        inputMode="numeric"
                        min={s.reserved_quantity}
                        defaultValue={s.total_quantity}
                        max={MAX_BOXES}
                        onBlur={(e) => commitTyped(e.currentTarget, s)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label={t("dash.qtyOf", { name: medName(m) })}
                        className="qty-input h-9 w-14 bg-transparent text-center font-mono nums outline-none"
                      />
                      <button type="button" onClick={() => setTotal(s, s.total_quantity + 1)} aria-label={t("dash.oneMore", { name: medName(m) })} className="grid size-9 place-items-center rounded-e-lg text-muted hover:bg-paper hover:text-ink">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    {s.reserved_quantity > 0 && <p className="mt-1 text-xs text-muted">{t("dash.reserved", { n: s.reserved_quantity })}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={st} />
                  </td>
                  <td className={`px-5 py-3 font-mono text-xs nums ${expiring ? "font-medium text-amber-ink" : "text-muted"}`}>
                    {dateFmt.format(new Date(s.expiry_date))}
                    {expiring && <span className="ms-1.5">· {days < 0 ? t("dash.expired") : t("dash.days", { n: days })}</span>}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs nums text-muted">{s.price_dzd === null ? "–" : fmtPrice(s.price_dzd)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{nowMs === null ? "–" : agoText(t, minutesSince(s.updated_at, nowMs))}</td>
                  <td className="px-5 py-3 text-end">
                    <span className="inline-flex items-center gap-1.5">
                      {st !== "in_stock" && <ReferDialog from={pharmacy} medicine={m} />}
                      <button type="button" onClick={() => remove(s)} aria-label={t("dash.stopListing", { name: medName(m) })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold">{batches.length ? t("dash.nothing") : t("dash.empty")}</p>
            <p className="mt-1 text-sm text-muted">{filter !== "all" || q ? t("dash.noMatch") : t("dash.addFirst")}</p>
          </div>
        )}
      </div>

      {removed && (
        <div role="status" className="toast-in fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-lg">
          <span>{t("dash.removed", { name: medName(meds.get(removed.medicine_id) ?? { commercial_name: "" }) })}</span>
          <button
            type="button"
            onClick={() => {
              void restoreBatch(removed);
              setRemoved(null);
            }}
            className="inline-flex items-center gap-1.5 font-medium text-neon"
          >
            <Undo2 className="size-4" aria-hidden /> {t("dash.undo")}
          </button>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, tone, active, onClick }: { label: string; value: number | null; tone?: "amber" | "danger"; active: boolean; onClick: () => void }) {
  const color = !value ? "text-ink" : tone === "amber" ? "text-amber-ink" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl bg-surface p-4 text-start ring-1 transition-shadow duration-150 ${active ? "ring-2 ring-ink" : "ring-line hover:ring-ink/30"}`}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-medium nums ${color}`}>{value ?? "–"}</p>
    </button>
  );
}
