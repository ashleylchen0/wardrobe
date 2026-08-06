import Link from "next/link";
import { notFound } from "next/navigation";
import { money, moneyFromNumeric } from "@/lib/format";
import { getItem } from "@/lib/queries";
import { setArchived } from "../actions";
import { PhotoUpload } from "./photo-upload";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getItem(id);
  if (!data) notFound();

  const { item, timesWorn, costPerWearCents, firstWorn, lastWorn, history } = data;
  const cost = money(item.costCents);
  const cpw = moneyFromNumeric(costPerWearCents);

  const acquired =
    item.acquiredPrecision === "day"
      ? item.acquiredOn
      : item.acquiredPrecision === "year"
        ? item.acquiredOn?.slice(0, 4)
        : "unknown";

  // Group wear dates by year so three years of history stays scannable.
  const byYear = new Map<string, string[]>();
  for (const w of history) {
    const y = w.wornOn.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), w.wornOn]);
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <Link
        href="/"
        className="text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        ← Closet
      </Link>

      <div className="mt-5 grid gap-8 sm:grid-cols-[minmax(0,18rem)_1fr]">
        <div>
          <div className="aspect-[3/4] overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
            {item.imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element -- private blob, proxied
              <img
                src={`/api/photo/${item.imagePath}`}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                No photo yet
              </div>
            )}
          </div>
          <PhotoUpload itemId={item.id} hasPhoto={!!item.imagePath} />
        </div>

        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
              <p className="mt-1 text-stone-500 dark:text-stone-400">
                {item.brand ?? "No brand recorded"} ·{" "}
                <span className="capitalize">{item.category}</span>
                {item.tags.length > 0 && <> · {item.tags.join(", ")}</>}
              </p>
            </div>
            <ArchiveButton id={item.id} archived={item.status === "archived"} />
          </div>

          {item.status === "archived" && (
            <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              No longer in your closet
              {item.archivedOn && <> — archived {item.archivedOn}</>}. Its wear
              history still counts toward cost per wear.
            </p>
          )}

          {item.needsReview && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
              Imported with missing or conflicting data.
              {item.importConflicts != null && (
                <pre className="mt-1 overflow-x-auto text-xs opacity-80">
                  {JSON.stringify(item.importConflicts, null, 1)}
                </pre>
              )}
            </div>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat label="Times worn" value={String(timesWorn)} />
            <Stat label="Cost per wear" value={cpw ?? "—"} />
            <Stat label="Cost" value={cost ?? "unrecorded"} />
            <Stat label="Acquired" value={acquired ?? "unknown"} />
          </dl>

          {timesWorn > 0 && (
            <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
              First worn {firstWorn} · last worn {lastWorn}
            </p>
          )}

          {item.notes && (
            <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
              {item.notes}
            </p>
          )}

          {item.productUrl && (
            <a
              href={item.productUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm underline underline-offset-4"
            >
              Original product page ↗
            </a>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Wear history
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Never worn.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {[...byYear.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([year, dates]) => (
                <div key={year}>
                  <p className="text-sm font-medium">
                    {year}{" "}
                    <span className="font-normal text-stone-500">
                      · {dates.length} {dates.length === 1 ? "wear" : "wears"}
                    </span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {dates.map((d) => (
                      <span
                        key={d}
                        className="rounded bg-stone-100 px-1.5 py-0.5 text-xs tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                      >
                        {d.slice(5)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  async function toggle() {
    "use server";
    await setArchived(id, !archived);
  }

  return (
    <form action={toggle}>
      <button
        type="submit"
        className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
      >
        {archived ? "Move back to closet" : "Archive"}
      </button>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
