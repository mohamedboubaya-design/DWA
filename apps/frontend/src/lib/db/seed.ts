/*
 * Mock rows for the front end, shaped exactly like the database tables.
 *
 * Medicines are real rows from the national nomenclature
 * (database/seeds/clean_NOMENCLATURE…xlsx): same commercial_name,
 * generic_dci_name, strength, dosage_form and prescription list, and the
 * barcode_ean the DB seed generates for that row. Pharmacies, owners, stock and
 * prices are invented. Timestamps are derived from the current day so the
 * server render and the browser agree.
 */

import type {
  MedicineEquivalentRow,
  MedicineRow,
  OnDutyRotaRow,
  PharmacistVerificationRow,
  PharmacyRow,
  PharmacyStockRow,
  SearchLogRow,
  Tables,
  UserRow,
} from "./schema";

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

// Stable IDs the UI refers to (home page story, demo dashboard hints).
export const PH = {
  meziane: uuid("a1000000", 1),
  hydraPins: uuid("a1000000", 2),
  elbiarCentre: uuid("a1000000", 3),
  koubaGaridi: uuid("a1000000", 4),
  babEzzouar: uuid("a1000000", 5),
  bmrColonne: uuid("a1000000", 6),
  cheragaSalam: uuid("a1000000", 7),
  belouizdad: uuid("a1000000", 8),
} as const;

export const MED = {
  doliprane1000: uuid("b2000000", 1),
  efferalgan500: uuid("b2000000", 2),
  paralgan500: uuid("b2000000", 3),
  dolyc500: uuid("b2000000", 4),
  augmentin1g: uuid("b2000000", 5),
  amoxypen500: uuid("b2000000", 6),
  levospasme80: uuid("b2000000", 7),
  ventoline100: uuid("b2000000", 8),
  ventmax100: uuid("b2000000", 9),
  glucophage850: uuid("b2000000", 10),
  levothyrox50: uuid("b2000000", 11),
  bekinslo100: uuid("b2000000", 12),
  kardegic75: uuid("b2000000", 13),
  smecta3g: uuid("b2000000", 14),
  clamoxyl250: uuid("b2000000", 15),
  desloral5: uuid("b2000000", 16),
} as const;

const ADMIN_ID = uuid("c3000000", 0);
const SEED_CREATED = "2026-01-15T09:00:00+01:00";

/** Demo pharmacist accounts; every one uses the password "demo1234". */
export const DEMO_PASSWORD = "demo1234";

