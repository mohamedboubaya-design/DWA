"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, Loader2, ShieldCheck, X } from "lucide-react";
import { DEPOSIT_DZD, errorKey, reserve, startDepositCheckout, useGuest, validPhone, writeErrorText } from "@/lib/db/api";
import type { MedicineRow } from "@/lib/db/schema";
import { fmtPrice, medName, strengthText } from "@/lib/format";
import { useT } from "@/lib/locale";
import { ConsentField } from "./consent-field";

/*
 * "Hold it for me": a guest asks a pharmacy to set boxes aside. No account: the
 * name and phone are asked here, with consent. They pay at the counter as usual;
 * an optional small deposit holds the boxes for 4 hours instead of 2.
 */
export function ReserveDialog({
  pharmacy,
  medicine,
  available,
  priceDzd,
  compact = false,
}: {
  pharmacy: { id: string; name: string };
  medicine: MedicineRow;
  /** Most boxes one reservation can hold right now (one batch, at most 5). 0 hides the button. */
  available: number;
  priceDzd: number | null;
  compact?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const guest = useGuest();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const max = Math.max(1, available);
  const gone = available <= 0;

  // Nothing to reserve: no button. An open form stays open (with a message) if the boxes go while it is being filled.
  if (gone && !open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      <Dialog.Trigger
        className={`inline-flex items-center gap-1.5 rounded-lg bg-green font-medium text-white transition-colors duration-150 hover:bg-green-700 ${compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm"}`}
      >
        <BellRing className="size-3.5" aria-hidden /> {t("res.button")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-overlay fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="cmd-panel surface fixed top-[6vh] left-1/2 z-50 max-h-[90vh] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold">{t("res.title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{t("res.desc", { name: pharmacy.name })}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t("common.close")} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-sm">
            <span>
              <span className="font-semibold">{medName(medicine)}</span> <span className="font-mono text-xs text-muted">{strengthText(medicine.strength)}</span>
            </span>
            {priceDzd !== null && <span className="font-mono text-muted nums">{t("common.perBox", { price: fmtPrice(priceDzd) })}</span>}
          </div>
          {medicine.is_prescription_only && <p className="mt-2 rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink">{t("res.rx")}</p>}
          {gone && (
            <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {t("res.goneError")}
            </p>
          )}

          <form
            noValidate
            className="mt-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const full_name = String(d.get("name") ?? "").trim();
              const phone = String(d.get("phone") ?? "");
              const quantity = Number(d.get("qty"));
              const withDeposit = d.get("deposit") === "on";
              if (full_name.length < 2) return setError(t("res.nameError"));
              if (!validPhone(phone)) return setError(t("common.phoneError"));
              if (gone) return setError(t("res.goneError"));
              if (Number.isInteger(quantity) && quantity > available && quantity <= 5) return setError(t("res.fewerLeft", { n: available }));
              if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) return setError(t("res.boxesError", { max }));
              if (d.get("consent") !== "on") return setError(t("consent.required"));
              setError(null);
              setBusy(true);
              let id: string;
              try {
                id = (await reserve({ pharmacy_id: pharmacy.id, medicine_id: medicine.id, quantity, full_name, phone, withDeposit })).id;
              } catch (err) {
                setBusy(false);
                const code = errorKey(err);
                return setError(code === "insufficient_stock" || code === "expired_batch" ? t("res.goneError") : writeErrorText(t, err));
              }
              if (!withDeposit) return router.push(`/reservation/${id}`);
              try {
                await startDepositCheckout(id);
              } catch {
                router.push(`/reservation/${id}`);
              }
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <label className="block">
                <span className="text-sm font-medium">{t("res.name")}</span>
                <input name="name" autoComplete="name" defaultValue={guest.full_name ?? ""} className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-green" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{t("res.boxes")}</span>
                <input name="qty" type="number" min={1} max={max} defaultValue={1} inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none focus:ring-2 focus:ring-green" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">{t("common.phone")}</span>
              <input name="phone" type="tel" autoComplete="tel" defaultValue={guest.phone?.replace(/^\+213/, "0") ?? ""} placeholder={t("common.phonePh")} dir="ltr" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-green" />
              <span className="mt-1 block text-xs text-muted">{t("res.phoneHint")}</span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ring-line has-[:checked]:bg-green-soft has-[:checked]:ring-green">
              <input name="deposit" type="checkbox" className="mt-0.5 size-4 accent-[var(--color-green)]" />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="size-4 text-green" aria-hidden /> {t("res.guarantee", { price: fmtPrice(DEPOSIT_DZD) })}
                </span>
                <span className="mt-0.5 block text-muted">{t("res.guaranteeBody", { long: 4, short: 2 })}</span>
              </span>
            </label>

            <ConsentField />

            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink">{t("common.cancel")}</Dialog.Close>
              <button type="submit" disabled={busy || gone} className="inline-flex h-10 items-center gap-2 rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("res.send")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
