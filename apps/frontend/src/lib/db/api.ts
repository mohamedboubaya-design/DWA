"use client";

import { useSyncExternalStore } from "react";
import { useNow } from "../use-now";
import { DbError, check, newId, nowIso } from "./errors";
import { checkStockRow, fnCloseReservation, fnCreateReservation, fnExpireDueReservations, insertRating, setReservationStatus } from "./functions";
import { deleteFile, getFile, putFile, readTables, transact, useTables } from "./store";
import type { T } from "../i18n";
import type { AvailabilityStatus, GeoPoint, OpeningHours, PaymentRow, PharmacyRow, PharmacyStockRow, ReservationRow, Tables, UserRow } from "./schema";

/*
 * The operations the UI performs, one function per backend call. Today they run
 * against the mock store; each comment names the table, view or SQL function
 * the real endpoint must use. Writes are async so callers already await them.
 *
 * Patients never have accounts. A guest gives a name and phone when they
 * reserve, pay, ask for an alert or send a prescription; the backend stores
 * them as a `users` row with role 'patient' (found again by phone), which is
 * what reservations.patient_id, prescriptions.patient_id and
 * stock_alerts_reminders.user_id point to. Only pharmacists sign in.
 */

export { useTables };
export { DbError } from "./errors";

/** Deposit for a 4-hour hold; the checkout route charges the same fixed amount. */
export const DEPOSIT_DZD = 100;
export const MAX_BOXES = 5;
/** Refill reminders fire this many days before a treatment runs out. */
export const REFILL_LEAD_DAYS = 5;
const DAY = 86_400_000;

// ── Small localStorage-backed values (session, guest history) ───────────────
const valueCache = new Map<string, { raw: string | null; value: unknown }>();
const valueListeners = new Set<() => void>();

function readValue<T>(key: string, parse: (v: unknown) => T | null): T | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  const hit = valueCache.get(key);
  if (hit && hit.raw === raw) return hit.value as T | null;
  let value: T | null = null;
  try {
    value = raw ? parse(JSON.parse(raw)) : null;
  } catch {}
  if (raw && value === null) {
    // Malformed or tampered: drop it rather than crash.
    try {
      localStorage.removeItem(key);
    } catch {}
    raw = null;
  }
  valueCache.set(key, { raw, value });
  return value;
}

function writeValue(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  valueListeners.forEach((l) => l());
}

function subscribeValues(cb: () => void) {
  valueListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    valueListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// ── Phones ──────────────────────────────────────────────────────────────────
/** Spaces, dots and dashes people type between digit groups. */
const phoneDigits = (v: string) => v.replace(/[\s.\-()]/g, "");

/** Algerian mobile: 05, 06 or 07 then 8 digits, or the +213 form; "0550 12-34.56" is fine. */
export function validPhone(v: string) {
  return /^(?:0|\+213)[567]\d{8}$/.test(phoneDigits(v));
}

/** Stored form, +213XXXXXXXXX. */
export function normalizePhone(v: string) {
  const d = phoneDigits(v);
  return d.startsWith("+213") ? d : `+213${d.slice(1)}`;
}

export const validEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim());

// ── Guest (this device's history; the backend needs none of it) ─────────────
const GUEST_KEY = "dwa-guest-v1";

export type GuestHistory = { full_name: string | null; phone: string | null; reservation_ids: string[]; prescription_ids: string[]; alert_ids: string[] };
const EMPTY_GUEST: GuestHistory = { full_name: null, phone: null, reservation_ids: [], prescription_ids: [], alert_ids: [] };

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
function parseGuest(v: unknown): GuestHistory | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    full_name: typeof o.full_name === "string" ? o.full_name : null,
    phone: typeof o.phone === "string" ? o.phone : null,
    reservation_ids: strings(o.reservation_ids),
    prescription_ids: strings(o.prescription_ids),
    alert_ids: strings(o.alert_ids),
  };
}

export function useGuest(): GuestHistory {
  return useSyncExternalStore(subscribeValues, () => readValue(GUEST_KEY, parseGuest) ?? EMPTY_GUEST, () => EMPTY_GUEST);
}