const OWNERS: { pharmacy: string; email: string; full_name: string; phone: string; hash: string }[] = [
  { pharmacy: PH.meziane, email: "meziane@demo.dwa.dz", full_name: "Dr. S. Meziane", phone: "+213550100001", hash: "pbkdf2_sha256$150000$ced3d763268d3631cd14d8696a57f127$9d2415b8b4b7f00bedf1b8bd9be677a2eb523d52c222c6d19339bbfb81015870" },
  { pharmacy: PH.hydraPins, email: "pins@demo.dwa.dz", full_name: "Dr. A. Belkacem", phone: "+213550100002", hash: "pbkdf2_sha256$150000$64ec4127cfabe62126dfe8e9649c2b62$e7ee976e47d28c3fcb0186f3738e56043de27acd86581a169f6a602b7823ec0d" },
  { pharmacy: PH.elbiarCentre, email: "centre@demo.dwa.dz", full_name: "Dr. N. Hamidi", phone: "+213550100003", hash: "pbkdf2_sha256$150000$d88e751cc630e5d42d05bcfa7ded089b$623a5ceb09d3447e8c938ab8d56237c1aee05fe70129cbb6d11bc0d2f89a0946" },
  { pharmacy: PH.koubaGaridi, email: "garidi@demo.dwa.dz", full_name: "Dr. K. Ouali", phone: "+213550100004", hash: "pbkdf2_sha256$150000$07f9c2d615a958559e2982204bccb79d$f8b3c8af9c32f261dc28a5e8fa961ca7797ba3a3e2a672e65ece909cecff4dd8" },
  { pharmacy: PH.babEzzouar, email: "ennour@demo.dwa.dz", full_name: "Dr. Y. Saadi", phone: "+213550100005", hash: "pbkdf2_sha256$150000$e06937dc2c77fe1fb98362e09adcc838$3e97efc94d9d70f675d74a6302101270a5681d50ce2e110540292885e7fb8166" },
  { pharmacy: PH.bmrColonne, email: "colonne@demo.dwa.dz", full_name: "Dr. F. Rahmani", phone: "+213550100006", hash: "pbkdf2_sha256$150000$50a7d1a4b6b2954022f9133d67529031$be2799581b8e042e3b5a865e1b0706b41b28622865117cc082b2c911b090de17" },
  { pharmacy: PH.cheragaSalam, email: "salam@demo.dwa.dz", full_name: "Dr. L. Benali", phone: "+213550100007", hash: "pbkdf2_sha256$150000$99068d8b613e678c647d12def30beb99$f539d4a6c716b7405899dfd26fe25c3c512abd4ff60af8e65cde064ed7ce77c7" },
  { pharmacy: PH.belouizdad, email: "1ermai@demo.dwa.dz", full_name: "Dr. R. Djebbar", phone: "+213550100008", hash: "pbkdf2_sha256$150000$c418bf409bfae2d2589e430a9b1f195f$d4e228ba468f02727e427374bad5f138f972bb98a384828fb802ee0e116e92e9" },
];

const ownerId = (i: number) => uuid("c3000000", i + 1);

const users: UserRow[] = [
  {
    id: ADMIN_ID,
    email: "admin@demo.dwa.dz",
    password_hash: "pbkdf2_sha256$150000$01f4e9da409c10ee12c2add2ce9e5b09$590d43dab2c30976c2adb9d85226511128550ec944b33b728c695ee0514c72ed",
    role: "admin",
    full_name: "Admin DWA",
    phone: null,
    chifa_card_number: null,
    law_18_07_consent_at: SEED_CREATED,
    created_at: SEED_CREATED,
  },
  ...OWNERS.map((o, i): UserRow => ({
    id: ownerId(i),
    email: o.email,
    password_hash: o.hash,
    role: "pharmacist",
    full_name: o.full_name,
    phone: o.phone,
    chifa_card_number: null,
    law_18_07_consent_at: SEED_CREATED,
    created_at: SEED_CREATED,
  })),
];

const verifications: PharmacistVerificationRow[] = OWNERS.map((o, i) => ({
  id: uuid("c4000000", i + 1),
  user_id: ownerId(i),
  license_number: `ALG-16-${String(1201 + i)}`,
  document_storage_path: `licences/${ownerId(i)}/licence.pdf`,
  status: "verified",
  rejection_reason: null,
  reviewed_by: ADMIN_ID,
  reviewed_at: SEED_CREATED,
  created_at: SEED_CREATED,
}));

const week = (mon_fri: string, sun = "closed") => ({ mon_fri, sat: mon_fri, sun });
const ALWAYS = { mon_fri: "00:00-24:00", sat: "00:00-24:00", sun: "00:00-24:00" };

const P = (i: number, id: string, name: string, address: string, commune: string, lat: number, lng: number, phone: string, opening_hours: PharmacyRow["opening_hours"]): PharmacyRow => ({
  id,
  owner_id: ownerId(i),
  name,
  wilaya: "Alger",
  commune,
  address,
  phone,
  location: { lat, lng },
  opening_hours,
  pro_plan_until: null,
  rating_avg: null,
  created_at: SEED_CREATED,
  updated_at: SEED_CREATED,
});

