"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Check, Copy, Phone, Send, Users, X } from "lucide-react";
import { useTables } from "@/lib/db/api";
import type { MedicineRow, PharmacyRow } from "@/lib/db/schema";
import { searchAvailability } from "@/lib/db/views";
import { fmtKm, medLabel, medName } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useT } from "@/lib/locale";

/*
 * Out of something? See which colleagues nearby have it (the same search a
 * patient runs) and send the patient there with a ready-made text.
 */
export function ReferDialog({ from, medicine }: { from: PharmacyRow; medicine: MedicineRow }) {
  const { t } = useT();
  const db = useTables();
  const now = useNow();
  const [copied, setCopied] = useState<string | null>(null);

  const nearby =
    now && from.location
      ? searchAvailability(db, now.getTime(), { medicineIds: [medicine.id], latitude: from.location.lat, longitude: from.location.lng, inStockOnly: true })
          .filter((r) => r.pharmacyId !== from.id)
          .slice(0, 4)
      : [];

  const message = (r: (typeof nearby)[number]) =>
    `${medLabel(medicine)} est disponible à la ${r.pharmacyName}, ${r.address}, ${r.commune}.${r.phone ? ` Tél ${r.phone}.` : ""} Orienté par la ${from.name} via dwa.`;

  return (
    <Dialog.Root onOpenChange={() => setCopied(null)}>
      <Dialog.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-green ring-1 ring-line hover:bg-green-soft" aria-label={t("ref.buttonLabel", { name: medName(medicine) })}>
        <Users className="size-3.5" aria-hidden /> {t("ref.button")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-overlay fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="cmd-panel surface fixed top-[12vh] left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 rounded-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold">{t("ref.title", { name: medName(medicine) })}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{t("ref.desc")}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t("common.close")} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {nearby.length === 0 ? (
            <p className="mt-6 rounded-lg bg-paper p-4 text-sm text-muted">{t("ref.none")}</p>
          ) : (
            <ul className="mt-5 divide-y divide-line/70">
              {nearby.map((r) => (
                <li key={r.pharmacyId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.pharmacyName}</span>
                    <span className="block text-xs text-muted">
                      {r.commune}
                      {r.distanceMeters !== null && (
                        <>
                          {" "}
                          · <span className="font-mono">{fmtKm(r.distanceMeters)}</span>
                        </>
                      )}{" "}
                      · <span className="font-mono">{t("common.boxes", { n: r.totalAvailable })}</span>
                    </span>
                  </span>
                  {r.phone && (
                    <a href={`tel:${r.phone.replace(/\s/g, "")}`} aria-label={t("ref.callLabel", { name: r.pharmacyName })} className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line hover:text-ink">
                      <Phone className="size-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(message(r));
                      } catch {}
                      setCopied(r.pharmacyId);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green px-3 text-xs font-medium text-white hover:bg-green-700"
                  >
                    {copied === r.pharmacyId ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {copied === r.pharmacyId ? t("ref.copied") : t("ref.copy")}
                  </button>
                  <a href={`sms:?body=${encodeURIComponent(message(r))}`} aria-label={t("ref.sms")} className="grid size-8 place-items-center rounded-lg text-muted ring-1 ring-line hover:text-ink">
                    <Send className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {copied && (
            <p className="mt-4 rounded-lg bg-paper p-3 text-xs text-muted" role="status">
              {message(nearby.find((r) => r.pharmacyId === copied)!)}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
