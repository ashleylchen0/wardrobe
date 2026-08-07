import Link from "next/link";
import { notFound } from "next/navigation";
import { CostPerWear } from "@/components/cost-per-wear";
import { ItemPhoto } from "@/components/item-photo";
import { fmtDate, money } from "@/lib/format";
import { getItem } from "@/lib/queries";
import { setArchived } from "../actions";
import { PhotoUpload } from "./photo-upload";

/** Three years of dates is a wall; the recent ones plus a count carry it. */
const SHOWN_DATES = 24;

/** Tolerates malformed URLs saved before validation existed. */
function linkLabel(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : url;
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getItem(id);
  if (!data) notFound();

  const { item, timesWorn, costPerWearCents, firstWorn, lastWorn, history } = data;
  const archived = item.status === "archived";

  const acquired =
    item.acquiredPrecision === "day"
      ? fmtDate(item.acquiredOn)
      : item.acquiredPrecision === "year"
        ? item.acquiredOn?.slice(0, 4)
        : "Unknown";

  const wearDates = history.map((w) => w.wornOn);
  const byYear = new Map<string, number>();
  for (const d of wearDates) {
    byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) ?? 0) + 1);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxYear = Math.max(1, ...years.map(([, n]) => n));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link href="/" className="microcap text-muted hover:text-ink text-[10px]">
        ← Closet
      </Link>

      <div className="mt-4 grid gap-10 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <ItemPhoto
            name={item.name}
            imagePath={item.imagePath}
            category={item.category}
            className={`aspect-[3/4] ${archived ? "opacity-55 grayscale" : ""}`}
            emojiClassName="text-7xl"
            eager
          />
          <PhotoUpload itemId={item.id} hasPhoto={!!item.imagePath} />
        </div>

        <div>
          <div className="microcap text-muted text-[10px]">
            {item.brand ?? "No brand"} · {item.category}
            {archived && " · Archived"}
          </div>
          <h1 className="microcap mt-1 text-[20px] leading-tight font-bold">
            {item.name}
          </h1>

          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {item.tags.map((tag) => (
                <span key={tag} className="microcap text-muted text-[9px]">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* The two figures the app exists to produce, given the space to be read
              across the room. */}
          <div className="border-ink mt-5 flex items-baseline gap-10 border-t pt-4">
            <div>
              <CostPerWear
                costPerWearCents={costPerWearCents}
                timesWorn={timesWorn}
                costCents={item.costCents}
                size="lg"
              />
              <div className="microcap text-muted mt-1 text-[8px]">
                Cost per wear
              </div>
            </div>
            <div>
              <div className="text-4xl tabular-nums">{timesWorn}</div>
              <div className="microcap text-muted mt-1 text-[8px]">
                {timesWorn === 1 ? "Wear" : "Wears"}
                {firstWorn && ` since ${fmtDate(firstWorn)}`}
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[12px]">
            <dt className="microcap text-muted text-[9px] leading-[1.9]">Cost</dt>
            <dd className="tabular-nums">
              {item.costCents === null
                ? "Unrecorded"
                : item.costCents === 0
                  ? "$0.00 — gift"
                  : money(item.costCents)}
            </dd>

            <dt className="microcap text-muted text-[9px] leading-[1.9]">
              Acquired
            </dt>
            <dd className="tabular-nums">{acquired ?? "Unknown"}</dd>

            <dt className="microcap text-muted text-[9px] leading-[1.9]">
              Last worn
            </dt>
            <dd className="tabular-nums">{fmtDate(lastWorn)}</dd>

            {item.productUrl && (
              <>
                <dt className="microcap text-muted text-[9px] leading-[1.9]">
                  Product page
                </dt>
                <dd>
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:no-underline"
                  >
                    {linkLabel(item.productUrl)} ↗
                  </a>
                </dd>
              </>
            )}

            {item.notes && (
              <>
                <dt className="microcap text-muted text-[9px] leading-[1.9]">
                  Notes
                </dt>
                <dd>{item.notes}</dd>
              </>
            )}
          </dl>

          {archived && (
            <p className="microcap text-muted mt-5 text-[10px] leading-relaxed">
              No longer in the closet
              {item.archivedOn && <> — archived {fmtDate(item.archivedOn)}</>}.
              Its wear history still counts toward cost per wear.
            </p>
          )}

          {item.needsReview && (
            <div className="border-cpw-bad/40 text-cpw-bad mt-5 border-l-2 pl-3 text-[11px]">
              Imported with missing or conflicting data.
              {item.importConflicts != null && (
                <pre className="text-muted mt-1.5 overflow-x-auto text-[10px]">
                  {JSON.stringify(item.importConflicts, null, 1)}
                </pre>
              )}
            </div>
          )}

          {years.length > 0 && (
            <div className="mt-8">
              <h2 className="microcap border-hair border-b pb-1.5 text-[10px] font-bold">
                By year
              </h2>
              <div className="mt-3 space-y-1.5">
                {years.map(([year, n]) => (
                  <div
                    key={year}
                    className="grid grid-cols-[38px_1fr_34px] items-center gap-3 text-[11px] tabular-nums"
                  >
                    <span className="text-muted">{year}</span>
                    <span
                      className="bg-ink h-2"
                      style={{ width: `${(n / maxYear) * 100}%` }}
                    />
                    <span className="text-right">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wearDates.length > 0 && (
            <div className="mt-8">
              <h2 className="microcap border-hair border-b pb-1.5 text-[10px] font-bold">
                Wear history · {wearDates.length}
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {wearDates.slice(0, SHOWN_DATES).map((d) => (
                  <span
                    key={d}
                    className="microcap border-hair text-muted border px-1.5 py-0.5 text-[9px] tabular-nums"
                  >
                    {fmtDate(d)}
                  </span>
                ))}
                {wearDates.length > SHOWN_DATES && (
                  <span className="microcap text-muted px-1 py-0.5 text-[9px]">
                    + {wearDates.length - SHOWN_DATES} earlier
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="border-hair mt-10 border-t pt-3">
            <ArchiveButton id={item.id} archived={archived} />
          </div>
        </div>
      </div>
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
        className="microcap text-muted hover:text-ink cursor-pointer text-[9px] underline"
      >
        {archived ? "Restore to closet" : "Archive (sold / donated)"}
      </button>
    </form>
  );
}