function remember(patch: Partial<Pick<GuestHistory, "full_name" | "phone">>, add: Partial<Record<"reservation_ids" | "prescription_ids" | "alert_ids", string>> = {}) {
  const g = readValue(GUEST_KEY, parseGuest) ?? EMPTY_GUEST;
  const next: GuestHistory = { ...g, ...patch };
  for (const k of ["reservation_ids", "prescription_ids", "alert_ids"] as const) if (add[k]) next[k] = [add[k]!, ...g[k].filter((x) => x !== add[k])];
  writeValue(GUEST_KEY, next);
}

/** users row for a guest, found by phone or created. law_18_07_consent_at records the consent tick. */
function guestUserId(db: Tables, contact: { full_name?: string; phone: string }): string {
  const phone = normalizePhone(contact.phone);
  const existing = db.users.find((u) => u.role === "patient" && u.phone === phone);
  if (existing) {
    if (contact.full_name) existing.full_name = contact.full_name;
    existing.law_18_07_consent_at = nowIso();
    return existing.id;
  }
  const row: UserRow = {
    id: newId(),
    // users.email is NOT NULL UNIQUE; guests get a placeholder no one can sign in with.
    email: `guest-${phone.replace(/\D/g, "")}@guest.dwa.invalid`,
    password_hash: "!",
    role: "patient",
    full_name: contact.full_name?.trim() || "Guest",
    phone,
    chifa_card_number: null,
    law_18_07_consent_at: nowIso(),
    created_at: nowIso(),
  };
  db.users.push(row);
  return row.id;
}

// ── Pharmacist session ──────────────────────────────────────────────────────
const SESSION_KEY = "dwa-session-v2";
/** A pharmacist signs in again after this long (a working day plus margin). */
const SESSION_TTL_MS = 12 * 3_600_000;
type StoredSession = { user_id: string; signed_in_at: string };

function parseSession(v: unknown): StoredSession | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.user_id !== "string" || typeof o.signed_in_at !== "string") return null;
  const age = Date.now() - Date.parse(o.signed_in_at);
  // Expired, unparsable or from the future: treated as signed out (and removed).
  if (!(age >= 0 && age < SESSION_TTL_MS)) return null;
  return { user_id: o.user_id, signed_in_at: o.signed_in_at };
}

export type Session = { user: Omit<UserRow, "password_hash">; pharmacies: PharmacyRow[] };

/**
 * DEMO AUTH, NOT SECURE: the session is a value in this browser's storage and
 * anyone can edit it. The real backend must issue an httpOnly session cookie
 * and check the pharmacist's role and pharmacy on every request.
 * undefined while hydrating, null when signed out.
 */
export function useSession(): Session | null | undefined {
  const stored = useSyncExternalStore(subscribeValues, () => readValue(SESSION_KEY, parseSession), () => undefined);
  const db = useTables();
  const now = useNow();
  if (stored === undefined) return undefined;
  if (!stored) return null;
  // A tab left open past the limit is signed out on the next clock tick, not only on reload.
  if (now && now.getTime() - Date.parse(stored.signed_in_at) >= SESSION_TTL_MS) return null;
  const user = db.users.find((u) => u.id === stored.user_id && (u.role === "pharmacist" || u.role === "admin"));
  if (!user) return null;
  const { password_hash: _omit, ...safe } = user;
  void _omit;
  return { user: safe, pharmacies: db.pharmacies.filter((p) => p.owner_id === user.id) };
}

// Mock password hashing (the backend hashes server-side; the browser sends the password over HTTPS).
const ITERATIONS = 150_000;
const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return toHex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations }, key, 256));
}

async function hashPassword(password: string) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return ["pbkdf2_sha256", ITERATIONS, salt, await pbkdf2(password, salt, ITERATIONS)].join("$");
}

async function verifyPassword(password: string, stored: string) {
  const [algo, iter, salt, hash] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !salt || !hash) return false;
  const got = await pbkdf2(password, salt, Number(iter));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/** POST /auth/sign-in. One error for unknown email and wrong password, so emails can't be probed. */
