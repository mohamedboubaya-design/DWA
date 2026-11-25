"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Search, SearchX, Loader2 } from "lucide-react";
import { logSearch, maxReservable, useTables } from "@/lib/db/api";
import type { MedicineRow, SearchResultItem } from "@/lib/db/schema";
import { distanceMeters, exactGenerics, hasStock, isOpenAt, lastUpdated, matchMedicines, pharmacyDirectory, ratingCount, searchAvailability } from "@/lib/db/views";
import { DEFAULT_ORIGIN, DEFAULT_WILAYA, dciText, fmtPriceRange, formText, medLabel, medName, pinStatus, strengthText } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useT } from "@/lib/locale";
import { ChifaBadge } from "./pharmacy-meta";
import { NotifyMe } from "./notify-me";
import { RefillBanner } from "./reminders";
import { ResultRow, type ResultRowData } from "./result-row";
import type { MapPoint } from "./pharmacy-map";

const PharmacyMap = dynamic(() => import("./pharmacy-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
});

type Filters = { stocked: boolean; open: boolean; garde: boolean; chifa: boolean };
const RADIUS_METERS = 50_000;

export function SearchView({ q, initial }: { q: string; initial: Filters }) {
  const { t } = useT();
  const router = useRouter();
  const db = useTables();
  const now = useNow();
  const nowMs = now?.getTime() ?? null;
  const [draft, setDraft] = useState(q);
  const [filters, setFilters] = useState(initial);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; mine: boolean }>({ ...DEFAULT_ORIGIN, mine: false });
  const [locating, setLocating] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const matches = useMemo(() => matchMedicines(db, q), [db, q]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const med: MedicineRow | undefined = matches.find((m) => m.id === pickedId) ?? matches[0];

  // Filters live in the URL so a result can be shared or reloaded as-is.
  const sync = (next: Filters, query = q) => {
    setFilters(next);
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (next.stocked) sp.set("stocked", "1");
    if (next.open) sp.set("open", "1");
    if (next.garde) sp.set("garde", "1");
    if (next.chifa) sp.set("chifa", "1");
    router.replace(`/search${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const clock = nowMs ?? 0;
  const directory = useMemo(() => pharmacyDirectory(db, nowMs), [db, nowMs]);
  const geo = { latitude: origin.lat, longitude: origin.lng, radiusMeters: RADIUS_METERS };

  // Every pharmacy carrying the medicine, before filters: drives the headline count and the equivalents fallback.
  const all: SearchResultItem[] = useMemo(() => (med ? searchAvailability(db, clock, { medicineIds: [med.id], ...geo }) : []), [db, clock, med, origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockedCount = all.filter(hasStock).length;

  const rows: ResultRowData[] = useMemo(() => {
    const open = (id: string) => {
      const p = directory.find((d) => d.id === id)!;
      return nowMs === null || p.is_on_duty_now || isOpenAt(p.opening_hours, nowMs) !== false;
    };
    if (med) {
      return all
        .filter((r) => (!filters.stocked || hasStock(r)) && (!filters.garde || r.isOnDutyNow) && (!filters.chifa || r.chifaReimbursable) && (!filters.open || open(r.pharmacyId)))
        .map((r) => ({
          pharmacy: directory.find((d) => d.id === r.pharmacyId)!,
          ratingCount: ratingCount(db, r.pharmacyId),
          distanceMeters: r.distanceMeters,
          stock: r,
          updatedAt: lastUpdated(db, r.pharmacyId, r.medicineId),
          reservable: maxReservable(db, r.pharmacyId, r.medicineId),
        }));
    }
    return directory
      .filter((p) => (!filters.garde || p.is_on_duty_now) && (!filters.open || open(p.id)))
      .map((p) => ({ pharmacy: p, ratingCount: ratingCount(db, p.id), distanceMeters: p.location ? distanceMeters(origin, p.location) : null }))
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }, [db, med, all, directory, filters, nowMs, origin]);

  // search.ts logs every search into search_logs; the pharmacist's demand panel reads them back.
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!q || nowMs === null || logged.current === q) return;
    logged.current = q;
    logSearch({
      raw_query: q,
      medicine_id: med?.id ?? null,
      wilaya: DEFAULT_WILAYA,
      search_point: origin.mine ? { lat: origin.lat, lng: origin.lng } : null,
      results_count: all.length,
      found_in_stock: stockedCount > 0,
    });
  }, [q, nowMs, med, origin, all.length, stockedCount]);

  const points: MapPoint[] = rows
    .filter((r) => r.pharmacy.location)
    .map((r) => ({
      id: r.pharmacy.id,
      name: r.pharmacy.name,
      lat: r.pharmacy.location!.lat,
      lng: r.pharmacy.location!.lng,
      status: r.stock ? pinStatus(r.stock.stockStatus) : "none",
      onDuty: r.pharmacy.is_on_duty_now,
    }));

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, mine: true });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
  };

  const priceSpan = med ? fmtPriceRange(minOf(all.map((r) => r.minPriceDzd)), maxOf(all.map((r) => r.maxPriceDzd))) : "";

  return (
    <>
      <section className="dusk-band">
        <div className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6">
          <form
            role="search"
            aria-label={t("search.label")}
            onSubmit={(e) => {
              e.preventDefault();
              setPickedId(null);
              sync(filters, draft.trim());
            }}
            className="night-card flex items-center gap-3 rounded-2xl p-1.5 ps-4 focus-within:ring-2 focus-within:ring-dusk-mint"
          >
            <Search className="size-5 text-dusk-muted" aria-hidden />
            <label htmlFor="q" className="sr-only">{t("search.label")}</label>
            <input
              id="q"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("search.placeholder")}
              autoComplete="off"
              spellCheck={false}
              className="h-11 min-w-0 flex-1 bg-transparent text-lg text-dusk-ink outline-none placeholder:text-dusk-muted"
            />
            <button type="submit" className="h-11 rounded-xl bg-dusk-mint px-5 font-semibold text-[#06241f] transition-colors duration-150 hover:bg-white">
              {t("search.button")}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Toggle on={filters.stocked} disabled={!med} onClick={() => sync({ ...filters, stocked: !filters.stocked })}>{t("search.stocked")}</Toggle>
            <Toggle on={filters.open} onClick={() => sync({ ...filters, open: !filters.open })}>{t("search.open")}</Toggle>
            <Toggle on={filters.garde} night onClick={() => sync({ ...filters, garde: !filters.garde })}>{t("search.garde")}</Toggle>
            <Toggle on={filters.chifa} disabled={!med} onClick={() => sync({ ...filters, chifa: !filters.chifa })}>{t("search.chifa")}</Toggle>
            <button
              type="button"
              onClick={locate}
              className="ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-dusk-muted transition-colors duration-150 hover:text-dusk-ink"
            >
              {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
              {t("search.distances", { place: origin.mine ? t("search.yourLocation") : t("search.center") })}
            </button>
          </div>

          {med && (
            <header className="mt-10 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <h1 className="font-display text-4xl font-semibold tracking-tight">
                  {medName(med)} <span className="text-dusk-muted">{strengthText(med.strength)}</span>
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-dusk-muted">
                  <span>{dciText(med)}</span>
                  {med.dosage_form && <span>· {formText(med.dosage_form)}</span>}
                  {priceSpan && <bdi>· {priceSpan}</bdi>}
                  {med.is_prescription_only && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-medium text-dusk-ink">{t("common.prescription")}</span>}
                  {med.chifa_reimbursable && <ChifaBadge />}
                </p>
              </div>
              <p className={`font-mono text-sm nums sm:ms-auto ${stockedCount ? "text-dusk-mint" : "text-dusk-coral"}`} aria-live="polite">
                {t("search.have", { n: stockedCount, total: directory.length })}
              </p>
              {matches.length > 1 && (
                <div className="flex w-full flex-wrap items-center gap-2 text-sm">
                  <span className="text-dusk-muted">{t("search.also")}</span>
                  {matches.filter((m) => m.id !== med.id).slice(0, 5).map((m) => (
                    <button key={m.id} type="button" onClick={() => setPickedId(m.id)} className="rounded-full px-3 py-1 ring-1 ring-white/15 hover:bg-white/10">
                      {medLabel(m)}
                    </button>
                  ))}
                </div>
              )}
            </header>
          )}
          {!q && (
            <h1 className="mt-10 font-display text-4xl font-semibold tracking-tight">
              {filters.garde ? t("search.allGarde") : t("search.all")}
            </h1>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
        {q && !med ? (
          <NoMatch q={q} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <RefillBanner />
              {med && stockedCount === 0 && <Equivalents med={med} origin={origin} clock={clock} />}
              {med && stockedCount > 0 && stockedCount <= 2 && (
                <div className="mb-6 rounded-card bg-amber-soft p-5">
                  <p className="font-semibold text-amber-ink">
                    {stockedCount === 1 ? t("search.hard1", { name: medName(med) }) : t("search.hardN", { n: stockedCount, name: medName(med) })}
                  </p>
                  <p className="mt-1 text-sm text-ink">{t("search.hardHelp")}</p>
                  <NotifyMe medicine={med} scarce />
                </div>
              )}
              {rows.length ? (
                <ul className="surface divide-y divide-line/70 rounded-card p-1.5">
                  {rows.map((r) => (
                    <ResultRow
                      key={r.pharmacy.id}
                      row={r}
                      open={nowMs === null ? null : isOpenAt(r.pharmacy.opening_hours, nowMs)}
                      highlighted={hovered === r.pharmacy.id}
                      onHover={setHovered}
                      medicine={med}
                    />
                  ))}
                </ul>
              ) : (
                <div className="rounded-card border border-dashed border-line px-6 py-14 text-center">
                  <p className="font-semibold">{med && !all.length ? t("search.nobodyCarries", { name: medName(med) }) : t("search.noFit")}</p>
                  {(filters.stocked || filters.open || filters.garde || filters.chifa) && (
                    <button type="button" onClick={() => sync({ stocked: false, open: false, garde: false, chifa: false })} className="mt-3 text-sm font-medium text-green underline underline-offset-4">
                      {t("search.clear")}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="order-first h-72 overflow-hidden rounded-card bg-paper-2 ring-1 ring-line lg:sticky lg:top-24 lg:order-none lg:h-[calc(100vh-8rem)]">
              <PharmacyMap points={points} origin={origin} highlighted={hovered} onSelect={(id) => router.push(`/pharmacy/${id}`)} youLabel={origin.mine ? t("search.yourLocation") : t("search.center")} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const minOf = (xs: (number | null)[]) => xs.reduce<number | null>((m, x) => (x === null ? m : m === null ? x : Math.min(m, x)), null);
const maxOf = (xs: (number | null)[]) => xs.reduce<number | null>((m, x) => (x === null ? m : m === null ? x : Math.max(m, x)), null);

function Toggle({ on, night, disabled, onClick, children }: { on: boolean; night?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  const active = night ? "bg-dusk-mint text-[#06241f] ring-dusk-mint" : "bg-dusk-ink text-dusk ring-dusk-ink";
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? active : "text-dusk-ink ring-white/15 hover:ring-white/40"
      }`}
    >
      {children}
    </button>
  );
}

