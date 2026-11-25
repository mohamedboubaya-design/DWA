/*
 * Display helpers for database values. The nomenclature stores names in
 * uppercase ("DOLIPRANE", "PARACETAMOL", "1000MG"); the UI shows them in a
 * readable case without changing the data.
 */

import type { MedicineRow, OpeningHours, StockStatus } from "./db/schema";
import { algiersClock, hoursFor, isAlwaysOpen } from "./db/views";
import type { T } from "./i18n";

/** Default origin when the visitor hasn't shared a location: Place des Martyrs, Alger. */
export const DEFAULT_ORIGIN = { lat: 36.7856, lng: 3.0603 };
export const DEFAULT_WILAYA = "Alger";

const SMALL = new Set(["de", "du", "des", "en", "et", "la", "le", "pour", "sous", "forme"]);

/** "GLUCOPHAGE 850" → "Glucophage 850"; "ACIDE ACETYLSALICYLIQUE" → "Acide acetylsalicylique" style for DCIs. */
export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/(\s+|\/|-|\()/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

/** "1000MG" → "1000 mg", "100µG/DOSE" → "100 µg/dose", "100UI/ML" → "100 UI/ml". */
export function strengthText(s: string | null) {
  if (!s) return "";
  return s
    .replace(/(\d)\s*([a-zµ%])/gi, "$1 $2")
    .toLowerCase()
    .replace(/\bui\b/g, "UI");
}

/** "COMPRIME PELLICULE" → "Comprime pellicule". */
export function formText(s: string | null) {
  if (!s) return "";
  const low = s.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

export const medName = (m: Pick<MedicineRow, "commercial_name">) => titleCase(m.commercial_name);
export const dciText = (m: Pick<MedicineRow, "generic_dci_name">) => titleCase(m.generic_dci_name);
export const medLabel = (m: Pick<MedicineRow, "commercial_name" | "strength">) => `${medName(m)} ${strengthText(m.strength)}`.trim();

const dzd = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 });
export const fmtPrice = (n: number) => `${dzd.format(n)} DA`;

/** "180 DA" or "175–190 DA"; empty when no batch has a price. */
export function fmtPriceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return "";
  return Math.round(min) === Math.round(max) ? fmtPrice(min) : `${dzd.format(min)}–${dzd.format(max)} DA`;
}

const km = new Intl.NumberFormat("en", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const fmtKm = (meters: number) => `${km.format(meters / 1000)} km`;

/** Minutes between an ISO timestamp and now. */
export const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));

/** "12 min ago" style, localized. */
export function agoText(t: T, mins: number) {
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.min", { n: mins });
  if (mins < 48 * 60) return t("time.hour", { n: Math.floor(mins / 60) });
  return t("time.day", { n: Math.floor(mins / 1440) });
}

const hhmm = (m: number) => (m >= 1440 ? "24:00" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Today's hours in Algiers: "08:00 to 20:00", "Open 24/7", "Closed today" or "Hours not given". */
export function hoursToday(t: T, h: OpeningHours, now: number) {
  if (isAlwaysOpen(h)) return t("hours.always");
  const r = hoursFor(h, algiersClock(now).day);
  if (r === undefined) return t("hours.unknown");
  if (r === null) return t("hours.closedToday");
  return t("hours.range", { from: hhmm(r[0]), to: hhmm(r[1]) });
}

/** Map pin colour for a stock status. */
export const pinStatus = (s: StockStatus) => (s === "in_stock" ? "in" : s === "low_stock" ? "low" : "out");
