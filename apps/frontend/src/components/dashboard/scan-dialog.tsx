"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Camera, Minus, Plus, ScanLine, X } from "lucide-react";
import { setBatchTotal, useTables } from "@/lib/db/api";
import { medName, strengthText } from "@/lib/format";
import { useT } from "@/lib/locale";
import { AddBatchDialog } from "./add-batch-dialog";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

/*
 * Scan a box to update stock: the camera reads the barcode (Chrome and Android
 * have a built-in reader), or the code can be typed. The box's EAN is
 * medicines.barcode_ean; its batches here can then be counted up or down, or a
 * new batch added.
 */
export function ScanDialog({ pharmacyId }: { pharmacyId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState<"off" | "on" | "unsupported" | "denied">("off");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const db = useTables();
  const med = code.trim() ? db.medicines.find((m) => m.barcode_ean === code.trim()) : undefined;
  const batches = med ? db.pharmacy_stock.filter((s) => s.pharmacy_id === pharmacyId && s.medicine_id === med.id).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)) : [];
  const example = db.medicines.find((m) => m.barcode_ean)?.barcode_ean ?? "";

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const start = async () => {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return setCamera("unsupported");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamera("on");
    } catch {
      setCamera("denied");
    }
  };

  // While the camera is on, look for a barcode a few times a second.
  useEffect(() => {
    if (camera !== "on" || !video.current || !stream.current || !window.BarcodeDetector) return;
    const v = video.current;
    v.srcObject = stream.current;
    void v.play();
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "data_matrix"] });
    let alive = true;
    const loop = async () => {
      if (!alive) return;
      try {
        const found = await detector.detect(v);
        if (found[0]) {
          setCode(found[0].rawValue);
          stop();
          setCamera("off");
          return;
        }
      } catch {}
      setTimeout(loop, 300);
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [camera]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          stop();
          setCamera("off");
          setCode("");
        }
      }}
    >
      <Dialog.Trigger className="flex h-10 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-medium ring-1 ring-line hover:ring-ink/30">
        <ScanLine className="size-4" aria-hidden /> {t("scan.button")}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-overlay fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="cmd-panel surface fixed top-[10vh] left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 rounded-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-semibold">{t("scan.button")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{t("scan.desc")}</Dialog.Description>
            </div>
            <Dialog.Close aria-label={t("common.close")} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {camera === "on" ? (
            <div className="relative mt-5 overflow-hidden rounded-xl bg-ink">
              <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-neon/80" aria-hidden />
            </div>
          ) : (
            <button type="button" onClick={start} className="mt-5 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl bg-paper text-sm font-medium ring-1 ring-line hover:ring-ink/30">
              <Camera className="size-5" aria-hidden />
              {t("scan.camera")}
            </button>
          )}
          {camera === "unsupported" && <p className="mt-2 text-xs text-muted">{t("scan.unsupported")}</p>}
          {camera === "denied" && <p className="mt-2 text-xs text-danger">{t("scan.denied")}</p>}

          <label className="mt-4 block">
            <span className="text-sm font-medium">{t("scan.code")}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder={example}
              dir="ltr"
              className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 font-mono ring-1 ring-line outline-none focus:ring-2 focus:ring-green"
            />
            <span className="mt-1 block text-xs text-muted">{t("scan.demoCodes", { code: example })}</span>
          </label>

          {code.trim() && !med && <p className="mt-4 rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber-ink">{t("scan.unknown")}</p>}
          {med && (
            <div className="mt-4 rounded-xl bg-green-soft p-4">
              <p className="font-semibold">
                {medName(med)} <span className="font-mono text-xs text-muted">{strengthText(med.strength)}</span>
              </p>
              {batches.length === 0 ? (
                <p className="mt-1 font-mono text-xs text-muted">{t("scan.notListed")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {batches.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 font-mono text-xs" dir="ltr">
                        {b.batch_barcode} · {b.expiry_date}
                      </span>
                      <span className="font-mono text-xs text-muted">{t("scan.onShelf", { n: b.total_quantity })}</span>
                      <button
                        type="button"
                        disabled={b.total_quantity <= b.reserved_quantity}
                        onClick={() => void setBatchTotal(b.id, b.total_quantity - 1)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface px-2.5 text-xs font-medium ring-1 ring-line disabled:opacity-40"
                      >
                        <Minus className="size-3.5" aria-hidden /> {t("scan.sold")}
                      </button>
                      <button type="button" onClick={() => void setBatchTotal(b.id, b.total_quantity + 1)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-green px-2.5 text-xs font-medium text-white hover:bg-green-700">
                        <Plus className="size-3.5" aria-hidden /> {t("scan.received")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <AddBatchDialog
                  pharmacyId={pharmacyId}
                  medicineId={med.id}
                  trigger={
                    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface px-2.5 text-xs font-medium ring-1 ring-line hover:ring-ink/30">
                      <Plus className="size-3.5" aria-hidden /> {t("scan.newBatch")}
                    </button>
                  }
                />
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
