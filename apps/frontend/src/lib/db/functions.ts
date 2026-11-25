/*
 * Mock versions of the SQL functions and triggers in the DWA migrations, so the
 * front end hits the same rules the database enforces. Each takes the draft
 * tables inside transact() and throws DbError where Postgres would raise.
 */

import { DbError, check, newId, nowIso } from "./errors";
import type { ReservationRow, ReservationStatus, StockStatus, Tables } from "./schema";

/** fn_stock_status(available, threshold). */
export function stockStatus(available: number, threshold: number): StockStatus {
  if (available <= 0) return "out_of_stock";
  if (available <= threshold) return "low_stock";
  return "in_stock";
}

const today = () => new Date().toISOString().slice(0, 10);

/** CHECK stock_quantity_check: total_quantity >= reserved_quantity AND reserved_quantity >= 0. */
export function checkStockRow(row: { total_quantity: number; reserved_quantity: number }) {
  check(Number.isInteger(row.total_quantity) && row.total_quantity >= row.reserved_quantity && row.reserved_quantity >= 0, "check_violation", "stock_quantity_check");
}

/** fn_create_reservation(): locks the batch, checks expiry and availability, holds the boxes. */
export function fnCreateReservation(
  db: Tables,
  p: { patient_id: string; stock_id: string; pharmacy_id: string; quantity: number; hold_hours: 2 | 4 },
): ReservationRow {
  const stock = db.pharmacy_stock.find((s) => s.id === p.stock_id && s.pharmacy_id === p.pharmacy_id);
  if (!stock) throw new DbError("not_found", `Stock item ${p.stock_id} not found in pharmacy ${p.pharmacy_id}`);
  check(stock.expiry_date >= today(), "expired_batch", "Cannot reserve expired medication batch");
  check(Number.isInteger(p.quantity) && p.quantity > 0, "check_violation", "positive_quantity");
  check(stock.total_quantity - stock.reserved_quantity >= p.quantity, "insufficient_stock");
  check(p.hold_hours === 2 || p.hold_hours === 4, "check_violation", "valid_hold");
  check(db.users.some((u) => u.id === p.patient_id), "foreign_key_violation", "reservations.patient_id");

  stock.reserved_quantity += p.quantity;
  stock.updated_at = nowIso();

  const created = new Date();
  const row: ReservationRow = {
    id: newId(),
    patient_id: p.patient_id,
    pharmacy_id: p.pharmacy_id,
    stock_id: p.stock_id,
    quantity: p.quantity,
    status: "pending_payment",
    hold_duration_hours: p.hold_hours,
    hold_expires_at: new Date(created.getTime() + p.hold_hours * 3_600_000).toISOString(),
    pickup_code: String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0"),
    created_at: created.toISOString(),
    updated_at: created.toISOString(),
  };
  db.reservations.push(row);
  return row;
}

/** fn_guard_reservation_transitions() (002_fixes.sql). */
const LEGAL: Partial<Record<ReservationStatus, ReservationStatus[]>> = {
  pending_payment: ["confirmed_held", "cancelled", "expired"],
  confirmed_held: ["ready_for_pickup", "expired", "cancelled"],
  ready_for_pickup: ["completed", "expired", "cancelled"],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus) {
  return from === to || !!LEGAL[from]?.includes(to);
}

function guard(r: ReservationRow, to: ReservationStatus) {
  if (!canTransition(r.status, to)) throw new DbError("illegal_transition", `Illegal reservation transition: ${r.status} -> ${to}`);
}

/** Plain status change for the steps that do not touch stock (confirm, mark ready). */
export function setReservationStatus(db: Tables, id: string, to: "confirmed_held" | "ready_for_pickup") {
  const r = db.reservations.find((x) => x.id === id);
  if (!r) throw new DbError("not_found");
  guard(r, to);
  r.status = to;
  r.updated_at = nowIso();
}

/**
 * fn_close_reservation(): completed takes the boxes off the shelf; cancelled
 * and expired put them back. Always use this to end a reservation, never a
 * plain status update, or the held boxes stay reserved for ever.
 */
export function fnCloseReservation(db: Tables, id: string, to: "completed" | "cancelled" | "expired") {
  const r = db.reservations.find((x) => x.id === id);
  if (!r) throw new DbError("not_found", `Reservation ${id} not found`);
  guard(r, to);
  const stock = db.pharmacy_stock.find((s) => s.id === r.stock_id);
  r.status = to;
  r.updated_at = nowIso();
  if (!stock) return;
  if (to === "completed") stock.total_quantity -= r.quantity;
  stock.reserved_quantity -= r.quantity;
  stock.updated_at = nowIso();
  checkStockRow(stock);
}

/** fn_expire_due_reservations(): holds past their deadline expire and release their boxes. */
export function fnExpireDueReservations(db: Tables, now: number): number {
  let n = 0;
  for (const r of db.reservations) {
    if ((r.status === "pending_payment" || r.status === "confirmed_held") && r.hold_expires_at && Date.parse(r.hold_expires_at) < now) {
      fnCloseReservation(db, r.id, "expired");
      n++;
    }
  }
  return n;
}

/** trg_check_rating_completed + trg_refresh_pharmacy_rating. */
export function insertRating(db: Tables, reservationId: string, rating: 1 | 2 | 3 | 4 | 5, comment: string | null) {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new DbError("not_found", `Reservation ${reservationId} does not exist`);
  check(r.status === "completed", "check_violation", `Cannot rate: reservation has status ${r.status}, must be completed`);
  check(!db.pharmacy_ratings.some((x) => x.reservation_id === reservationId), "unique_violation", "pharmacy_ratings.reservation_id");
  check(rating >= 1 && rating <= 5, "check_violation", "valid_rating");
  db.pharmacy_ratings.push({ id: newId(), patient_id: r.patient_id, pharmacy_id: r.pharmacy_id, reservation_id: r.id, rating, comment, created_at: nowIso() });
  const mine = db.pharmacy_ratings.filter((x) => x.pharmacy_id === r.pharmacy_id);
  const p = db.pharmacies.find((x) => x.id === r.pharmacy_id);
  if (p) {
    p.rating_avg = mine.length ? Math.round((mine.reduce((s, x) => s + x.rating, 0) / mine.length) * 100) / 100 : null;
    p.updated_at = nowIso();
  }
}