export async function signIn(email: string, password: string) {
  const user = readTables().users.find((u) => u.email === email.trim().toLowerCase() && (u.role === "pharmacist" || u.role === "admin"));
  if (!user || !(await verifyPassword(password, user.password_hash))) throw new DbError("invalid_credentials");
  writeValue(SESSION_KEY, { user_id: user.id, signed_in_at: nowIso() } satisfies StoredSession);
}

export function signOut() {
  writeValue(SESSION_KEY, null);
}

export type SignUpInput = {
  full_name: string;
  email: string;
  phone: string | null;
  password: string;
  license_number: string;
  license_file_name: string;
  pharmacy: { name: string; wilaya: string; commune: string; address: string; phone: string | null; location: GeoPoint | null; opening_hours: OpeningHours };
};

/**
 * POST /auth/sign-up: users (role pharmacist, consent time) +
 * pharmacist_verifications (pending, licence document in storage) +
 * pharmacies (owner_id = the new user). The mock keeps only the document's name.
 */
export async function signUp(input: SignUpInput) {
  const email = input.email.trim().toLowerCase();
  if (readTables().users.some((u) => u.email === email)) throw new DbError("email_taken");
  const password_hash = await hashPassword(input.password);
  const userId = newId();
  transact((db) => {
    check(!db.users.some((u) => u.email === email), "email_taken");
    check(!db.pharmacist_verifications.some((v) => v.license_number === input.license_number.trim()), "unique_violation", "pharmacist_verifications.license_number");
    const at = nowIso();
    db.users.push({ id: userId, email, password_hash, role: "pharmacist", full_name: input.full_name.trim(), phone: input.phone, chifa_card_number: null, law_18_07_consent_at: at, created_at: at });
    db.pharmacist_verifications.push({
      id: newId(),
      user_id: userId,
      license_number: input.license_number.trim(),
      document_storage_path: `licences/${userId}/${input.license_file_name.replace(/[^\w.-]/g, "_")}`,
      status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: at,
    });
    db.pharmacies.push({ id: newId(), owner_id: userId, ...input.pharmacy, pro_plan_until: null, rating_avg: null, created_at: at, updated_at: at });
  });
  writeValue(SESSION_KEY, { user_id: userId, signed_in_at: nowIso() } satisfies StoredSession);
}

// ── Reservations ────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);

/** The batch a reservation would hold: not expired, enough boxes, soonest expiry first. */
export function pickBatch(db: Tables, pharmacyId: string, medicineId: string, quantity: number): PharmacyStockRow | undefined {
  return db.pharmacy_stock
    .filter((s) => s.pharmacy_id === pharmacyId && s.medicine_id === medicineId && s.expiry_date >= today() && s.total_quantity - s.reserved_quantity >= quantity)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0];
}

/** Most boxes one reservation can hold here: a reservation holds a single batch. */
export function maxReservable(db: Tables, pharmacyId: string, medicineId: string) {
  let best = 0;
  for (const s of db.pharmacy_stock)
    if (s.pharmacy_id === pharmacyId && s.medicine_id === medicineId && s.expiry_date >= today()) best = Math.max(best, s.total_quantity - s.reserved_quantity);
  return Math.min(best, MAX_BOXES);
}

/** POST /reservations → fn_create_reservation(patient, batch, pharmacy, quantity, 2 | 4). */
export async function reserve(input: { pharmacy_id: string; medicine_id: string; quantity: number; full_name: string; phone: string; withDeposit: boolean }): Promise<ReservationRow> {
  const row = transact((db) => {
    const batch = pickBatch(db, input.pharmacy_id, input.medicine_id, input.quantity);
    check(batch, "insufficient_stock");
    const patient_id = guestUserId(db, { full_name: input.full_name, phone: input.phone });
    return fnCreateReservation(db, { patient_id, stock_id: batch.id, pharmacy_id: input.pharmacy_id, quantity: input.quantity, hold_hours: input.withDeposit ? 4 : 2 });
  });
  remember({ full_name: input.full_name.trim(), phone: normalizePhone(input.phone) }, { reservation_ids: row.id });
  return row;
}

