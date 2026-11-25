"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { addBatch, errorKey, useTables, writeErrorText } from "@/lib/db/api";
import { medLabel } from "@/lib/format";
import { useT } from "@/lib/locale";

const field = "mt-1.5 h-11 w-full rounded-xl bg-paper px-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-green";

/*
 * Receive a delivery: one pharmacy_stock row per physical batch. batch_barcode
 * and expiry_date are required by the schema; price and the low-stock
 * threshold are per batch.
 */
export function AddBatchDialog({ pharmacyId, medicineId, trigger }: { pharmacyId: string; medicineId?: string; trigger?: React.ReactNode }) {
  const { t } = useT();
  const db = useTables();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meds = [...db.medicines].sort((a, b) => a.commercial_name.localeCompare(b.commercial_name));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      {trigger ? (
        <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      ) : (
        <Dialog.Trigger className="flex h-10 items-center gap-2 rounded-xl bg-green px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-green-700">
          <Plus className="size-4" aria-hidden /> {t("dash.add")}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-overlay fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="cmd-panel surface fixed top-[6vh] left-1/2 z-50 max-h-[90vh] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold">{t("add.title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{t("add.desc")}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t("common.close")} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form
            noValidate
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const qty = Number(d.get("qty"));
              const threshold = Number(d.get("threshold"));
              const priceRaw = String(d.get("price") ?? "").trim();
              const price = priceRaw === "" ? null : Number(priceRaw);
              const expiry = String(d.get("expiry") ?? "");
              const production = String(d.get("production") ?? "");
              const batch = String(d.get("batch") ?? "").trim();
              if (!batch) return setError(t("add.batchError"));
              if (!Number.isInteger(qty) || qty < 0) return setError(t("add.qtyError"));
              if (!expiry) return setError(t("add.expiryError"));
              if (expiry < today) return setError(t("add.expiredError"));
              if (production && production > expiry) return setError(t("add.productionError"));
              if (price !== null && !(price >= 0)) return setError(t("add.priceError"));
              if (!Number.isInteger(threshold) || threshold < 0) return setError(t("add.thresholdError"));
              try {
                await addBatch({
                  pharmacy_id: pharmacyId,
                  medicine_id: String(d.get("medicine")),
                  batch_barcode: batch,
                  production_date: production || null,
                  expiry_date: expiry,
                  total_quantity: qty,
                  price_dzd: price,
                  low_stock_threshold: threshold,
                });
                setOpen(false);
              } catch (err) {
                setError(errorKey(err) === "unique_violation" ? t("add.duplicate") : writeErrorText(t, err));
              }
            }}
          >
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">{t("add.medicine")}</span>
              <select name="medicine" defaultValue={medicineId} className={field}>
                {meds.map((m) => (
                  <option key={m.id} value={m.id}>
                    {medLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.batch")}</span>
              <input name="batch" dir="ltr" autoComplete="off" className={`${field} font-mono`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.boxes")}</span>
              <input name="qty" type="number" min={0} defaultValue={10} inputMode="numeric" className={`${field} font-mono`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.expiry")}</span>
              <input name="expiry" type="date" min={today} className={`${field} font-mono text-sm`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.production")}</span>
              <input name="production" type="date" max={today} className={`${field} font-mono text-sm`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.price")}</span>
              <input name="price" type="number" min={0} step="0.01" inputMode="decimal" placeholder="DA" className={`${field} font-mono`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("add.threshold")}</span>
              <input name="threshold" type="number" min={0} defaultValue={5} inputMode="numeric" className={`${field} font-mono`} />
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Dialog.Close className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink">{t("common.cancel")}</Dialog.Close>
              <button type="submit" className="h-10 rounded-xl bg-green px-4 text-sm font-medium text-white hover:bg-green-700">
                {t("add.submit")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
