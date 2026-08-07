import Link from "next/link";
import { ItemPhoto } from "@/components/item-photo";
import {
  getLoggedYears,
  getMonthCoverage,
  getMonthlyTotals,
} from "@/lib/queries";

export const metadata = { title: "Calendar · Wardrobe" };

const MONTH_RE = /^\d{4}-\d{2}$/;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A cell fits nine thumbnails; past that the count carries it. */
const MAX_THUMBS = 9;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Monday-first index: Mon = 0 … Sun = 6. */
function mondayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(year: number, month: number, by: number) {
  const d = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: raw } = await searchParams;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const [year, month] =
    raw && MONTH_RE.test(raw)
      ? raw.split("-").map(Number)
      : [today.getUTCFullYear(), today.getUTCMonth() + 1];

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const from = iso(year, month, 1);
  const to = iso(year, month, daysInMonth);

  const [coverage, monthlyTotals, years] = await Promise.all([
    getMonthCoverage(from, to),
    getMonthlyTotals(year),
    getLoggedYears(),
  ]);

  const totalsByMonth = new Map(monthlyTotals.map((t) => [t.month, t]));
  const thisMonth = totalsByMonth.get(`${year}-${pad(month)}`);

  // Only count days that have actually happened — an unlived day isn't a gap.
  const elapsed = Math.min(
    daysInMonth,
    year === today.getUTCFullYear() && month === today.getUTCMonth() + 1
      ? today.getUTCDate()
      : daysInMonth,
  );
  const logged = thisMonth?.days ?? 0;
  const missed = Math.max(0, elapsed - logged);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const leadingBlanks = mondayIndex(year, month, 1);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        <div className="border-ink flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b pb-2">
          <h1 className="microcap text-[12px] font-bold">
            {monthLabel(year, month)}
          </h1>
          <div className="flex items-baseline gap-4">
            <span className="microcap text-muted text-[10px] tabular-nums">
              {logged} logged{missed > 0 && <> · {missed} missed</>}
            </span>
            <Link
              href={`/calendar?month=${prev.year}-${pad(prev.month)}`}
              aria-label="Previous month"
              className="microcap text-muted hover:text-ink text-[11px]"
            >
              ←
            </Link>
            <Link
              href={`/calendar?month=${next.year}-${pad(next.month)}`}
              aria-label="Next month"
              className="microcap text-muted hover:text-ink text-[11px]"
            >
              →
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-4">
          {years.map((y) => (
            <Link
              key={y}
              href={`/calendar?month=${y}-${pad(y === today.getUTCFullYear() ? today.getUTCMonth() + 1 : 1)}`}
              className={`microcap pb-0.5 text-[10px] tabular-nums ${
                y === year
                  ? "border-ink border-b font-bold"
                  : "text-muted hover:text-ink"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        {/* Months as navigation, not as a heat map: a density ramp built from a
            single ink value asks the eye to rank greys, which it is bad at. The
            per-month count is in the title for anyone who wants the number. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const days = totalsByMonth.get(`${year}-${pad(m)}`)?.days ?? 0;
            return (
              <Link
                key={m}
                href={`/calendar?month=${year}-${pad(m)}`}
                title={`${monthLabel(year, m)} — ${days} logged`}
                className={`microcap pb-0.5 text-[10px] tabular-nums ${
                  m === month
                    ? "border-ink border-b font-bold"
                    : days === 0
                      ? "text-muted opacity-40"
                      : "text-muted hover:text-ink"
                }`}
              >
                {m}
              </Link>
            );
          })}
        </div>

        <div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {DOW.map((d) => (
              <span
                key={d}
                className="microcap text-muted text-center text-[8px]"
              >
                {d.slice(0, 1)}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const date = iso(year, month, day);
              const entry = coverage.get(date);
              const count = entry?.count ?? 0;
              const future = date > todayIso;
              const isToday = date === todayIso;
              const thumbs = entry?.entries.slice(0, MAX_THUMBS) ?? [];

              return (
                <Link
                  key={date}
                  href={`/log?date=${date}`}
                  aria-label={`${date}, ${count} items logged`}
                  title={
                    count > 0
                      ? entry!.entries.map((e) => e.name).join(" · ")
                      : undefined
                  }
                  className={`flex aspect-square flex-col gap-1 border p-1 ${
                    future
                      ? "border-hair/60 pointer-events-none opacity-40"
                      : count > 0
                        ? "border-hair hover:border-ink"
                        : "border-hair border-dashed hover:border-ink"
                  } ${isToday ? "ring-ink ring-1" : ""}`}
                >
                  <span className="microcap text-muted text-[8px] tabular-nums">
                    {day}
                  </span>

                  {count > 0 && (
                    <div className="mt-auto grid grid-cols-3 gap-[2px]">
                      {thumbs.map((e) => (
                        <ItemPhoto
                          key={e.itemId}
                          name={e.name}
                          imagePath={e.imagePath}
                          category={e.category}
                          className="aspect-square"
                          emojiClassName="text-[10px]"
                        />
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="microcap text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-[9px]">
          <span>One thumbnail per piece worn — the item&rsquo;s photo once it has one.</span>
          <span className="flex items-center gap-1.5">
            <i className="border-hair size-2.5 border border-dashed" /> nothing
            logged
          </span>
          <span>Tap any day to log it.</span>
        </div>
      </div>
    </main>
  );
}
