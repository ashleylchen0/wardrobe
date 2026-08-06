import { moneyFromNumeric } from "@/lib/format";

/**
 * The one place this interface uses semantic color. Everything else is
 * near-monochrome so that a bad cost per wear reads as a signal rather than
 * as decoration.
 *
 * `costPerWearCents` arrives as a numeric string from the `item_stats` view.
 */

/** Bars top out at $20/wear. Past that the number carries it on its own. */
const CAP_CENTS = 2000;
const GOOD_BELOW = 500;
const OK_BELOW = 1500;

type Tone = "good" | "ok" | "bad";

function toneFor(cents: number): Tone {
  if (cents < GOOD_BELOW) return "good";
  if (cents < OK_BELOW) return "ok";
  return "bad";
}

/**
 * Square-rooted so the low end stays legible — most of a wardrobe lives under
 * $6 a wear, and a linear scale crushes all of it against the left edge.
 */
function fillWidth(cents: number): number {
  return Math.max(0.02, Math.sqrt(Math.min(cents, CAP_CENTS) / CAP_CENTS));
}

const BAR: Record<Tone, string> = {
  good: "var(--color-cpw-good)",
  ok: "var(--color-cpw-ok)",
  bad: "var(--color-cpw-bad)",
};

const TEXT: Record<Tone, string> = {
  good: "text-cpw-good",
  ok: "text-cpw-ok",
  bad: "text-cpw-bad",
};

export function CostPerWearBar({
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
      <p className="text-muted text-xs">
        {timesWorn === 0
          ? "Never worn"
          : costCents === null
            ? "No cost recorded"
            : "No cost per wear"}
      </p>
    );
  }

  const cents = Number(costPerWearCents);
  const tone = toneFor(cents);

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`bg-hair flex-1 overflow-hidden rounded-full ${
          size === "lg" ? "h-1.5" : "h-1"
        }`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${fillWidth(cents) * 100}%`,
            background: BAR[tone],
          }}
        />
      </div>
      <span
        className={`shrink-0 tabular-nums ${TEXT[tone]} ${
          size === "lg" ? "text-base font-medium" : "text-xs"
        }`}
      >
        {moneyFromNumeric(costPerWearCents)}
      </span>
    </div>
  );
}
