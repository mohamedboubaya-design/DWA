"use client";

import { useT } from "@/lib/locale";

/*
 * Consent to store a guest's name and phone (Algerian personal data law 18-07).
 * Recorded as users.law_18_07_consent_at. The form checks the box is ticked.
 */
export function ConsentField({ name = "consent" }: { name?: string }) {
  const { t } = useT();
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted">
      <input name={name} type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-[var(--color-green)]" />
      <span>{t("consent.label")}</span>
    </label>
  );
}