const pharmacies: PharmacyRow[] = [
  P(0, PH.meziane, "Pharmacie Meziane", "14 Rue Didouche Mourad", "Alger Centre", 36.7651, 3.0503, "+213 21 63 40 12", week("08:00-20:00", "09:00-13:00")),
  P(1, PH.hydraPins, "Pharmacie des Pins", "3 Chemin Ahmed Kara", "Hydra", 36.7449, 3.0391, "+213 23 48 11 07", week("08:30-20:30")),
  P(2, PH.elbiarCentre, "Pharmacie du Centre", "27 Avenue Ali Khodja", "El Biar", 36.7671, 3.0312, "+213 21 92 05 66", week("08:00-19:30")),
  P(3, PH.koubaGaridi, "Pharmacie Garidi", "Cité Garidi II, Bt 12", "Kouba", 36.7273, 3.0798, "+213 23 70 38 91", week("08:00-21:00", "09:00-13:00")),
  P(4, PH.babEzzouar, "Pharmacie Ennour", "Cité 5 Juillet, local 8", "Bab Ezzouar", 36.7213, 3.1836, "+213 23 92 14 50", ALWAYS),
  P(5, PH.bmrColonne, "Pharmacie La Colonne", "9 Rue des Frères Oughlis", "Bir Mourad Raïs", 36.7378, 3.0514, "+213 23 55 61 29", week("08:15-19:45")),
  P(6, PH.cheragaSalam, "Pharmacie Es-Salam", "Boulevard Mustapha Ben Boulaïd", "Chéraga", 36.7669, 2.9591, "+213 23 31 07 44", week("08:00-20:00")),
  P(7, PH.belouizdad, "Pharmacie du 1er Mai", "62 Rue Mohamed Belouizdad", "Belouizdad", 36.7527, 3.0702, "+213 21 67 22 03", week("08:00-20:15", "09:00-13:00")),
];

/** Pharmacies on tonight's garde rota (the rota rows are generated per day, below). */
export const ON_DUTY = [PH.hydraPins, PH.koubaGaridi, PH.cheragaSalam];

const M = (id: string, commercial_name: string, generic_dci_name: string, strength: string, dosage_form: string, barcode_ean: string, is_prescription_only: boolean, chifa_reimbursable: boolean): MedicineRow => ({
  id,
  commercial_name,
  generic_dci_name,
  strength,
  dosage_form,
  barcode_ean,
  is_prescription_only,
  chifa_reimbursable,
  created_at: SEED_CREATED,
});

// Nomenclature row index → barcode follows database/seeds/seed.ts generateEAN13(index + 1).
const medicines: MedicineRow[] = [
  M(MED.doliprane1000, "DOLIPRANE", "PARACETAMOL", "1000MG", "COMRPIME", "6130000002873", false, true),
  M(MED.efferalgan500, "EFFERALGAN", "PARACETAMOL", "500MG", "COMPRIME SECABLE", "6130000002071", false, true),
  M(MED.paralgan500, "PARALGAN", "PARACETAMOL", "500MG", "COMPRIME", "6130000002149", false, true),
  M(MED.dolyc500, "DOLYC", "PARACETAMOL", "500MG", "COMPRIME", "6130000002064", false, true),
  M(MED.augmentin1g, "AUGMENTIN", "AMOXICILLINE TRIHYDRATEE EXPRIME EN AMOXICILLINE/ACIDE CLAVULANIQUE POTASSIQUE EXPRIME EN ACIDE CLAVULANIQUE", "1G/125MG", "POUDRE POUR SUSPENSSION BUVABLE EN SACHET DOSE", "6130000031637", true, true),
  M(MED.amoxypen500, "AMOXYPEN", "AMOXICILLINE TRIHYDRATEE (AMOXICILLINE)", "500MG", "GELULE", "6130000030982", true, true),
  M(MED.levospasme80, "LEVOSPASME", "PHLOROGLUCINOL DIHYDRATE", "80MG", "COMPRIME ORODISPERSIBLE", "6130000023250", false, false),
  M(MED.ventoline100, "VENTOLINE", "SALBUTAMOL", "100µG/DOSE", "AEROSOL", "6130000047591", true, true),
  M(MED.ventmax100, "VENTMAX", "SALBUTAMOL", "100µG/DOSE", "AEROSOL", "6130000047584", true, true),
  M(MED.glucophage850, "GLUCOPHAGE 850", "METFORMINE CHLORHYDRATE", "850MG", "COMPRIME PELLICULE", "6130000034157", true, true),
  M(MED.levothyrox50, "LEVOTHYROX", "LEVOTHYROXINE SODIQUE", "50µG", "COMPRIME SECABLE", "6130000021911", true, true),
  M(MED.bekinslo100, "BEKINSLO", "INSULINE GLARGINE", "100UI/ML (3,64MG/ML)", "SOLUTION INJECTABLE EN STYLO PREREMPLI", "6130000035734", true, true),
  M(MED.kardegic75, "KARDEGIC", "ACIDE ACETYLSALICYLIQUE", "75 MG", "POUDRE POUR SOLUTION BUVABLE", "6130000025971", false, true),
  M(MED.smecta3g, "SMECTA FRAISE", "DIOSMECTITE", "3G/SACHET", "POUDRE POUR SUSPENSION BUVABLE EN SACHET DOSE", "6130000022895", false, false),
  M(MED.clamoxyl250, "CLAMOXYL", "AMOXICILLINE TRIHYDRATE EXPRIME EN AMOXICILLINE", "250MG/5ML", "POUDRE POUR SOLUTION BUVABLE", "6130000031057", true, true),
  M(MED.desloral5, "DESLORAL", "DESLORATADINE", "5MG", "COMPRIME PELLICULE", "6130000000794", true, false),
];