/* Nobody has it: offer its exact generics (medicine_equivalents) that someone has in stock. */
function Equivalents({ med, origin, clock }: { med: MedicineRow; origin: { lat: number; lng: number }; clock: number }) {
  const { t } = useT();
  const db = useTables();
  const parentOf = exactGenerics(db, [med.id]);
  const alts = [...parentOf.keys()]
    .map((id) => {
      const m = db.medicines.find((x) => x.id === id)!;
      const count = searchAvailability(db, clock, { medicineIds: [id], latitude: origin.lat, longitude: origin.lng, radiusMeters: RADIUS_METERS, inStockOnly: true }).length;
      return { m, count };
    })
    .filter((x) => x.count > 0);
  return (
    <div className="mb-6 rounded-card bg-amber-soft p-5">
      <p className="font-semibold text-amber-ink">{t("search.nobody", { name: medName(med) })}</p>
      {alts.length ? (
        <>
          <p className="mt-1 text-sm text-ink">{t("search.sameDci", { dci: dciText(med) })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {alts.map(({ m, count }) => (
              <Link key={m.id} href={`/search?q=${encodeURIComponent(medName(m))}`} className="rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line hover:ring-ink/30">
                {medLabel(m)} <span className="font-mono text-xs text-green">· {t("search.nPharmacies", { n: count })}</span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink">{t("search.callBelow")}</p>
      )}
      <NotifyMe medicine={med} />
    </div>
  );
}

function NoMatch({ q }: { q: string }) {
  const { t } = useT();
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <SearchX className="size-10 text-muted" aria-hidden />
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">{t("search.noMatch", { q })}</h1>
      <p className="mt-2 max-w-[44ch] text-muted">{t("search.noMatchHelp")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        {["Paracetamol", "Doliprane", "Ventoline", "Amoxicilline"].map((s) => (
          <Link key={s} href={`/search?q=${s}`} className="rounded-full px-3 py-1.5 ring-1 ring-line hover:bg-surface">
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
