"use client";

import { useSyncExternalStore } from "react";
import { DbError } from "./errors";
import { seedTables } from "./seed";
import type { Tables } from "./schema";

/*
 * MOCK BACKEND. There is no API yet, so the tables live in this browser's
 * localStorage, seeded from seed.ts. Everything the UI does goes through
 * api.ts, which is the seam to replace with HTTP calls once the backend exists;
 * nothing outside src/lib/db/ touches this file directly.
 *
 * Writes run inside transact(): the callback edits a copy, and either all of it
 * is saved or (if it throws a DbError, like a failed SQL constraint) none of it.
 */

const KEY = "dwa-mockdb-v2";
const FILE_PREFIX = "dwa-mockfile:";

// ── Server snapshot: the seed for today, identical on server and client ──────
let serverSeed: { day: string; tables: Tables } | null = null;
function seedForToday(): Tables {
  const day = new Date().toISOString().slice(0, 10);
  if (!serverSeed || serverSeed.day !== day) serverSeed = { day, tables: seedTables(Date.now()) };
  return serverSeed.tables;
}

// ── Client state ────────────────────────────────────────────────────────────
let current: Tables | null = null;
const listeners = new Set<() => void>();

const TABLE_NAMES: (keyof Tables)[] = [
  "users",
  "pharmacist_verifications",
  "pharmacies",
  "medicines",
  "medicine_equivalents",
  "pharmacy_stock",
  "reservations",
  "payments",
  "pharmacy_ratings",
  "prescriptions",
  "prescription_responses",
  "stock_alerts_reminders",
  "search_logs",
];

/** Every table present and an array; anything else (older shape, partial write, tampering) is discarded. */
function isTables(v: unknown): v is Tables {
  return !!v && typeof v === "object" && TABLE_NAMES.every((name) => Array.isArray((v as Record<string, unknown>)[name]));
}

function load(): Tables {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {}
      if (isTables(parsed)) return parsed;
      localStorage.removeItem(KEY); // unreadable or from an older shape: start again from the seed
    }
  } catch {}
  return seedForToday();
}

function snapshot(): Tables {
  if (!current) current = load();
  return current;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    // Another tab wrote: re-read, so a reservation made there shows up here.
    if (e.key === KEY || e.key === null) {
      current = load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The whole mock database, re-rendering when any table changes. */
export function useTables(): Tables {
  return useSyncExternalStore(subscribe, snapshot, seedForToday);
}

/** Current tables outside React (event handlers). */
export function readTables(): Tables {
  return typeof window === "undefined" ? seedForToday() : snapshot();
}

function isQuotaError(e: unknown) {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

/** localStorage refused (quota) or unavailable (blocked site data, some private modes) → a DbError the UI can explain. */
function storageError(e: unknown): DbError {
  return new DbError(isQuotaError(e) ? "storage_full" : "storage_unavailable");
}

/** Runs fn on a copy of the tables and saves the result, or nothing if fn throws. */
export function transact<T>(fn: (db: Tables) => T): T {
  const draft = structuredClone(snapshot());
  const result = fn(draft);
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch (e) {
    throw storageError(e);
  }
  current = draft;
  emit();
  return result;
}

// ── Mock object storage (stands in for a storage bucket) ────────────────────
export function putFile(path: string, dataUrl: string) {
  try {
    localStorage.setItem(FILE_PREFIX + path, dataUrl);
  } catch (e) {
    throw storageError(e);
  }
}

export function getFile(path: string): string | null {
  try {
    return localStorage.getItem(FILE_PREFIX + path);
  } catch {
    return null;
  }
}

export function deleteFile(path: string) {
  try {
    localStorage.removeItem(FILE_PREFIX + path);
  } catch {}
}
