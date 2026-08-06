/** Cost is stored in cents; null means unrecorded, which is not the same as $0. */
export function money(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

/** The view returns numeric as a string to avoid float rounding. */
export function moneyFromNumeric(value: string | null): string | null {
  if (value === null) return null;
  return `$${(Number(value) / 100).toFixed(2)}`;
}
