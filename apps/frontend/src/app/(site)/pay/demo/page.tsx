import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoPay } from "@/components/demo-pay";
import { PURPOSES, demoPaymentsEnabled, isPurpose } from "@/lib/payments";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

export default async function DemoPayPage({ searchParams }: PageProps<"/pay/demo">) {
  // With a real Chargily key, payments go through Chargily only: this page must not exist.
  if (!demoPaymentsEnabled()) notFound();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const purpose = get("purpose");
  // The amount comes from the server's price table, never from the URL.
  const amount = isPurpose(purpose) ? PURPOSES[purpose].amount : 0;
  return <DemoPay purpose={purpose} reservationId={get("reservation_id")} paymentId={get("payment_id")} amount={amount} />;
}
