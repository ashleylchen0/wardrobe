import Link from "next/link";
import {
  getOutfitForDate,
  getPickableItems,
  getRecentDays,
} from "@/lib/queries";
import { DateNav } from "./date-nav";
import { OutfitPicker } from "./outfit-picker";

export const metadata = { title: "Log an outfit · Wardrobe" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: raw } = await searchParams;
  const today = todayISO();
  const date = raw && DATE_RE.test(raw) ? raw : today;

  const [items, wornItemIds, recentDays] = await Promise.all([
    getPickableItems(date),
    getOutfitForDate(date),
    getRecentDays(7),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <h1 className="microcap border-ink flex items-baseline justify-between gap-4 border-b pb-2 text-[12px] font-bold">
            Log an outfit
            <span className="text-muted font-normal">
              {date === today ? "Today" : prettyDate(date)}
            </span>
          </h1>

          <div className="mt-4 flex flex-col gap-5">
            <DateNav date={date} today={today} />
            <OutfitPicker date={date} items={items} wornItemIds={wornItemIds} />
          </div>
        </div>

        <aside>
          <h2 className="microcap border-hair text-muted border-b pb-2 text-[10px] font-bold">
            Recent days
          </h2>
          <ul className="mt-3 space-y-4">
            {recentDays.map((day) => (
              <li key={day.date} className="text-[11px] leading-relaxed">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="microcap font-bold">
                    {prettyDate(day.date)}
                  </span>
                  <Link
                    href={`/log?date=${day.date}`}
                    className="microcap text-muted hover:text-ink text-[9px]"
                  >
                    {day.date === date ? "Editing" : "Edit"}
                  </Link>
                </div>
                <div className="text-muted">
                  {day.entries.map((e, i) => (
                    <span key={e.itemId}>
                      <Link
                        href={`/items/${e.itemId}`}
                        className="hover:text-ink hover:underline"
                      >
                        {e.name}
                      </Link>
                      {i < day.entries.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </div>
              </li>
            ))}
            {recentDays.length === 0 && (
              <li className="microcap text-muted text-[10px]">
                No outfits logged yet.
              </li>
            )}
          </ul>
        </aside>
      </div>
    </main>
  );
}
