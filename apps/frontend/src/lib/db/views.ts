/*
 * Read-side mirrors of the SQL views and query modules:
 *   v_pharmacy_directory, v_pharmacy_medicine_availability, v_unmet_demand,
 *   database/queries/search.ts searchMedicines().
 * Pure functions over the tables, so they run the same on the server (seed)
 * and in the browser (mock store).
 */

import { stockStatus } from "./functions";
import { rotasFor } from "./seed";
import type {
  GeoPoint,
  MedicineAvailabilityRow,
  MedicineRow,
  OnDutyRotaRow,
  OpeningHours,
  PharmacyDirectoryRow,
  PharmacyRow,
  SearchResultItem,
  Tables,
  UnmetDemandRow,
} from "./schema";

const todayIso = (now: number) => new Date(now).toISOString().slice(0, 10);

// ── Time in Algiers (UTC+1, no daylight saving) ─────────────────────────────
const ALGIERS_OFFSET = 3_600_000;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function algiersClock(now: number) {
  const d = new Date(now + ALGIERS_OFFSET);
  return { day: DAYS[d.getUTCDay()], minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** "08:00-20:00" → [480, 1200]; "closed" → null; anything else → undefined (unknown). */
function parseRange(v: string | undefined): [number, number] | null | undefined {
  if (v === undefined) return undefined;
  if (v.trim().toLowerCase() === "closed") return null;
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
}

/** Hours for one weekday: a per-day key wins, then mon_fri for Monday to Friday. */
export function hoursFor(h: OpeningHours, day: (typeof DAYS)[number]): [number, number] | null | undefined {
  const own = parseRange(h[day]);
  if (own !== undefined) return own;
  if (day !== "sat" && day !== "sun") return parseRange(h.mon_fri);
  return undefined;
}

export function isOpenAt(h: OpeningHours, now: number): boolean | null {
  const { day, minutes } = algiersClock(now);
  const r = hoursFor(h, day);
  if (r === undefined) return null;
  if (r === null) return false;
  const [from, to] = r;
  return to > from ? minutes >= from && minutes < to : minutes >= from || minutes < to; // past midnight
}

export function isAlwaysOpen(h: OpeningHours) {
  return DAYS.every((d) => {
    const r = hoursFor(h, d);
    return !!r && r[0] === 0 && r[1] >= 1440;
  });
}

// ── Garde ───────────────────────────────────────────────────────────────────
export function onDutyNow(pharmacyId: string, now: number, rotas: OnDutyRotaRow[] = rotasFor(now)) {
  return rotas.some((r) => r.pharmacy_id === pharmacyId && Date.parse(r.starts_at) <= now && now <= Date.parse(r.ends_at));
}

/** Tonight's (or the current) shift for a pharmacy, if it has one. */
export function dutyShift(pharmacyId: string, now: number): OnDutyRotaRow | undefined {
  return rotasFor(now)
    .filter((r) => r.pharmacy_id === pharmacyId && Date.parse(r.ends_at) >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
}

// ── v_pharmacy_directory ────────────────────────────────────────────────────
export function pharmacyDirectory(db: Tables, now: number | null): PharmacyDirectoryRow[] {
  const rotas = now === null ? [] : rotasFor(now);
  return db.pharmacies.map((p) => ({
    id: p.id,
    name: p.name,
    wilaya: p.wilaya,
    commune: p.commune,
    address: p.address,
    phone: p.phone,
    location: p.location,
    opening_hours: p.opening_hours,
    rating_avg: p.rating_avg,
    is_pro_active: !!p.pro_plan_until && now !== null && Date.parse(p.pro_plan_until) > now,
    is_on_duty_now: now !== null && onDutyNow(p.id, now, rotas),
  }));
}

export const ratingCount = (db: Tables, pharmacyId: string) => db.pharmacy_ratings.filter((r) => r.pharmacy_id === pharmacyId).length;

// ── v_pharmacy_medicine_availability ────────────────────────────────────────
export function medicineAvailability(db: Tables, now: number, filter: { pharmacyId?: string; medicineIds?: string[] } = {}): MedicineAvailabilityRow[] {
  const today = todayIso(now);
  const groups = new Map<string, MedicineAvailabilityRow & { threshold: number }>();
  for (const s of db.pharmacy_stock) {
    if (s.expiry_date < today) continue;
    if (filter.pharmacyId && s.pharmacy_id !== filter.pharmacyId) continue;
    if (filter.medicineIds && !filter.medicineIds.includes(s.medicine_id)) continue;
    const m = db.medicines.find((x) => x.id === s.medicine_id);
    if (!m) continue;
    const key = `${s.pharmacy_id}|${s.medicine_id}`;
    const g = groups.get(key) ?? {
      pharmacy_id: s.pharmacy_id,
      medicine_id: s.medicine_id,
      commercial_name: m.commercial_name,
      generic_dci_name: m.generic_dci_name,
      dosage_form: m.dosage_form,
      strength: m.strength,
      total_available: 0,
      min_price_dzd: null,
      max_price_dzd: null,
      nearest_expiry: null,
      batch_count: 0,
      stock_status: "out_of_stock" as const,
      threshold: 0,
    };
    g.total_available += s.total_quantity - s.reserved_quantity;
    if (s.price_dzd !== null) {
      g.min_price_dzd = g.min_price_dzd === null ? s.price_dzd : Math.min(g.min_price_dzd, s.price_dzd);
      g.max_price_dzd = g.max_price_dzd === null ? s.price_dzd : Math.max(g.max_price_dzd, s.price_dzd);
    }
    g.nearest_expiry = g.nearest_expiry === null || s.expiry_date < g.nearest_expiry ? s.expiry_date : g.nearest_expiry;
    g.batch_count += 1;
    g.threshold = Math.max(g.threshold, s.low_stock_threshold);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ threshold, ...row }) => ({ ...row, stock_status: stockStatus(row.total_available, threshold) }));
}

/** Last stock update for a pharmacy and medicine (MAX(updated_at) over its batches). */
export function lastUpdated(db: Tables, pharmacyId: string, medicineId: string): string | null {
  let latest: string | null = null;
  for (const s of db.pharmacy_stock) if (s.pharmacy_id === pharmacyId && s.medicine_id === medicineId && (!latest || s.updated_at > latest)) latest = s.updated_at;
  return latest;
}

// ── v_unmet_demand ──────────────────────────────────────────────────────────
export function unmetDemand(db: Tables, now: number, wilaya?: string): UnmetDemandRow[] {
  const since = now - 30 * 86_400_000;
  const groups = new Map<string, UnmetDemandRow & { users: Set<string> }>();
  for (const l of db.search_logs) {
    if (l.found_in_stock || Date.parse(l.searched_at) < since) continue;
    if (wilaya && (l.wilaya ?? "").toLowerCase() !== wilaya.toLowerCase()) continue;
    const m = db.medicines.find((x) => x.id === l.medicine_id);
    const key = `${l.wilaya}|${l.medicine_id}`;
    const g = groups.get(key) ?? { wilaya: l.wilaya, medicine_id: l.medicine_id, commercial_name: m?.commercial_name ?? null, generic_dci_name: m?.generic_dci_name ?? null, search_count: 0, unique_users: 0, users: new Set<string>() };
    g.search_count += 1;
    if (l.user_id) g.users.add(l.user_id);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ users, ...row }) => ({ ...row, unique_users: users.size })).sort((a, b) => b.search_count - a.search_count);
}

