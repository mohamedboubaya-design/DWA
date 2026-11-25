"use client";

import { RequireSession } from "../require-session";
import { StockManager } from "./stock-manager";

/* Client boundary for the pharmacist side: the session lives in the browser in this demo. */
export function Dashboard() {
  return <RequireSession>{(session) => <StockManager session={session} />}</RequireSession>;
}
