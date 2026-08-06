import Link from "next/link";
import { notFound } from "next/navigation";
import { CostPerWearBar } from "@/components/cost-per-wear";
import { ItemPhoto } from "@/components/item-photo";
import { WearHistory } from "@/components/wear-history";
import { money } from "@/lib/format";
import { getItem } from "@/lib/queries";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getItem(id);
  if (!data) notFound();

  const { item, timesWorn, costPerWearCents, firstWorn, lastWorn, history } = data;

  const acquired =
    item.acquiredPrecision === "day"
      ? item.acquiredOn
      : item.acquiredPrecision === "year"
        ? item.acquiredOn?.slice(0, 4)
        : "Unknown";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link href="/" className="eyebrow hover:text-ink transition-colors">
        ← Closet
      </Link>

      <div className="mt-6 grid gap-10 sm:grid-cols-[minmax(0,19rem)_1fr]">
        <ItemPhoto
          name={item.name}
          imagePath={item.imagePath}
          category={item.category}
          className="aspect-[4/5] rounded-2xl"
          garmentClassName="h-[72%] w-[62%]"
          eager
        />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-serif text-3xl leading-tight tracking-tight">
              {item.name}
            </h1>
            <p className="text-muted text-sm">
              {item.brand ?? "No brand recorded"} ·{" "}
              <span className="capitalize">{item.category}</span>
            </p>
            {item.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border-hair text-muted rounded-full border px-2.5 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {item.needsReview && (
            <div className="border-cpw-bad/30 bg-cpw-bad/5 text-cpw-bad rounded-xl border px-4 py-3 text-sm">
              Imported with missing or conflicting data.
              {item.importConflicts != null && (
                <pre className="text-ink/70 mt-2 overflow-x-auto text-xs">
                  {JSON.stringify(item.importConflicts, null, 1)}
                </pre>
              )}
            </div>
          )}

          {/* Cost per wear is the number this whole app exists to produce, so it
              gets its own block rather than a slot in the stat row. */}
          <div className="border-hair flex flex-col gap-2.5 rounded-2xl border bg-card px-5 py-4">
            <p className="eyebrow">Cost per wear</p>
            <CostPerWearBar
              costPerWearCents={costPerWearCents}
              timesWorn={timesWorn}
              costCents={item.costCents}
              size="lg"
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Stat label="Times worn" value={String(timesWorn)} />
            <Stat label="Cost" value={money(item.costCents) ?? "Unrecorded"} />
            <Stat label="Acquired" value={acquired ?? "Unknown"} />
          </dl>

          {timesWorn > 0 && (
            <p className="text-muted text-sm tabular-nums">
              First worn {firstWorn} · last worn {lastWorn}
            </p>
          )}

          {item.notes && (
            <p className="bg-tile rounded-xl px-4 py-3 text-sm">{item.notes}</p>
          )}

          {item.productUrl && (
            <a
              href={item.productUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sage self-start text-sm underline underline-offset-4"
            >
              Original product page ↗
            </a>
          )}
        </div>
      </div>

      <section className="border-hair mt-12 border-t pt-6">
        <h2 className="eyebrow">Wear history</h2>
        <WearHistory dates={history.map((w) => w.wornOn)} />
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="eyebrow">{label}</dt>
      <dd className="font-serif text-xl tabular-nums">{value}</dd>
    </div>
  );
}
