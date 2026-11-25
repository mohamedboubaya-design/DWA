# dwa — front end

Front end for dwa, which shows which pharmacy in Alger has a medicine in stock, so people stop walking from one pharmacy to the next.

The data layer follows the database schema in [`database/`](../../database/) at the root of this repository (`database/migrations/001_initial_schema.sql` and `002_fixes.sql`). Tables, columns, enums and rules are the same. There is **no backend yet**: everything runs against a mock store in the browser's `localStorage`. All of it sits behind one module, [`src/lib/db/api.ts`](src/lib/db/api.ts), which is the seam to replace with HTTP calls.

## Run it

```bash
cd apps/frontend
npm install
cp .env.example .env.local   # optional: only needed for real Chargily test payments
npm run dev
```

Open http://localhost:3000. The maps load their tiles from OpenFreeMap, so they need an internet connection.

Checks: `npm run typecheck` (generates Next's route types, then runs `tsc`), `npm run lint`, `npm run build`.

## Who uses it

- **Patients have no account.** They search freely. They give a name and phone number, and tick a consent box (law 18-07), only when they reserve, pay a deposit, ask for a back-in-stock text, set a refill reminder or send a prescription. Each guest is stored as a `users` row with role `patient`, found again by phone number. That is what `reservations.patient_id`, `prescriptions.patient_id` and `stock_alerts_reminders.user_id` point to. "My dwa" lists what was done on this device.
- **Only pharmacists sign in.** Signing up creates the account (`users`), the licence check (`pharmacist_verifications`, pending until an admin reviews it) and the pharmacy the account owns (`pharmacies.owner_id`). An account can own several pharmacies, and the dashboard has a picker when it does.

Demo pharmacist accounts all use the password `demo1234`:

| Email | Pharmacy |
| --- | --- |
| `meziane@demo.dwa.dz` | Pharmacie Meziane, Alger Centre |
| `pins@demo.dwa.dz` | Pharmacie des Pins, Hydra (on duty tonight) |
| `centre@demo.dwa.dz` | Pharmacie du Centre, El Biar |
| `garidi@demo.dwa.dz` | Pharmacie Garidi, Kouba (on duty tonight; the only one with Ventoline) |
| `ennour@demo.dwa.dz` | Pharmacie Ennour, Bab Ezzouar (24/7) |
| `colonne@demo.dwa.dz` | Pharmacie La Colonne, Bir Mourad Raïs |
| `salam@demo.dwa.dz` | Pharmacie Es-Salam, Chéraga (on duty tonight) |
| `1ermai@demo.dwa.dz` | Pharmacie du 1er Mai, Belouizdad |

## Routes

| Path | What it is |
| --- | --- |
| `/` | Home: a scroll story over a 3D night map of Alger |
| `/search?q=…` | Medicine search: fuzzy match on brand or active ingredient, nearest pharmacies first. Filters: in stock, open now, on duty (`garde`), CHIFA reimbursed. Falls back to exact generics when nobody has it |
| `/pharmacy/[id]` | A pharmacy: hours, on-duty shift, everything it lists, reserve buttons, send a prescription |
| `/reservation/[id]` | A reservation: 6-digit pickup code, status, deposit, rating. The id is a UUID, so the link can't be guessed |
| `/me` | My dwa: this device's reservations, prescriptions and answers, refill reminders and alerts |
| `/login`, `/signup` | Pharmacist sign-in and sign-up |
| `/dashboard` | Pharmacist dashboard: stock by batch, reservations, prescriptions for the wilaya, missed demand, on-duty shift |
| `/pay/demo` | Labelled test payment page, used when no Chargily key is set |
| `/api/checkout` | Starts a deposit payment (Chargily, or the test page) |
| `/api/chargily/webhook` | Chargily webhook: verifies the signature; persisting the result is left to the backend |

## How the front end follows the schema

- **IDs** are UUIDs and **columns** keep their snake_case names ([`src/lib/db/schema.ts`](src/lib/db/schema.ts)).
- **Medicines** are real rows from the national nomenclature, with the barcode the DB seed generates for them. They are shown in a readable case, but the stored values are unchanged.
- **Stock** is one row per batch (`pharmacy_stock`). Available means `total_quantity − reserved_quantity`. Status comes from `fn_stock_status()`: out at 0 or less, low at the batch's threshold or below. Prices belong to batches, so lists show a price range.
- **Reservations** hold one batch, the soonest-expiring one with enough boxes (`fn_create_reservation`). The hold lasts 2 hours, or 4 with a deposit. Status moves `pending_payment → confirmed_held → ready_for_pickup → completed`, or ends as `cancelled` / `expired`, under the same transition rules as the DB trigger. Collecting or cancelling goes through `fn_close_reservation`, so held boxes are taken off the shelf or released. A pharmacy declining a request is a cancellation.
- **Deposits** are `payments` rows (`reservation_deposit`, 100 DZD fixed on the server). A deposit counts as paid only when the row says `paid`; the return URL from the payment page proves nothing.
- **Prescriptions** go to every pharmacy in a wilaya; there is no `pharmacy_id`. Each pharmacy answers once, with an availability status, a note and optionally a colleague to refer to. There is no price total, because the schema has no column for it.
- **On duty (garde)** comes from rota rows; pharmacists can't toggle it. **Opening hours** use the seed's JSON shape `{ mon_fri, sat, sun }`.
- **Alerts and refill reminders** are `stock_alerts_reminders` rows: back-in-stock by medicine, and refill reminders by `refill_interval_days` and `next_trigger_at`.
- **Missed demand** reads `v_unmet_demand`. Every search is logged to `search_logs`, as `queries/search.ts` does.

## Demo limitations

These need the backend; they are labelled in the UI where they show.

- **All data lives in this browser.** Another browser or device sees the seed, not your changes. Clearing site data resets everything.
- **Sign-in is not secure.** The session is a value in `localStorage` that anyone can edit (it expires after 12 hours), and passwords are hashed in the browser.
- **Payments are not verified.** The test page `/pay/demo` exists only while no Chargily key is set (it returns 404 otherwise). On it, "paying" settles the payment row directly and the UI says it is unverified. With a Chargily key, the real webhook can't reach the browser's store, so a deposit stays "being confirmed".
- **Files are not uploaded.** Prescription photos are compressed (at most 1280 px, JPEG quality 0.7) and kept in `localStorage`. Licence documents are not kept at all. A full storage shows a message.
- **Rota rows are generated** for tonight so the on-duty filter has something to show, and hold expiry runs when a page is open (the server runs `fn_expire_due_reservations()` on a schedule).
- **Texts (SMS) are not sent.** Alerts and reminders are recorded; on this device, the browser can show a notification.

## What the backend has to provide

One endpoint per function in [`src/lib/db/api.ts`](src/lib/db/api.ts); each comment there names the table, view or SQL function to use. In short:

1. Server-side auth for pharmacists (httpOnly session cookie), with a role check and ownership check on every pharmacist request, and row-level security.
2. Guest handling: find or create the `users` row (role `patient`) by phone, set `law_18_07_consent_at`, and use a placeholder email, because `users.email` is NOT NULL. Rate-limit reservation lookups by id.
3. Reservations through `fn_create_reservation` / `fn_close_reservation`, plus a scheduled `fn_expire_due_reservations()`.
4. Payments: create the `payments` row in `/api/checkout`, after checking the reservation exists and is open. The webhook then updates it idempotently by `chargily_checkout_id` (see the `TODO(backend)` notes).
5. A storage bucket for prescription photos and licence documents, with size limits; `image_storage_path` / `document_storage_path` hold the keys.
6. SMS sending for back-in-stock alerts and refill reminders.

## Project layout

```
src/app/            routes (App Router) and the two API routes
src/components/     UI; dashboard/ is the pharmacist side, map-story/ the home page
src/lib/db/         schema types, seed, mock store, SQL-function mirrors, views, api.ts
src/lib/format.ts   display helpers (names, strengths, prices, hours)
src/lib/i18n.ts     English, French and Arabic strings (Arabic is right-to-left)
```