/** PATCH /reservations/:id: pending_payment → confirmed_held → ready_for_pickup. */
export async function advanceReservation(id: string, to: "confirmed_held" | "ready_for_pickup") {
  transact((db) => setReservationStatus(db, id, to));
}

/** POST /reservations/:id/close → fn_close_reservation(id, status). Declining is 'cancelled'. */
export async function closeReservation(id: string, to: "completed" | "cancelled") {
  transact((db) => fnCloseReservation(db, id, to));
}

/** Server job fn_expire_due_reservations(); the mock runs it when a page looks at reservations. */
export function sweepExpiredReservations(now: number) {
  const due = readTables().reservations.some(
    (r) => (r.status === "pending_payment" || r.status === "confirmed_held") && r.hold_expires_at && Date.parse(r.hold_expires_at) < now,
  );
  if (due) transact((db) => fnExpireDueReservations(db, now));
}

/** POST /reservations/:id/rating → pharmacy_ratings (only once the reservation is completed). */
export async function ratePharmacy(reservationId: string, rating: 1 | 2 | 3 | 4 | 5, comment: string) {
  transact((db) => insertRating(db, reservationId, rating, comment.trim() || null));
}

// ── Payments ────────────────────────────────────────────────────────────────
export function depositPayment(db: Tables, reservationId: string): PaymentRow | undefined {
  return db.payments
    .filter((p) => p.reservation_id === reservationId && p.payment_purpose === "reservation_deposit")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/**
 * Deposit checkout: a pending payments row, then /api/checkout for the payment
 * page. Paid status only ever comes from the payments row (written by the
 * Chargily webhook in production), never from the return URL.
 */
export async function startDepositCheckout(reservationId: string) {
  const payment = transact((db) => {
    const r = db.reservations.find((x) => x.id === reservationId);
    check(r, "not_found");
    const existing = depositPayment(db, reservationId);
    if (existing && existing.status === "pending") return existing;
    check(!existing || existing.status !== "paid", "unique_violation", "deposit already paid");
    const row: PaymentRow = {
      id: newId(),
      chargily_checkout_id: null,
      payment_purpose: "reservation_deposit",
      reservation_id: r.id,
      pharmacy_id: r.pharmacy_id,
      amount_dzd: DEPOSIT_DZD,
      status: "pending",
      webhook_verified: false,
      paid_at: null,
      created_at: nowIso(),
    };
    db.payments.push(row);
    return row;
  });
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "reservation_deposit", reservation_id: reservationId, payment_id: payment.id }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; checkout_id?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Payment could not start");
  if (data.checkout_id) {
    const checkoutId = data.checkout_id;
    transact((db) => {
      const p = db.payments.find((x) => x.id === payment.id);
      if (p) p.chargily_checkout_id = checkoutId;
    });
  }
  window.location.assign(data.url);
}

/** DEMO ONLY: stands in for the Chargily webhook when the test payment page is used. */
export async function settleDemoPayment(paymentId: string, ok: boolean) {
  transact((db) => {
    const p = db.payments.find((x) => x.id === paymentId);
    check(p, "not_found");
    if (p.status !== "pending") return;
    p.status = ok ? "paid" : "failed";
    p.paid_at = ok ? nowIso() : null;
  });
}

// ── Alerts and refill reminders (stock_alerts_reminders) ────────────────────
/** POST /alerts: back_in_stock for a medicine, any pharmacy. */
export async function subscribeBackInStock(medicineId: string, phone: string) {
  const id = transact((db) => {
    const user_id = guestUserId(db, { full_name: readValue(GUEST_KEY, parseGuest)?.full_name ?? undefined, phone });
    const existing = db.stock_alerts_reminders.find((a) => a.user_id === user_id && a.medicine_id === medicineId && a.alert_type === "back_in_stock" && a.is_active);
    if (existing) return existing.id;
    const row = { id: newId(), user_id, medicine_id: medicineId, pharmacy_id: null, alert_type: "back_in_stock" as const, refill_interval_days: null, next_trigger_at: null, last_notified_at: null, is_active: true, created_at: nowIso() };
    db.stock_alerts_reminders.push(row);
    return row.id;
  });
  remember({ phone: normalizePhone(phone) }, { alert_ids: id });
}

