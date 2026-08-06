/**
 * Wear dates grouped by year. Three years of daily rows is unreadable as a
 * list, but as year bands with day chips it stays scannable and the shape of
 * a heavy or light year is visible at a glance.
 */
export function WearHistory({ dates }: { dates: string[] }) {
  if (dates.length === 0) {
    return <p className="text-muted mt-3 text-sm">Never worn.</p>;
  }

  const byYear = new Map<string, string[]>();
  for (const date of dates) {
    const year = date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), date]);
  }

  return (
    <div className="mt-4 flex flex-col gap-5">
      {[...byYear.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([year, days]) => (
          <div key={year} className="flex flex-col gap-2">
            <p className="flex items-baseline gap-2">
              <span className="font-serif text-lg tabular-nums">{year}</span>
              <span className="eyebrow">
                {days.length} {days.length === 1 ? "wear" : "wears"}
              </span>
            </p>
            <div className="flex flex-wrap gap-1">
              {days.map((day) => (
                <span
                  key={day}
                  className="bg-tile text-muted rounded px-1.5 py-0.5 text-xs tabular-nums"
                >
                  {day.slice(5)}
                </span>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
