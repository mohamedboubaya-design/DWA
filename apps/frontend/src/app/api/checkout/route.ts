/*
 * Starts a reservation-deposit payment. The amount is fixed here, never taken
 * from the browser.
 *
 * With CHARGILY_SECRET_KEY set (in .env.local), this creates a Chargily Pay V2
 * checkout (EDAHABIA / CIB) and returns its hosted payment URL plus the checkout
 * id, which the caller stores in payments.chargily_checkout_id (the webhook's
 * idempotency key). Test keys hit Chargily's test environment; set
 * CHARGILY_MODE=live only with live keys. Without a key it returns the labelled
 * demo payment page, so the flow works end to end with no account.
 *
 * TODO(backend): check that the reservation exists, is still open and belongs
 * to the caller, and create the payments row here. That needs the database; the
 * front end cannot do it safely.
 *
 * Chargily API reference: https://dev.chargily.com/pay-v2/introduction
 */

import { PURPOSES, isPurpose } from "@/lib/payments";
import { isUuid } from "@/lib/uuid";


const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object") return fail(400, "Invalid body");
  const { purpose, reservation_id, payment_id } = body as Record<string, unknown>;

  if (!isPurpose(purpose)) return fail(400, "Unknown purpose");
  if (!isUuid(reservation_id)) return fail(400, "Invalid reservation_id");
  if (!isUuid(payment_id)) return fail(400, "Invalid payment_id");

  const { amount, description } = PURPOSES[purpose];
  const origin = new URL(request.url).origin;
  // The return pages only say "we are confirming your payment"; they never mark anything paid.
  const success = `${origin}/reservation/${reservation_id}?checkout=returned`;
  const failure = `${origin}/reservation/${reservation_id}?checkout=cancelled`;

  const secret = process.env.CHARGILY_SECRET_KEY;
  if (!secret) {
    // No key: the labelled test page (demoPaymentsEnabled() is true exactly in this case).
    const demo = new URL("/pay/demo", origin);
    demo.search = new URLSearchParams({ purpose, reservation_id, payment_id }).toString();
    return Response.json({ url: demo.toString(), mode: "demo" });
  }

  const live = process.env.CHARGILY_MODE === "live";
  const api = live ? "https://pay.chargily.net/api/v2" : "https://pay.chargily.net/test/api/v2";
  let res: Response;
  try {
    res = await fetch(`${api}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        currency: "dzd",
        success_url: success,
        failure_url: failure,
        description,
        locale: "fr",
        metadata: { purpose, reservation_id, payment_id },
      }),
    });
  } catch {
    return fail(502, "Payment provider unreachable");
  }
  // Never forward the provider's body: it can echo request details.
  if (!res.ok) return fail(502, "Payment provider error");
  const data = (await res.json().catch(() => ({}))) as { id?: string; checkout_url?: string };
  if (!data.checkout_url) return fail(502, "Payment provider returned no checkout URL");
  return Response.json({ url: data.checkout_url, checkout_id: data.id ?? null, mode: live ? "live" : "test" });
}