// Same rule as the DB seed: same DCI + strength + dosage form = exact generic, both directions.
const pair = (a: string, b: string): MedicineEquivalentRow[] => [
  { medicine_id: a, equivalent_id: b, equivalence_type: "exact_generic", notes: null },
  { medicine_id: b, equivalent_id: a, equivalence_type: "exact_generic", notes: null },
];
const medicine_equivalents: MedicineEquivalentRow[] = [...pair(MED.paralgan500, MED.dolyc500), ...pair(MED.ventoline100, MED.ventmax100)];

const PRICE: Record<string, number> = {
  [MED.doliprane1000]: 180, [MED.efferalgan500]: 160, [MED.paralgan500]: 95, [MED.dolyc500]: 90, [MED.augmentin1g]: 980,
  [MED.amoxypen500]: 420, [MED.levospasme80]: 310, [MED.ventoline100]: 540, [MED.ventmax100]: 480, [MED.glucophage850]: 260,
  [MED.levothyrox50]: 230, [MED.bekinslo100]: 2900, [MED.kardegic75]: 210, [MED.smecta3g]: 350, [MED.clamoxyl250]: 390, [MED.desloral5]: 620,
};

// Small deterministic PRNG so the server render and the browser build identical stock.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function buildStock(dayStart: number): PharmacyStockRow[] {
  const rand = mulberry32(2026);
  const rows: PharmacyStockRow[] = [];
  let n = 0;
  pharmacies.forEach((p, pi) => {
    medicines.forEach((m, mi) => {
      const r = rand();
      if (r < 0.12) return; // never carried here
      const batches = rand() < 0.35 ? 2 : 1;
      for (let b = 0; b < batches; b++) {
        const qty = r < 0.3 ? 0 : r < 0.42 ? 1 + Math.floor(rand() * 5) : 6 + Math.floor(rand() * 40);
        const expiresIn = 45 + Math.floor(rand() * 600);
        const price = Math.round(PRICE[m.id] * (0.95 + rand() * 0.1));
        rows.push({
          id: uuid("d4000000", ++n),
          pharmacy_id: p.id,
          medicine_id: m.id,
          batch_barcode: `L${String(pi + 1).padStart(2, "0")}${String(mi + 1).padStart(2, "0")}-${b + 1}`,
          production_date: isoDate(dayStart - (200 + Math.floor(rand() * 300)) * DAY),
          expiry_date: isoDate(dayStart + expiresIn * DAY),
          total_quantity: b === 0 ? qty : Math.floor(qty / 2),
          reserved_quantity: 0,
          low_stock_threshold: 5,
          price_dzd: price,
          updated_at: new Date(dayStart - Math.floor(rand() * 600) * 60_000).toISOString(),
        });
      }
    });
  });
  // Ventoline is the "hard to find" example: only Pharmacie Garidi has it (3 boxes); Ventmax, its exact generic, is at two others.
  for (const s of rows) {
    if (s.medicine_id === MED.ventoline100) s.total_quantity = 0;
    if (s.medicine_id === MED.ventmax100 && s.pharmacy_id !== PH.cheragaSalam && s.pharmacy_id !== PH.babEzzouar) s.total_quantity = 0;
  }
  const garidi = rows.find((s) => s.pharmacy_id === PH.koubaGaridi && s.medicine_id === MED.ventoline100);
  if (garidi) Object.assign(garidi, { total_quantity: 3, updated_at: new Date(dayStart - 12 * 60_000).toISOString() });
  return rows;
}