/** POST /alerts: refill_reminder. next_trigger_at is when to remind: REFILL_LEAD_DAYS before it runs out. */
export async function addRefillReminder(input: { medicine_id: string; phone: string; refill_interval_days: number; days_left: number }) {
  const id = transact((db) => {
    const user_id = guestUserId(db, { full_name: readValue(GUEST_KEY, parseGuest)?.full_name ?? undefined, phone: input.phone });
    const row = {
      id: newId(),
      user_id,
      medicine_id: input.medicine_id,
      pharmacy_id: null,
      alert_type: "refill_reminder" as const,
      refill_interval_days: Math.max(1, Math.round(input.refill_interval_days)),
      next_trigger_at: new Date(Date.now() + (input.days_left - REFILL_LEAD_DAYS) * DAY).toISOString(),
      last_notified_at: null,
      is_active: true,
      created_at: nowIso(),
    };
    db.stock_alerts_reminders.push(row);
    return row.id;
  });
  remember({ phone: normalizePhone(input.phone) }, { alert_ids: id });
}

/** PATCH /alerts/:id: a box was bought, so the next reminder moves one interval later. */
export async function markRefilled(id: string) {
  transact((db) => {
    const a = db.stock_alerts_reminders.find((x) => x.id === id);
    check(a && a.alert_type === "refill_reminder" && a.refill_interval_days, "not_found");
    const from = Math.max(Date.now() - REFILL_LEAD_DAYS * DAY, Date.parse(a.next_trigger_at ?? nowIso()));
    a.next_trigger_at = new Date(from + a.refill_interval_days * DAY).toISOString();
  });
}

/** DELETE /alerts/:id → is_active = false. */
export async function stopAlert(id: string) {
  transact((db) => {
    const a = db.stock_alerts_reminders.find((x) => x.id === id);
    if (a) a.is_active = false;
  });
}

// ── Prescriptions ───────────────────────────────────────────────────────────
/** POST /prescriptions: image to storage, then a row for every pharmacy in the wilaya to see. */
export async function submitPrescription(input: { wilaya: string; image: string; notes: string; phone: string }) {
  const id = newId();
  const path = `prescriptions/${id}.jpg`;
  putFile(path, input.image);
  try {
    transact((db) => {
      const patient_id = guestUserId(db, { full_name: readValue(GUEST_KEY, parseGuest)?.full_name ?? undefined, phone: input.phone });
      db.prescriptions.push({ id, patient_id, image_storage_path: path, wilaya: input.wilaya, patient_notes: input.notes.trim() || null, status: "uploaded", created_at: nowIso() });
    });
  } catch (e) {
    deleteFile(path);
    throw e;
  }
  remember({ phone: normalizePhone(input.phone) }, { prescription_ids: id });
}

/** POST /prescriptions/:id/responses → prescription_responses; the prescription becomes 'answered'. */
export async function respondToPrescription(input: {
  prescription_id: string;
  pharmacy_id: string;
  pharmacist_id: string;
  availability_status: AvailabilityStatus;
  response_notes: string;
  referred_pharmacy_id: string | null;
}) {
  transact((db) => {
    const rx = db.prescriptions.find((p) => p.id === input.prescription_id);
    check(rx, "not_found");
    check(rx.status !== "closed", "check_violation", "prescription closed");
    check(!db.prescription_responses.some((r) => r.prescription_id === rx.id && r.pharmacy_id === input.pharmacy_id), "unique_violation", "already answered");
    db.prescription_responses.push({
      id: newId(),
      prescription_id: rx.id,
      pharmacy_id: input.pharmacy_id,
      pharmacist_id: input.pharmacist_id,
      availability_status: input.availability_status,
      response_notes: input.response_notes.trim() || null,
      referred_pharmacy_id: input.referred_pharmacy_id,
      responded_at: nowIso(),
    });
    rx.status = "answered";
  });
}

