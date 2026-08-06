import Link from "next/link";
import {
  getOutfitForDate,
  getPickableItems,
  getRecentLoggedDates,
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
    weekday: "long",
    month: "long",
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

  const [items, wornItemIds, recent] = await Promise.all([
    getPickableItems(date),
    getOutfitForDate(date),
    getRecentLoggedDates(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h1 className="font-serif text-3xl tracking-tight">
              {date === today ? "Today" : prettyDate(date)}
            </h1>
            {date === today && (
              <p className="text-muted text-sm tabular-nums">{prettyDate(date)}</p>
            )}
          </div>
          <DateNav date={date} today={today} />
        </header>

        <OutfitPicker date={date} items={items} wornItemIds={wornItemIds} />

        {recent.length > 0 && (
          <section className="border-hair flex flex-col gap-3 border-t pt-5">
            <h2 className="eyebrow">Recently logged</h2>
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r.wornOn}>
                  <Link
                    href={`/log?date=${r.wornOn}`}
                    className={`border-hair hover:border-ink rounded-full border px-3 py-1 text-xs tabular-nums transition-colors ${
                      r.wornOn === date ? "bg-ink text-paper border-ink" : ""
                    }`}
                  >
                    {r.wornOn} · {r.count}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
