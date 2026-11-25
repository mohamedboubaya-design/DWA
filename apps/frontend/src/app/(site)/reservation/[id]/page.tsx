import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReservationView } from "@/components/reservation-view";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Your reservation", robots: { index: false } };

export default async function ReservationPage({ params, searchParams }: PageProps<"/reservation/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { checkout } = await searchParams;
  // ?checkout=returned|cancelled only changes the wording; payment status comes from the payments row.
  return <ReservationView id={id} checkout={checkout === "returned" || checkout === "cancelled" ? checkout : null} />;
}