/** GET on the storage object behind image_storage_path (a signed URL in production). */
export function prescriptionImageUrl(path: string): string | null {
  return getFile(path);
}

/** PATCH /prescriptions/:id → closed (the patient has what they need). */
export async function closePrescription(id: string) {
  transact((db) => {
    const rx = db.prescriptions.find((p) => p.id === id);
    if (rx) rx.status = "closed";
  });
}

// ── Stock (pharmacist) ──────────────────────────────────────────────────────
export type NewBatch = Pick<PharmacyStockRow, "pharmacy_id" | "medicine_id" | "batch_barcode" | "production_date" | "expiry_date" | "total_quantity" | "price_dzd" | "low_stock_threshold">;

/** POST /pharmacies/:id/stock → pharmacy_stock row (UNIQUE pharmacy, medicine, batch). */
export async function addBatch(input: NewBatch) {
  transact((db) => {
    check(input.batch_barcode.trim(), "check_violation", "batch_barcode NOT NULL");
    check(
      !db.pharmacy_stock.some((s) => s.pharmacy_id === input.pharmacy_id && s.medicine_id === input.medicine_id && s.batch_barcode === input.batch_barcode.trim()),
      "unique_violation",
      "unique_batch",
    );
    const row: PharmacyStockRow = { ...input, batch_barcode: input.batch_barcode.trim(), id: newId(), reserved_quantity: 0, updated_at: nowIso() };
    checkStockRow(row);
    db.pharmacy_stock.push(row);
  });
}

/** PATCH /stock/:id: total_quantity can't drop below what is reserved. */
export async function setBatchTotal(id: string, total: number) {
  transact((db) => {
    const s = db.pharmacy_stock.find((x) => x.id === id);
    check(s, "not_found");
    s.total_quantity = total;
    s.updated_at = nowIso();
    checkStockRow(s);
  });
}

/** DELETE /stock/:id: refused while any reservation points at the batch (FK, no ON DELETE). */
export async function deleteBatch(id: string): Promise<PharmacyStockRow> {
  return transact((db) => {
    const i = db.pharmacy_stock.findIndex((x) => x.id === id);
    check(i >= 0, "not_found");
    check(!db.reservations.some((r) => r.stock_id === id), "foreign_key_violation", "reservations.stock_id");
    return db.pharmacy_stock.splice(i, 1)[0];
  });
}

/** Undo for deleteBatch. */
export async function restoreBatch(row: PharmacyStockRow) {
  transact((db) => {
    if (!db.pharmacy_stock.some((s) => s.id === row.id)) db.pharmacy_stock.push(row);
  });
}

// ── Search logging (search.ts logs every search) ────────────────────────────
export function logSearch(entry: { raw_query: string; medicine_id: string | null; wilaya: string | null; search_point: GeoPoint | null; results_count: number; found_in_stock: boolean }) {
  try {
    transact((db) => {
      const id = db.search_logs.reduce((m, l) => Math.max(m, l.id), 0) + 1;
      db.search_logs.push({ id, user_id: null, ...entry, searched_at: nowIso() });
      // Keep the mock small: the last 500 searches are plenty for the demand panel.
      if (db.search_logs.length > 500) db.search_logs.splice(0, db.search_logs.length - 500);
    });
  } catch {
    // Telemetry must never break a search.
  }
}

/** The DbError code of a failed write, or "unknown". */
export function errorKey(e: unknown) {
  if (e instanceof DbError) return e.code;
  return "unknown";
}

/** The message to show for a failed write: storage problems get their own explanation. */
export function writeErrorText(t: T, e: unknown) {
  const code = errorKey(e);
  return t(code === "storage_full" ? "common.storageFull" : code === "storage_unavailable" ? "common.storageBlocked" : "common.genericError");
}
