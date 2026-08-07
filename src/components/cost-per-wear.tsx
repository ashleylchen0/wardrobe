import { moneyFromNumeric } from "@/lib/format";

/**
 * The one place this interface uses color. Everything else is monochrome, so a
 * bad cost per wear reads as a signal rather than as decoration.
 *
 * There used to be a bar here. It was removed because the fill grew as the
 * number got *worse*: the best items in the closet rendered as nearly empty
 * tracks and the worst rendered as full ones, backwards from what a filled bar
 * means everywhere else. The figure carries it on its own.
 *
 * `costPerWearCents` arrives as a numeric string from the `item_stats` view.
 */

const GOOD_BELOW = 500;
const OK_BELOW = 1500;

type Tone = "good" | "ok" | "bad";

function toneFor(cents: number): Tone {
  if (cents < GOOD_BELOW) return "good";
  if (cents < OK_BELOW) return "ok";
  return "bad";
}

const TEXT: Record<Tone, string> = {
  good: "text-cpw-good",
  ok: "text-cpw-ok",
  bad: "text-cpw-bad",
};

export function CostPerWear({
  costPerWearCents,
  timesWorn,
  costCents,
  size = "sm",
}: {
  costPerWearCents: string | null;
  timesWorn: number;
  costCents: number | null;
  size?: "sm" | "lg";
}) {
  // Absent for two different reasons, and they mean opposite things: an item
  // nobody has worn yet versus one whose price was never written down.
  if (costPerWearCents === null) {
    return (
      <span className="microcap text-muted text-[10px]">
        {timesWorn === 0
          ? "Never worn"
          : costCents === null
            ? "No cost recorded"
            : "No cost per wear"}
      </span>
    );
  }

  const tone = toneFor(Number(costPerWearCents));

  // At display size the figure sits under its own "Cost per wear" label, so
  // the /wear suffix would say it twice.
  return (
    <span
      className={`tabular-nums ${TEXT[tone]} ${
        size === "lg" ? "text-4xl" : "text-[11px]"
      }`}
    >
      {moneyFromNumeric(costPerWearCents)}
      {size === "sm" && "/wear"}
    </span>
  );
}
