"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, FlaskConical, Loader2, Lock } from "lucide-react";
import { settleDemoPayment } from "@/lib/db/api";
import { fmtPrice } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/locale";
import { isUuid } from "@/lib/uuid";

const LABEL: Record<string, MessageKey> = { reservation_deposit: "pay.deposit" };

/*
 * Stand-in for the hosted payment page while no Chargily key is configured.
 * Clearly marked as a test: it takes no card data and moves no money. Paying
 * here settles the payments row the way the Chargily webhook will
 * (webhook_verified stays false, so the UI still says "not verified").
 */
export function DemoPay({ purpose, reservationId, paymentId, amount }: { purpose: string; reservationId: string; paymentId: string; amount: number }) {
  const { t } = useT();
  const router = useRouter();
  const [method, setMethod] = useState<"edahabia" | "cib">("edahabia");
  const [busy, setBusy] = useState(false);

  const valid = !!LABEL[purpose] && amount > 0 && isUuid(reservationId) && isUuid(paymentId);
  const back = (outcome: "returned" | "cancelled") => router.push(`/reservation/${reservationId}?checkout=${outcome}`);

  return (
    <section className="dusk-band min-h-[80vh]">
      <div className="mx-auto max-w-md px-4 pt-28 pb-20 sm:px-6">
        <div className="flex items-start gap-3 rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber-ink">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>{t("pay.test")}</strong> {t("pay.testBody")}
          </p>
        </div>

        <div className="surface mt-5 rounded-card p-6 text-ink">
          {!valid ? (
            <h1 className="text-muted">{t("pay.incomplete")}</h1>
          ) : (
            <>
              <h1 className="text-sm text-muted">{t(LABEL[purpose])}</h1>
              <p className="mt-1 font-mono text-4xl font-medium nums">{fmtPrice(amount)}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted">{t("pay.ref", { ref: paymentId })}</p>

              <fieldset className="mt-6">
                <legend className="text-sm font-medium">{t("pay.with")}</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["edahabia", "cib"] as const).map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-3 text-sm ring-1 ring-line has-[:checked]:bg-green-soft has-[:checked]:ring-2 has-[:checked]:ring-green has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink"
                    >
                      <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                      <CreditCard className="size-4" aria-hidden />
                      {m === "edahabia" ? "Edahabia" : "CIB"}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await settleDemoPayment(paymentId, true);
                  } catch {}
                  setTimeout(() => back("returned"), 800);
                }}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-green font-medium text-white hover:bg-green-700 disabled:opacity-70"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                {busy ? t("pay.processing") : t("pay.pay", { price: fmtPrice(amount) })}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await settleDemoPayment(paymentId, false);
                  } catch {}
                  back("cancelled");
                }}
                className="mt-3 w-full text-center text-sm text-muted hover:text-ink"
              >
                {t("common.cancel")}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
