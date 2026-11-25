import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PharmacyDetail } from "@/components/pharmacy-detail";
import { seedTables } from "@/lib/db/seed";
import { isUuid } from "@/lib/uuid";

// The seeded pharmacies are pre-rendered; any other id (a pharmacy created at
// sign-up) renders on demand and is looked up in the browser's data.
export function generateStaticParams() {
  return seedTables(Date.now()).pharmacies.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/pharmacy/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = seedTables(Date.now()).pharmacies.find((x) => x.id === id);
  return { title: p ? `${p.name}, ${p.commune}` : "Pharmacy" };
}

export default async function PharmacyPage({ params }: PageProps<"/pharmacy/[id]">) {
  const { id } = await params;
  // Ids are UUIDs: anything else is a real 404. (Whether a UUID exists is known only to the data store.)
  if (!isUuid(id)) notFound();
  return <PharmacyDetail id={id} />;
}
