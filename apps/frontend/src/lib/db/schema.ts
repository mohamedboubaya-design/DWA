/*
 * Row types that mirror the DWA database schema exactly
 * (database/migrations/001_initial_schema.sql + 002_fixes.sql).
 *
 * Column names stay snake_case on purpose: these are the shapes the backend
 * returns, so the front end needs no mapping layer. IDs are UUID strings,
 * timestamps are ISO-8601 strings (TIMESTAMPTZ), dates are "YYYY-MM-DD" (DATE),
 * and NUMERIC columns are numbers. Do not add columns here that the schema does
 * not have; front-end-only state lives elsewhere (see guest.ts).
 */

export type UUID = string;
/** TIMESTAMPTZ, ISO-8601. */
export type Timestamp = string;
/** DATE, "YYYY-MM-DD". */
export type DateOnly = string;

// ── Enums (section 1 of the migration) ──────────────────────────────────────
export type UserRole = "patient" | "pharmacist" | "admin";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type ShiftType = "night" | "weekend" | "holiday";
export type EquivalenceType = "exact_generic" | "therapeutic_alternative";
export type ReservationStatus = "pending_payment" | "confirmed_held" | "ready_for_pickup" | "completed" | "expired" | "cancelled";
export type PaymentPurpose = "reservation_deposit" | "pro_plan";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PrescriptionStatus = "uploaded" | "answered" | "closed";
export type AvailabilityStatus = "available" | "partial" | "unavailable";
export type AlertType = "back_in_stock" | "refill_reminder";
/** Returned by fn_stock_status(); TEXT in SQL. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export const RESERVATION_STATUSES: readonly ReservationStatus[] = ["pending_payment", "confirmed_held", "ready_for_pickup", "completed", "expired", "cancelled"];
export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = ["available", "partial", "unavailable"];

// ── Domain A: users & licence verification ──────────────────────────────────
export type UserRow = {
  id: UUID;
  /** Lowercase (CHECK email_lowercase), UNIQUE. */
  email: string;
  password_hash: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  chifa_card_number: string | null;
  law_18_07_consent_at: Timestamp | null;
  created_at: Timestamp;
};

export type PharmacistVerificationRow = {
  id: UUID;
  user_id: UUID;
  license_number: string;
  document_storage_path: string;
  status: VerificationStatus;
  rejection_reason: string | null;
  reviewed_by: UUID | null;
  reviewed_at: Timestamp | null;
  created_at: Timestamp;
};

// ── Domain B: pharmacies, catalogue, batch stock ────────────────────────────
/** PostGIS geography(Point, 4326), as the API returns it: { lat, lng }. */
export type GeoPoint = { lat: number; lng: number };

/**
 * JSONB with no schema in SQL. The DB seed writes
 * { mon_fri: "08:00-20:00", sat: "08:00-18:00", sun: "closed" }; per-day keys
 * (mon … sun) are also understood by the front end. "00:00-24:00" means all day.
 */
export type OpeningHours = Partial<Record<"mon_fri" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>>;

