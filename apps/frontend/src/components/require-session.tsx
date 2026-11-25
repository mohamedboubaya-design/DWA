"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSession, type Session } from "@/lib/db/api";

/*
 * Renders children only for a signed-in pharmacist; everyone else goes to /login.
 * DEMO GUARD, NOT SECURITY: it reads a value from this browser's storage, which
 * anyone can edit. The backend must authorise every pharmacist request itself.
 * A missing, malformed or stale session is treated as signed out.
 */
export function RequireSession({ children }: { children: (session: Session) => ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
      </div>
    );
  }
  return children(session);
}
