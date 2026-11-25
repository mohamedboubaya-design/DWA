/*
 * Server-side prices, keyed by the payments.payment_purpose enum. Both the
 * checkout route and the test payment page read amounts from here, never from
 * the browser or the URL.
 */
export const PURPOSES = {
  reservation_deposit: { amount: 100, description: "dwa reservation deposit (deducted at the counter)" },
} as const;

export type Purpose = keyof typeof PURPOSES;

export const isPurpose = (v: unknown): v is Purpose => typeof v === "string" && Object.hasOwn(PURPOSES, v);

/** The labelled test payment page only exists while no real Chargily key is configured. */
export const demoPaymentsEnabled = () => !process.env.CHARGILY_SECRET_KEY;
