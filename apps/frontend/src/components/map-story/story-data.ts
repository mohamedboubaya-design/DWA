/*
 * The facts the home page's scroll story tells, read from the seed by stable
 * ids. The story is scripted (same stops, same answers every time); the search
 * and pharmacy pages are where live stock is shown.
 */

import { MED, ON_DUTY, PH, seedTables } from "@/lib/db/seed";
import { distanceMeters } from "@/lib/db/views";
import { DEFAULT_ORIGIN, medName, strengthText } from "@/lib/format";

const db = seedTables(Date.now());

export type StoryPharmacy = { id: string; name: string; commune: string; lat: number; lng: number; phone: string; pharmacist: string };

export const pharmacies: StoryPharmacy[] = db.pharmacies.map((p) => ({
  id: p.id,
  name: p.name,
  commune: p.commune,
  lat: p.location!.lat,
  lng: p.location!.lng,
  phone: p.phone ?? "",
  pharmacist: db.users.find((u) => u.id === p.owner_id)?.full_name ?? "",
}));

export const getPharmacy = (id: string) => pharmacies.find((p) => p.id === id)!;

export const GARIDI = PH.koubaGaridi;
export const MEZIANE = PH.meziane;

const garidiPharmacy = getPharmacy(GARIDI);
const ventoline = db.pharmacy_stock.filter((s) => s.pharmacy_id === GARIDI && s.medicine_id === MED.ventoline100);

/** Ventoline at Garidi: the one pharmacy that has it, counted 12 minutes ago. */
export const garidi = {
  pharmacy: garidiPharmacy,
  qty: ventoline.reduce((n, s) => n + s.total_quantity - s.reserved_quantity, 0),
  updatedMins: 12,
  meters: distanceMeters(DEFAULT_ORIGIN, garidiPharmacy),
};

export const onDuty = pharmacies.filter((p) => ON_DUTY.includes(p.id as (typeof ON_DUTY)[number]));

/** A few well-stocked lines from Meziane's shelf, for the pharmacist beat. */
export const mezianeShelf = db.pharmacy_stock
  .filter((s) => s.pharmacy_id === MEZIANE && s.total_quantity > 5)
  .slice(0, 4)
  .map((s) => {
    const m = db.medicines.find((x) => x.id === s.medicine_id)!;
    return { id: s.id, name: medName(m), strength: strengthText(m.strength), qty: s.total_quantity };
  });
