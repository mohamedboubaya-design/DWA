"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { errorKey, normalizePhone, signUp, validEmail, validPhone, writeErrorText } from "@/lib/db/api";
import type { GeoPoint } from "@/lib/db/schema";
import { useT } from "@/lib/locale";
import { WILAYAS } from "@/lib/wilayas";
import { AuthField } from "./auth-field";
import { ConsentField } from "./consent-field";

const HOURS = /^(closed|\d{2}:\d{2}-\d{2}:\d{2})$/i;
const MAX_LICENCE_BYTES = 5 * 1024 * 1024;

/*
 * Pharmacist sign-up. Creates, in one go: the account (users, role pharmacist),
 * the licence check (pharmacist_verifications, pending until an admin reviews
 * it) and the pharmacy it owns (pharmacies.owner_id).
 */
export function SignupForm() {
  const { t } = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const get = (k: string) => String(d.get(k) ?? "").trim();
        const licence = d.get("licence");
        const hours = { mon_fri: get("mon_fri"), sat: get("sat"), sun: get("sun") };
        if (get("name").length < 2) return setError(t("signup.nameError"));
        if (!validEmail(get("email"))) return setError(t("login.emailError"));
        if (get("phone") && !validPhone(get("phone"))) return setError(t("common.phoneError"));
        if (get("password").length < 8) return setError(t("signup.passwordError"));
        if (get("password") !== get("confirm")) return setError(t("signup.matchError"));
        if (get("license").length < 3) return setError(t("signup.licenseError"));
        if (!(licence instanceof File) || licence.size === 0) return setError(t("signup.licenceFileError"));
        if (licence.size > MAX_LICENCE_BYTES) return setError(t("signup.licenceSizeError"));
        if (get("pharmacy").length < 2) return setError(t("signup.pharmacyError"));
        if (get("commune").length < 2 || get("address").length < 3) return setError(t("signup.addressError"));
        if (!Object.values(hours).every((h) => HOURS.test(h))) return setError(t("signup.hoursError"));
        if (d.get("consent") !== "on") return setError(t("consent.required"));
        setError(null);
        setPending(true);
        try {
          await signUp({
            full_name: get("name"),
            email: get("email"),
            phone: get("phone") ? normalizePhone(get("phone")) : null,
            password: get("password"),
            license_number: get("license"),
            license_file_name: licence.name,
            pharmacy: {
              name: get("pharmacy"),
              wilaya: get("wilaya"),
              commune: get("commune"),
              address: get("address"),
              phone: get("pharmacyPhone") || null,
              location,
              opening_hours: { mon_fri: hours.mon_fri.toLowerCase(), sat: hours.sat.toLowerCase(), sun: hours.sun.toLowerCase() },
            },
          });
        } catch (err) {
          setPending(false);
          const code = errorKey(err);
          return setError(code === "email_taken" ? t("signup.taken") : code === "unique_violation" ? t("signup.licenseTaken") : writeErrorText(t, err));
        }
        router.push("/dashboard");
      }}
      className="surface rounded-card p-6 text-ink sm:p-8"
    >
      <h2 className="font-display text-xl font-semibold">{t("signup.form")}</h2>

      <fieldset className="mt-6 space-y-4">
        <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{t("signup.you")}</legend>
        <AuthField label={t("signup.name")} name="name" autoComplete="name" />
        <AuthField label={t("login.email")} dir="ltr" name="email" type="email" autoComplete="email" placeholder="contact@pharmacie-garidi.dz" />
        <AuthField label={t("signup.phoneOptional")} dir="ltr" name="phone" type="tel" autoComplete="tel" placeholder={t("common.phonePh")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField label={t("login.password")} name="password" type="password" autoComplete="new-password" />
          <AuthField label={t("signup.confirm")} name="confirm" type="password" autoComplete="new-password" />
        </div>
        <AuthField label={t("signup.license")} name="license" dir="ltr" autoComplete="off" placeholder="ALG-16-1201" />
        <label className="block">
          <span className="text-sm font-medium">{t("signup.licenceFile")}</span>
          <input name="licence" type="file" accept="application/pdf,image/*" className="mt-1.5 block w-full text-sm file:me-3 file:h-10 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:text-sm file:font-medium file:ring-1 file:ring-line" />
        </label>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{t("signup.yourPharmacy")}</legend>
        <AuthField label={t("signup.pharmacy")} name="pharmacy" autoComplete="organization" placeholder="Pharmacie Garidi" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">{t("signup.wilaya")}</span>
            <select name="wilaya" defaultValue="Alger" className="mt-1.5 h-11 w-full rounded-xl bg-paper px-3 ring-1 ring-line outline-none focus:ring-2 focus:ring-green">
              {WILAYAS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <AuthField label={t("signup.commune")} name="commune" autoComplete="address-level2" />
        </div>
        <AuthField label={t("signup.address")} name="address" autoComplete="street-address" />
        <AuthField label={t("signup.pharmacyPhone")} dir="ltr" name="pharmacyPhone" type="tel" placeholder="+213 23 70 38 91" />
        <div>
          <button
            type="button"
            onClick={() => {
              if (!("geolocation" in navigator)) return;
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setLocation({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
                  setLocating(false);
                },
                () => setLocating(false),
                { timeout: 8000 },
              );
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium ring-1 ring-line hover:bg-paper"
          >
            {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
            {location ? t("signup.located", { lat: location.lat, lng: location.lng }) : t("signup.locate")}
          </button>
          <p className="mt-1 text-xs text-muted">{t("signup.locateHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <AuthField label={t("signup.monFri")} name="mon_fri" dir="ltr" defaultValue="08:00-20:00" />
          <AuthField label={t("signup.sat")} name="sat" dir="ltr" defaultValue="08:00-18:00" />
          <AuthField label={t("signup.sun")} name="sun" dir="ltr" defaultValue="closed" />
        </div>
        <p className="text-xs text-muted">{t("signup.hoursHint")}</p>
      </fieldset>

      <div className="mt-6">
        <ConsentField />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-green font-medium text-white transition-colors duration-150 hover:bg-green-700 disabled:opacity-70"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? t("signup.creating") : t("signup.create")}
      </button>
      <p className="mt-5 text-center text-sm">
        {t("signup.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-green hover:underline">
          {t("signup.signIn")}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-muted">{t("signup.demo")}</p>
    </form>
  );
}