// ── Search (mirrors queries/search.ts) ──────────────────────────────────────
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** pg_trgm-style similarity: shared trigrams over all trigrams, words padded with spaces. */
function trigrams(s: string) {
  const set = new Set<string>();
  for (const w of fold(s).split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  }
  return set;
}

export function similarity(a: string, b: string) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

const SIMILARITY_THRESHOLD = 0.3; // pg_trgm.similarity_threshold default

export type MatchedMedicine = MedicineRow & { similarity: number };

/** Step 1 of searchMedicines(): fuzzy match on brand or DCI, best 10. */
export function matchMedicines(db: Tables, query: string): MatchedMedicine[] {
  const q = fold(query);
  if (!q) return [];
  return db.medicines
    .map((m) => {
      const sim = Math.max(similarity(m.commercial_name, q), similarity(m.generic_dci_name, q));
      const hit = sim >= SIMILARITY_THRESHOLD || fold(m.commercial_name).includes(q) || fold(m.generic_dci_name).includes(q);
      // A brand that starts with the query ranks first, as people type brands.
      const boost = fold(m.commercial_name).startsWith(q) ? 1 : 0;
      return hit ? { ...m, similarity: sim + boost } : null;
    })
    .filter((m): m is MatchedMedicine => m !== null)
    .sort((a, b) => b.similarity - a.similarity || a.commercial_name.localeCompare(b.commercial_name))
    .slice(0, 10);
}

