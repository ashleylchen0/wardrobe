"use client";

import { useRouter } from "next/navigation";

/** Date arithmetic in UTC so a local timezone can't shift the day. */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (next: string) => router.push(`/log?date=${next}`);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => go(shift(date, -1))}
        aria-label="Previous day"
        className="microcap text-muted hover:text-ink cursor-pointer text-[11px]"
      >
        ←
      </button>

      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        aria-label="Date"
        className="border-ink border bg-transparent px-2 py-1.5 text-[13px] tabular-nums outline-none"
      />

      <button
        type="button"
        onClick={() => go(shift(date, 1))}
        disabled={date >= today}
        aria-label="Next day"
        className="microcap text-muted hover:text-ink cursor-pointer text-[11px] disabled:opacity-30"
      >
        →
      </button>

      {date !== today && (
        <button
          type="button"
          onClick={() => go(today)}
          className="microcap cursor-pointer text-[10px] underline underline-offset-4"
        >
          Today
        </button>
      )}
    </div>
  );
}