function buildSearchLogs(dayStart: number): SearchLogRow[] {
  // Unmet demand in Alger over the last days, so the pharmacist dashboard has something to show.
  const misses: [string, number][] = [
    [MED.ventoline100, 9],
    [MED.bekinslo100, 6],
    [MED.augmentin1g, 4],
    [MED.levothyrox50, 3],
    [MED.desloral5, 2],
  ];
  const logs: SearchLogRow[] = [];
  let id = 0;
  for (const [medicine_id, count] of misses) {
    const m = medicines.find((x) => x.id === medicine_id)!;
    for (let i = 0; i < count; i++) {
      logs.push({
        id: ++id,
        user_id: null,
        medicine_id,
        raw_query: m.commercial_name.toLowerCase(),
        wilaya: "Alger",
        search_point: null,
        results_count: 0,
        found_in_stock: false,
        searched_at: new Date(dayStart - (i + 1) * 7 * 3_600_000).toISOString(),
      });
    }
  }
  return logs;
}

/** Algeria is UTC+1 all year (no daylight saving). */
const ALGIERS_OFFSET = 3_600_000;

/** Start of the current day in Algiers, as epoch ms. */
export function algiersDayStart(now: number) {
  return Math.floor((now + ALGIERS_OFFSET) / DAY) * DAY - ALGIERS_OFFSET;
}

/**
 * Garde rota rows for yesterday and today: night shifts 20:00 to 08:00 the next
 * morning, the shape the DB seed writes. Generated, not stored, so the demo
 * always has pharmacies on duty tonight.
 */
export function rotasFor(now: number): OnDutyRotaRow[] {
  const today = algiersDayStart(now);
  const rows: OnDutyRotaRow[] = [];
  for (const day of [today - DAY, today]) {
    ON_DUTY.forEach((pharmacy_id, i) => {
      rows.push({
        id: uuid("e5000000", Math.floor(day / DAY) * 10 + i),
        pharmacy_id,
        duty_date: isoDate(day + ALGIERS_OFFSET),
        shift_type: "night",
        starts_at: new Date(day + 20 * 3_600_000).toISOString(),
        ends_at: new Date(day + 32 * 3_600_000).toISOString(),
        notes: null,
      });
    });
  }
  return rows;
}

/** A fresh database for the given day. */
export function seedTables(now: number): Tables {
  const dayStart = algiersDayStart(now);
  return {
    users: structuredClone(users),
    pharmacist_verifications: structuredClone(verifications),
    pharmacies: structuredClone(pharmacies),
    medicines: structuredClone(medicines),
    medicine_equivalents: structuredClone(medicine_equivalents),
    pharmacy_stock: buildStock(dayStart),
    reservations: [],
    payments: [],
    pharmacy_ratings: [],
    prescriptions: [],
    prescription_responses: [],
    stock_alerts_reminders: [],
    search_logs: buildSearchLogs(dayStart),
  };
}
