"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import { signIn, validEmail } from "@/lib/db/api";
import { useT } from "@/lib/locale";
import { AuthField } from "./auth-field";

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const email = String(data.get("email") ?? "");
        const password = String(data.get("password") ?? "");
        if (!validEmail(email)) return setError(t("login.emailError"));
        if (password.length < 6) return setError(t("login.passwordError"));
        setError(null);
        setPending(true);
        try {
          await signIn(email, password);
        } catch {
          setPending(false);
          return setError(t("login.wrong"));
        }
        router.push("/dashboard");
      }}
      className="surface rounded-card p-6 text-ink sm:p-8"
    >
      <h2 className="font-display text-xl font-semibold">{t("login.form")}</h2>
      <div className="mt-6 space-y-4">
        <AuthField label={t("login.email")} dir="ltr" name="email" type="email" autoComplete="email" placeholder="contact@pharmacie-garidi.dz" />
        <AuthField label={t("login.password")} name="password" type="password" autoComplete="current-password" />
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
        {pending ? t("login.signing") : t("login.signIn")}
      </button>
      <p className="mt-5 text-center text-sm">
        {t("login.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-green hover:underline">
          {t("login.create")}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-muted">{t("login.demo", { email: "garidi@demo.dwa.dz", password: DEMO_PASSWORD })}</p>
    </form>
  );
}