export type PharmacyRow = {
  id: UUID;
  owner_id: UUID;
  name: string;
  wilaya: string;
  commune: string;
  address: string;
  phone: string | null;
  location: GeoPoint | null;
  opening_hours: OpeningHours;
  pro_plan_until: Timestamp | null;
  rating_avg: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type OnDutyRotaRow = {
  id: UUID;
  pharmacy_id: UUID;
  duty_date: DateOnly;
  shift_type: ShiftType;
  starts_at: Timestamp;
  ends_at: Timestamp;
  notes: string | null;
};

export type MedicineRow = {
  id: UUID;
  /** Brand, uppercase as in the national nomenclature. */
  commercial_name: string;
  /** Active ingredient (DCI), uppercase French. */
  generic_dci_name: string;
  strength: string | null;
  /** Free text from the nomenclature (e.g. "COMPRIME PELLICULE"). */
  dosage_form: string | null;
  barcode_ean: string | null;
  is_prescription_only: boolean;
  chifa_reimbursable: boolean;
  created_at: Timestamp;
};

export type MedicineEquivalentRow = {
  medicine_id: UUID;
  equivalent_id: UUID;
  equivalence_type: EquivalenceType;
  notes: string | null;
};

/** One physical batch. A pharmacy carries a medicine as one or more batches. */
export type PharmacyStockRow = {
  id: UUID;
  pharmacy_id: UUID;
  medicine_id: UUID;
  batch_barcode: string;
  production_date: DateOnly | null;
  expiry_date: DateOnly;
  total_quantity: number;
  reserved_quantity: number;
  low_stock_threshold: number;
  price_dzd: number | null;
  updated_at: Timestamp;
};

// ── Domain C: reservations, payments, ratings ───────────────────────────────
export type ReservationRow = {
  id: UUID;
  patient_id: UUID;
  pharmacy_id: UUID;
  /** The batch held (composite FK with pharmacy_id). */
  stock_id: UUID;
  quantity: number;
  status: ReservationStatus;
  /** CHECK IN (2, 4). */
  hold_duration_hours: 2 | 4;
  hold_expires_at: Timestamp | null;
  /** Six digits, generated by fn_create_reservation(). */
  pickup_code: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type PaymentRow = {
  id: UUID;
  /** Webhook idempotency key, UNIQUE. */
  chargily_checkout_id: string | null;
  payment_purpose: PaymentPurpose;
  reservation_id: UUID | null;
  pharmacy_id: UUID;
  amount_dzd: number;
  status: PaymentStatus;
  webhook_verified: boolean;
  paid_at: Timestamp | null;
  created_at: Timestamp;
};

export type PharmacyRatingRow = {
  id: UUID;
  patient_id: UUID;
  pharmacy_id: UUID;
  /** UNIQUE: one rating per completed reservation. */
  reservation_id: UUID;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  created_at: Timestamp;
};

// ── Domain D: prescriptions, alerts, demand ─────────────────────────────────
export type PrescriptionRow = {
  id: UUID;
  patient_id: UUID;
  image_storage_path: string;
  /** Prescriptions go to every pharmacy in this wilaya (there is no pharmacy_id). */
  wilaya: string | null;
  patient_notes: string | null;
  status: PrescriptionStatus;
  created_at: Timestamp;
};

export type PrescriptionResponseRow = {
  id: UUID;
  prescription_id: UUID;
  pharmacy_id: UUID;
  pharmacist_id: UUID;
  availability_status: AvailabilityStatus;
  response_notes: string | null;
  referred_pharmacy_id: UUID | null;
  responded_at: Timestamp;
};

export type StockAlertReminderRow = {
  id: UUID;
  user_id: UUID;
  medicine_id: UUID;
  pharmacy_id: UUID | null;
  alert_type: AlertType;
  refill_interval_days: number | null;
  next_trigger_at: Timestamp | null;
  last_notified_at: Timestamp | null;
  is_active: boolean;
  created_at: Timestamp;
};

export type SearchLogRow = {
  id: number;
  user_id: UUID | null;
  medicine_id: UUID | null;
  raw_query: string;
  wilaya: string | null;
  search_point: GeoPoint | null;
  results_count: number;
  found_in_stock: boolean;
  searched_at: Timestamp;
};

// ── Views ────────────────────────────────────────────────────────────────────
/** v_pharmacy_directory */
export type PharmacyDirectoryRow = Pick<PharmacyRow, "id" | "name" | "wilaya" | "commune" | "address" | "phone" | "location" | "opening_hours" | "rating_avg"> & {
  is_pro_active: boolean;
  is_on_duty_now: boolean;
};

/** v_pharmacy_medicine_availability (non-expired batches only). */
export type MedicineAvailabilityRow = {
  pharmacy_id: UUID;
  medicine_id: UUID;
  commercial_name: string;
  generic_dci_name: string;
  dosage_form: string | null;
  strength: string | null;
  total_available: number;
  min_price_dzd: number | null;
  max_price_dzd: number | null;
  nearest_expiry: DateOnly | null;
  batch_count: number;
  stock_status: StockStatus;
};

/** v_unmet_demand (last 30 days, found_in_stock = false). */
export type UnmetDemandRow = {
  wilaya: string | null;
  medicine_id: UUID | null;
  commercial_name: string | null;
  generic_dci_name: string | null;
  search_count: number;
  unique_users: number;
};

/** SearchResultItem from database/queries/search.ts (camelCase there). */
export type SearchResultItem = {
  medicineId: UUID;
  commercialName: string;
  genericDciName: string;
  dosageForm: string | null;
  strength: string | null;
  chifaReimbursable: boolean;
  isPrescriptionOnly: boolean;
  isEquivalent: boolean;
  equivalentToMedicineId?: UUID;
  pharmacyId: UUID;
  pharmacyName: string;
  wilaya: string;
  commune: string;
  address: string;
  phone: string | null;
  location: GeoPoint | null;
  distanceMeters: number | null;
  totalAvailable: number;
  minPriceDzd: number | null;
  maxPriceDzd: number | null;
  nearestExpiry: string | null;
  stockStatus: StockStatus;
  batchCount: number;
  ratingAvg: number | null;
  isOnDutyNow: boolean;
  isProActive: boolean;
};

/** Every table the front end reads or writes. */
export type Tables = {
  users: UserRow[];
  pharmacist_verifications: PharmacistVerificationRow[];
  pharmacies: PharmacyRow[];
  medicines: MedicineRow[];
  medicine_equivalents: MedicineEquivalentRow[];
  pharmacy_stock: PharmacyStockRow[];
  reservations: ReservationRow[];
  payments: PaymentRow[];
  pharmacy_ratings: PharmacyRatingRow[];
  prescriptions: PrescriptionRow[];
  prescription_responses: PrescriptionResponseRow[];
  stock_alerts_reminders: StockAlertReminderRow[];
  search_logs: SearchLogRow[];
};
