import { getOutfitForDate, getPickableItems } from "@/lib/queries";
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

  const [items, wornItemIds] = await Promise.all([
    getPickableItems(date),
    getOutfitForDate(date),
  ]);

  // One column of type, the width of the picker's two columns. The Recent days
  // rail used to sit on the right; the day nav above already walks the week,
  // and the space is better spent on the outfit itself.
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
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
    </main>
  );
}
