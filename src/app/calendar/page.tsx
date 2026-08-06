import Link from "next/link";
import {
  getLoggedYears,
  getMonthCoverage,
  getMonthlyTotals,
} from "@/lib/queries";

export const metadata = { title: "Calendar · Wardrobe" };

const MONTH_RE = /^\d{4}-\d{2}$/;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h1 className="font-serif text-3xl tracking-tight">
              {monthLabel(year, month)}
            </h1>
            <p className="text-muted text-sm tabular-nums">
              {logged} logged
              {missed > 0 && <> · {missed} missed</>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/calendar?month=${prev.year}-${pad(prev.month)}`}
              aria-label="Previous month"
              className="border-hair hover:border-ink rounded-full border px-3 py-1.5 text-sm transition-colors"
            >
              ←
            </Link>
            <Link
              href={`/calendar?month=${next.year}-${pad(next.month)}`}
              aria-label="Next month"
              className="border-hair hover:border-ink rounded-full border px-3 py-1.5 text-sm transition-colors"
            >
              →
            </Link>
            <div className="ml-2 flex flex-wrap gap-1.5">
              {years.map((y) => (
                <Link
                  key={y}
                  href={`/calendar?month=${y}-${pad(y === today.getUTCFullYear() ? today.getUTCMonth() + 1 : 1)}`}
                  className={`rounded-full px-2.5 py-1 text-xs tabular-nums transition-colors ${
                    y === year
                      ? "bg-ink text-paper"
                      : "border-hair text-muted hover:border-ink border"
                  }`}
                >
                  {y}
                </Link>
              ))}
            </div>
          </div>

          {/* Month strip for the selected year — the whole year's shape at a glance. */}
          <div className="flex gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const t = totalsByMonth.get(`${year}-${pad(m)}`);
              const days = t?.days ?? 0;
              const inMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
              const ratio = days / inMonth;
              return (
                <Link
                  key={m}
                  href={`/calendar?month=${year}-${pad(m)}`}
                  title={`${monthLabel(year, m)} — ${days} logged`}
                  className="group flex flex-1 flex-col gap-1"
                >
                  <span
                    className={`block h-1.5 rounded-full ${m === month ? "ring-ink ring-1 ring-offset-1" : ""}`}
                    style={{
                      background:
                        ratio === 0
                          ? "var(--color-hair)"
                          : `color-mix(in srgb, var(--color-sage) ${Math.round(25 + ratio * 75)}%, var(--color-tile))`,
                    }}
                  />
                  <span
                    className={`text-center text-[10px] tabular-nums ${m === month ? "text-ink" : "text-muted"}`}
                  >
                    {m}
                  </span>
                </Link>
              );
            })}
          </div>
        </header>

        <div>
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {DOW.map((d) => (
              <span key={d} className="eyebrow text-center">
                {d.slice(0, 1)}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const date = iso(year, month, day);
              const entry = coverage.get(date);
              const count = entry?.count ?? 0;
              const future = date > todayIso;
              const isToday = date === todayIso;

              return (
                <Link
                  key={date}
                  href={`/log?date=${date}`}
                  aria-label={`${date}, ${count} items logged`}
                  className={`flex aspect-square flex-col rounded-xl border p-1.5 transition-colors ${
                    future
                      ? "border-hair/60 pointer-events-none opacity-40"
                      : count > 0
                        ? "border-hair hover:border-sage bg-card"
                        : "border-cpw-bad/35 hover:border-cpw-bad border-dashed"
                  } ${isToday ? "ring-ink ring-1" : ""}`}
                >
                  <span
                    className={`text-[11px] tabular-nums ${
                      count === 0 && !future ? "text-cpw-bad" : "text-muted"
                    }`}
                  >
                    {day}
                  </span>

                  {count > 0 && (
                    <span className="mt-auto flex flex-wrap gap-[3px]">
                      {Array.from({ length: Math.min(count, 9) }, (_, i) => (
                        <i
                          key={i}
                          className="bg-sage block size-[5px] rounded-full opacity-80"
                        />
                      ))}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="text-muted flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5">
            <i className="bg-sage size-2 rounded-full" /> one dot per item worn
          </span>
          <span className="flex items-center gap-1.5">
            <i className="border-cpw-bad/60 size-2.5 rounded-[3px] border border-dashed" />{" "}
            nothing logged
          </span>
          <span>Tap any day to log it.</span>
        </div>
      </div>
    </main>
  );
}
