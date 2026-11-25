import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Chargily calls this after a payment. The raw body is signed with HMAC-SHA256
 * using the secret key, sent in the "signature" header; anything that fails the
 * check is rejected before the body is parsed.
 *
 * Status codes: 503 not configured, 400 missing signature or bad JSON,
 * 403 bad signature, 200 accepted.
 */
export async function POST(request: Request) {
  const secret = process.env.CHARGILY_SECRET_KEY;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const expected = createHmac("sha256", secret).update(raw).digest();
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Bad signature", { status: 403 });

  let event: { type?: string; data?: { id?: string; metadata?: { purpose?: string; reservation_id?: string; payment_id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // TODO(backend): persist, idempotently, keyed on payments.chargily_checkout_id = event.data.id:
  //   checkout.paid   → status 'paid', webhook_verified = true, paid_at = now()
  //   checkout.failed → status 'failed', webhook_verified = true
  // A repeated delivery of the same checkout id must be a no-op. This is the only
  // place a deposit may become paid; the browser's return URL proves nothing.
  console.info("[chargily] verified event", event.type, event.data?.id, event.data?.metadata?.purpose);
  return new Response(null, { status: 200 });
}