export function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type SearchParams = {
  medicineIds: string[];
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  inStockOnly?: boolean;
  onDutyOnly?: boolean;
  chifaOnly?: boolean;
  isEquivalent?: boolean;
  parentOf?: Map<string, string>;
};

/** Step 2 of searchMedicines(): availability rows joined with the directory, nearest first. */
export function searchAvailability(db: Tables, now: number, p: SearchParams): SearchResultItem[] {
  const dir = new Map(pharmacyDirectory(db, now).map((d) => [d.id, d]));
  const meds = new Map(db.medicines.map((m) => [m.id, m]));
  const origin = p.latitude !== undefined && p.longitude !== undefined ? { lat: p.latitude, lng: p.longitude } : null;
  const radius = p.radiusMeters ?? 50_000;
  const items: SearchResultItem[] = [];
  for (const a of medicineAvailability(db, now, { medicineIds: p.medicineIds })) {
    const ph = dir.get(a.pharmacy_id);
    const m = meds.get(a.medicine_id);
    if (!ph || !m) continue;
    if (p.inStockOnly && (a.stock_status === "out_of_stock" || a.total_available <= 0)) continue;
    if (p.chifaOnly && !m.chifa_reimbursable) continue;
    if (p.onDutyOnly && !ph.is_on_duty_now) continue;
    const distance = origin && ph.location ? distanceMeters(origin, ph.location) : null;
    if (origin && (distance === null || distance > radius)) continue;
    items.push({
      medicineId: m.id,
      commercialName: m.commercial_name,
      genericDciName: m.generic_dci_name,
      dosageForm: m.dosage_form,
      strength: m.strength,
      chifaReimbursable: m.chifa_reimbursable,
      isPrescriptionOnly: m.is_prescription_only,
      isEquivalent: !!p.isEquivalent,
      equivalentToMedicineId: p.parentOf?.get(m.id),
      pharmacyId: ph.id,
      pharmacyName: ph.name,
      wilaya: ph.wilaya,
      commune: ph.commune,
      address: ph.address,
      phone: ph.phone,
      location: ph.location,
      distanceMeters: distance === null ? null : Math.round(distance * 10) / 10,
      totalAvailable: a.total_available,
      minPriceDzd: a.min_price_dzd,
      maxPriceDzd: a.max_price_dzd,
      nearestExpiry: a.nearest_expiry,
      stockStatus: a.stock_status,
      batchCount: a.batch_count,
      ratingAvg: ph.rating_avg,
      isOnDutyNow: ph.is_on_duty_now,
      isProActive: ph.is_pro_active,
    });
  }
  return items.sort(
    (a, b) =>
      (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || b.totalAvailable - a.totalAvailable,
  );
}

/** Step 3: exact generics of the given medicines (medicine_equivalents). */
export function exactGenerics(db: Tables, medicineIds: string[]) {
  const parentOf = new Map<string, string>();
  for (const e of db.medicine_equivalents) {
    if (e.equivalence_type === "exact_generic" && medicineIds.includes(e.medicine_id)) parentOf.set(e.equivalent_id, e.medicine_id);
  }
  return parentOf;
}

export const hasStock = (r: SearchResultItem) => r.stockStatus !== "out_of_stock" && r.totalAvailable > 0;

/** A pharmacy row as the map and lists need it. */
export type PharmacyPoint = Pick<PharmacyRow, "id" | "name" | "location">;
