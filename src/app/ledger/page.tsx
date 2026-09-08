import { getLedgerItems } from "@/lib/queries";
import { Ledger } from "./ledger";

export const metadata = { title: "Ledger · Wardrobe" };

/**
 * The scope-and-figure explorer. Where the stats page answers a fixed set of
 * questions about the active closet, this one hands the scope over: pick the
 * items, pick the window the wears are counted in, pick which figures to show.
 *
 * The whole catalogue is handed to the client in one payload — 235 items and
 * their wear dates is well under a hundred kilobytes — so changing a filter
 * recomputes locally instead of making a round trip per keystroke.
 */
export default async function LedgerPage() {
  const items = await getLedgerItems();
  return <Ledger items={items} />;
}
