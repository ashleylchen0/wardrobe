"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { fmtDate, money } from "@/lib/format";
import type { LedgerItem } from "@/lib/queries";

/**
 * Two scopes, not one. "Items bought in 2026" narrows the items; "cost per
 * wear in 2026" narrows the wears, and they are different questions — the
 * whole page is built around keeping them apart.
 *
 * Wear dates arrive as ISO strings and stay that way: `"2026-03-04" >=
 * "2026-01-01"` is the window test, and `.slice(0, 4)` is the year. No date
 * parsing happens in the filter loop, which is what keeps a keystroke in the
 * search box cheap across five thousand wear rows.
 */

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
] as const;

const PRICE_BANDS = [
  { value: "u25", label: "Under $25", min: 0, max: 2500 },
  { value: "25", label: "$25 – $49", min: 2500, max: 5000 },
  { value: "50", label: "$50 – $99", min: 5000, max: 10000 },
  { value: "100", label: "$100 – $249", min: 10000, max: 25000 },
  { value: "250", label: "$250 and up", min: 25000, max: Infinity },
  { value: "none", label: "No price recorded", min: null, max: null },
] as const;

const GROUPS = [
  { value: "category", label: "By category" },
  { value: "brand", label: "By brand" },
  { value: "year", label: "By year acquired" },
  { value: "price", label: "By price band" },
] as const;

type Group = (typeof GROUPS)[number]["value"];

const COLUMNS = [
  { key: "name", label: "Item", num: false },
  { key: "brand", label: "Brand", num: false },
  { key: "acquired", label: "Acquired", num: false },
  { key: "price", label: "Paid", num: true },
  { key: "wears", label: "Wears", num: true },
  { key: "cpw", label: "Per wear", num: true },
] as const;

type SortKey = (typeof COLUMNS)[number]["key"];

type State = {
  status: string;
  category: string;
  year: string;
  window: string;
  from: string;
  to: string;
  brand: string;
  price: string;
  activity: string;
  search: string;
  tiles: string[];
  group: Group;
  breakOpen: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
};

const STORE_KEY = "wardrobe:ledger";

/** The app's own thresholds, from `components/cost-per-wear`. */
function tone(cpwCents: number | null): string {
  if (cpwCents === null) return "";
  if (cpwCents < 500) return "text-cpw-good";
  if (cpwCents < 1500) return "text-cpw-ok";
  return "text-cpw-bad";
}

function num(n: number) {
  return n.toLocaleString("en-US");
}

function num1(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Whole dollars, where cents would be noise. */
function money0(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

type Row = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  costCents: number | null;
  acquiredOn: string | null;
  acquiredPrecision: string;
  status: string;
  wears: number;
  cpw: number | null;
};

type Scope = {
  rows: Row[];
  paidTotal: number;
  pricedCount: number;
  pricedWears: number;
  totalWears: number;
  rankable: Row[];
};

const METRICS: { id: string; name: string; calc: (s: Scope) => { value: string; tone?: string } }[] = [
  { id: "count", name: "Items", calc: (s) => ({ value: num(s.rows.length) }) },
  { id: "invested", name: "Total paid", calc: (s) => ({ value: money0(s.paidTotal) }) },
  {
    id: "avgPrice",
    name: "Average price",
    calc: (s) => ({
      value: s.pricedCount ? (money(Math.round(s.paidTotal / s.pricedCount)) ?? "—") : "—",
    }),
  },
  { id: "wears", name: "Wears logged", calc: (s) => ({ value: num(s.totalWears) }) },
  {
    id: "avgWears",
    name: "Wears per item",
    calc: (s) => ({ value: s.rows.length ? num1(s.totalWears / s.rows.length) : "—" }),
  },
  {
    id: "cpw",
    name: "Cost per wear",
    calc: (s) => {
      if (!s.pricedWears) return { value: "—" };
      const c = s.paidTotal / s.pricedWears;
      return { value: money(Math.round(c)) ?? "—", tone: tone(c) };
    },
  },
  {
    id: "medCpw",
    name: "Median cost per wear",
    calc: (s) => {
      const v = median(s.rankable.map((r) => r.cpw!));
      return v === null ? { value: "—" } : { value: money(Math.round(v)) ?? "—", tone: tone(v) };
    },
  },
  {
    id: "never",
    name: "Never worn",
    calc: (s) => ({ value: num(s.rows.filter((r) => r.wears === 0).length) }),
  },
  {
    id: "inRotation",
    name: "In rotation",
    calc: (s) => {
      if (!s.rows.length) return { value: "—" };
      const n = s.rows.filter((r) => r.wears > 0).length;
      return { value: `${Math.round((n / s.rows.length) * 100)}%` };
    },
  },
  {
    id: "deadMoney",
    name: "Idle value",
    calc: (s) => ({
      value: money0(
        s.rows.reduce((sum, r) => sum + (r.wears === 0 && r.costCents !== null ? r.costCents : 0), 0),
      ),
    }),
  },
];

const DEFAULT_TILES = ["count", "invested", "wears", "cpw", "never"];

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function Ledger({ items }: { items: LedgerItem[] }) {
  // The wear history's own bounds, so every window preset is anchored to the
  // data rather than to the reader's clock.
  const { firstWear, lastWear } = useMemo(() => {
    let lo = "9999-12-31";
    let hi = "0000-01-01";
    for (const it of items) {
      if (!it.wornOn.length) continue;
      if (it.wornOn[0] < lo) lo = it.wornOn[0];
      const last = it.wornOn[it.wornOn.length - 1];
      if (last > hi) hi = last;
    }
    return hi < lo ? { firstWear: "2023-01-01", lastWear: "2023-01-01" } : { firstWear: lo, lastWear: hi };
  }, [items]);

  const windows = useMemo(() => {
    const shift = (days: number) => {
      const d = new Date(`${lastWear}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      const iso = d.toISOString().slice(0, 10);
      return iso < firstWear ? firstWear : iso;
    };
    const list = [
      { value: "all", label: "All time", from: firstWear, to: lastWear },
      { value: "30d", label: "Last 30 days", from: shift(29), to: lastWear },
      { value: "90d", label: "Last 90 days", from: shift(89), to: lastWear },
      { value: "12m", label: "Last 12 months", from: shift(364), to: lastWear },
    ];
    // The newest year stops at the last logged day, not December 31st, so it
    // never claims a window that hasn't happened.
    const lastYear = Number(lastWear.slice(0, 4));
    for (let y = Number(firstWear.slice(0, 4)); y <= lastYear; y++) {
      list.push({
        value: `y${y}`,
        label: String(y),
        from: `${y}-01-01`,
        to: y === lastYear ? lastWear : `${y}-12-31`,
      });
    }
    list.push({ value: "custom", label: "Custom range…", from: firstWear, to: lastWear });
    return list;
  }, [firstWear, lastWear]);

  const defaults = useMemo<State>(
    () => ({
      status: "active",
      category: "",
      year: "",
      window: "all",
      from: firstWear,
      to: lastWear,
      brand: "",
      price: "",
      activity: "any",
      search: "",
      tiles: DEFAULT_TILES,
      group: "category",
      breakOpen: true,
      sortKey: "wears",
      sortDir: "desc",
    }),
    [firstWear, lastWear],
  );

  const [s, setS] = useState<State>(defaults);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Read after mount, not during render: the server has no localStorage, and
  // seeding initial state from it would mismatch on hydration.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<State>;
      setS((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(prev) as (keyof State)[]) {
          const v = saved[key];
          if (v === undefined || v === null) continue;
          if (Array.isArray(prev[key]) !== Array.isArray(v)) continue;
          if (typeof prev[key] !== typeof v) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (next as any)[key] = v;
        }
        next.tiles = next.tiles.filter((id) => METRICS.some((m) => m.id === id));
        return next;
      });
    } catch {
      // A private window or blocked storage — defaults are fine.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      // Nothing to do; persistence is a convenience, not a requirement.
    }
  }, [s]);

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const counts = useMemo(() => {
    const cat: Record<string, number> = {};
    const status: Record<string, number> = {};
    const year: Record<string, number> = {};
    const brand: Record<string, number> = {};
    for (const it of items) {
      cat[it.category] = (cat[it.category] ?? 0) + 1;
      status[it.status] = (status[it.status] ?? 0) + 1;
      const y = it.acquiredOn ? it.acquiredOn.slice(0, 4) : "undated";
      year[y] = (year[y] ?? 0) + 1;
      if (it.brand) brand[it.brand] = (brand[it.brand] ?? 0) + 1;
    }
    return { cat, status, year, brand };
  }, [items]);

  const acqYears = useMemo(
    () => Object.keys(counts.year).filter((y) => y !== "undated").sort().reverse(),
    [counts],
  );

  const brands = useMemo(
    () =>
      Object.keys(counts.brand).sort(
        (a, b) => counts.brand[b] - counts.brand[a] || a.localeCompare(b),
      ),
    [counts],
  );

  const scope = useMemo<Scope>(() => {
    const from = s.from <= s.to ? s.from : s.to;
    const to = s.from <= s.to ? s.to : s.from;
    const needle = s.search.trim().toLowerCase();
    const band = PRICE_BANDS.find((b) => b.value === s.price);

    const rows: Row[] = [];
    for (const it of items) {
      if (s.status !== "all" && it.status !== s.status) continue;
      if (s.category && it.category !== s.category) continue;
      if (s.year && (it.acquiredOn ? it.acquiredOn.slice(0, 4) : "undated") !== s.year) continue;
      if (s.brand && it.brand !== s.brand) continue;
      if (needle && !it.name.toLowerCase().includes(needle)) continue;
      if (band) {
        if (band.min === null) {
          if (it.costCents !== null) continue;
        } else if (it.costCents === null || it.costCents < band.min || it.costCents >= band.max) {
          continue;
        }
      }

      // `wornOn` is sorted, so this walks a short run instead of filtering the
      // whole history.
      let worn = 0;
      for (const d of it.wornOn) {
        if (d < from) continue;
        if (d > to) break;
        worn++;
      }

      if (s.activity === "worn" && worn === 0) continue;
      if (s.activity === "never" && worn !== 0) continue;

      rows.push({
        id: it.id,
        name: it.name,
        brand: it.brand,
        category: it.category,
        costCents: it.costCents,
        acquiredOn: it.acquiredOn,
        acquiredPrecision: it.acquiredPrecision,
        status: it.status,
        wears: worn,
        cpw: it.costCents !== null && worn > 0 ? it.costCents / worn : null,
      });
    }

    let paidTotal = 0;
    let pricedCount = 0;
    let pricedWears = 0;
    let totalWears = 0;
    const rankable: Row[] = [];
    for (const r of rows) {
      totalWears += r.wears;
      if (r.costCents === null) continue;
      paidTotal += r.costCents;
      pricedCount++;
      pricedWears += r.wears;
      // A $0 gift divides to $0.00/wear and would top every value ranking
      // ahead of anything actually paid for.
      if (r.costCents > 0 && r.wears > 0) rankable.push(r);
    }

    return { rows, paidTotal, pricedCount, pricedWears, totalWears, rankable };
  }, [items, s]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; n: number; wears: number; paid: number; pricedWears: number }>();
    for (const r of scope.rows) {
      const key =
        s.group === "category"
          ? r.category
          : s.group === "brand"
            ? (r.brand ?? "No brand")
            : s.group === "year"
              ? (r.acquiredOn ? r.acquiredOn.slice(0, 4) : "Undated")
              : r.costCents === null
                ? "No price"
                : (PRICE_BANDS.find(
                    (b) => b.min !== null && r.costCents! >= b.min && r.costCents! < b.max!,
                  )?.label ?? "—");
      const g = map.get(key) ?? { key, n: 0, wears: 0, paid: 0, pricedWears: 0 };
      g.n++;
      g.wears += r.wears;
      if (r.costCents !== null) {
        g.paid += r.costCents;
        g.pricedWears += r.wears;
      }
      map.set(key, g);
    }

    const total = map.size;
    let list = [...map.values()];
    const truncated = list.length > 12;
    if (truncated) list = list.sort((a, b) => b.wears - a.wears).slice(0, 12);
    list.sort((a, b) => b.wears / b.n - a.wears / a.n);

    const avg = scope.rows.length ? scope.totalWears / scope.rows.length : 0;
    const maxDev = Math.max(...list.map((g) => Math.abs(g.wears / g.n - avg)), 1);
    return { list, total, truncated, avg, maxDev };
  }, [scope, s.group]);

  const sorted = useMemo(() => {
    const value = (r: Row): string | number | null => {
      switch (s.sortKey) {
        case "name":
          return r.name.toLowerCase();
        case "brand":
          return (r.brand ?? "").toLowerCase();
        case "acquired":
          return r.acquiredOn ?? "";
        case "price":
          return r.costCents;
        case "wears":
          return r.wears;
        case "cpw":
          return r.cpw;
      }
    };
    const dir = s.sortDir === "asc" ? 1 : -1;
    return [...scope.rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Nulls (no price, never worn) sink to the bottom whichever way the
      // column points — they aren't small values, they're absent ones.
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.name.localeCompare(b.name);
    });
  }, [scope.rows, s.sortKey, s.sortDir]);

  const pickWindow = (value: string) => {
    const w = windows.find((x) => x.value === value);
    if (!w) return;
    if (value === "custom") {
      setDrawerOpen(true);
      set("window", "custom");
      return;
    }
    setS((prev) => ({ ...prev, window: value, from: w.from, to: w.to }));
  };

  const sortBy = (key: SortKey) =>
    setS((prev) => ({
      ...prev,
      sortKey: key,
      sortDir:
        prev.sortKey === key
          ? prev.sortDir === "asc"
            ? "desc"
            : "asc"
          : // Text reads naturally A→Z; figures are asked about largest-first.
            key === "name" || key === "brand"
            ? "asc"
            : "desc",
    }));

  const extraFilters =
    (s.brand ? 1 : 0) + (s.price ? 1 : 0) + (s.activity !== "any" ? 1 : 0) + (s.search.trim() ? 1 : 0);

  const fullWindow = s.from <= firstWear && s.to >= lastWear;
  const shown = showAll ? sorted : sorted.slice(0, 25);
  const pricedTotal = items.filter((i) => i.costCents !== null).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* One row, four questions. Everything second-order is in the drawer, so
          the page opens on figures rather than on controls. */}
      <div className="border-ink border-hair flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-b py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="microcap text-muted text-[9px]">Items</span>
          <Pick label="Status" value={s.status} onChange={(v) => set("status", v)}>
            {STATUSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.value === "all" ? items.length : (counts.status[o.value] ?? 0)})
              </option>
            ))}
          </Pick>
          <Pick label="Category" value={s.category} onChange={(v) => set("category", v)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c} ({counts.cat[c] ?? 0})
              </option>
            ))}
          </Pick>
          <Pick label="Year acquired" value={s.year} onChange={(v) => set("year", v)}>
            <option value="">Any year acquired</option>
            {acqYears.map((y) => (
              <option key={y} value={y}>
                Acquired {y} ({counts.year[y]})
              </option>
            ))}
            <option value="undated">Undated ({counts.year.undated ?? 0})</option>
          </Pick>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="microcap text-muted text-[9px]">Wears</span>
          <Pick label="Wear window" value={s.window} onChange={pickWindow}>
            {windows.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Pick>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-expanded={drawerOpen}
          className="microcap text-muted hover:text-ink ml-auto cursor-pointer text-[9px] underline underline-offset-4"
        >
          {drawerOpen ? "Fewer filters" : "More filters"}
          {extraFilters > 0 && <span className="text-ink font-bold"> · {extraFilters} on</span>}
        </button>
      </div>

      {drawerOpen && (
        <div className="border-hair grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] items-end gap-x-6 gap-y-4 border-b py-4">
          <Field label="Brand">
            <Drop value={s.brand} onChange={(v) => set("brand", v)}>
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b} ({counts.brand[b]})
                </option>
              ))}
            </Drop>
          </Field>
          <Field label="Price paid">
            <Drop value={s.price} onChange={(v) => set("price", v)}>
              <option value="">Any price</option>
              {PRICE_BANDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Drop>
          </Field>
          <Field label="Wear activity">
            <Drop value={s.activity} onChange={(v) => set("activity", v)}>
              <option value="any">Any</option>
              <option value="worn">Worn in window</option>
              <option value="never">Never worn</option>
            </Drop>
          </Field>
          <Field label="Name contains">
            <input
              type="search"
              value={s.search}
              onChange={(e) => set("search", e.target.value)}
              placeholder="e.g. linen"
              className="border-hair hover:border-muted focus:border-ink w-full border-b bg-transparent px-0.5 py-1 text-[12px] outline-none"
            />
          </Field>
          {s.window === "custom" && (
            <Field label="Custom wear window">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={s.from}
                  min={firstWear}
                  max={lastWear}
                  aria-label="Window start"
                  onChange={(e) => e.target.value && set("from", e.target.value)}
                  className="border-hair focus:border-ink w-full border-b bg-transparent px-0.5 py-1 text-[12px] tabular-nums outline-none"
                />
                <span className="text-muted">–</span>
                <input
                  type="date"
                  value={s.to}
                  min={firstWear}
                  max={lastWear}
                  aria-label="Window end"
                  onChange={(e) => e.target.value && set("to", e.target.value)}
                  className="border-hair focus:border-ink w-full border-b bg-transparent px-0.5 py-1 text-[12px] tabular-nums outline-none"
                />
              </div>
            </Field>
          )}
          <button
            type="button"
            onClick={() => setS(defaults)}
            className="microcap text-muted hover:text-ink cursor-pointer justify-self-start text-[9px] underline underline-offset-4"
          >
            Clear
          </button>
        </div>
      )}

      <p className="text-muted mt-6 mb-3 font-mono text-[11.5px] tabular-nums">
        <b className="text-ink font-bold">{num(scope.rows.length)}</b>{" "}
        {s.status !== "all" && `${s.status} `}items
        {s.category && (
          <>
            {" "}
            in <b className="text-ink font-bold">{s.category}</b>
          </>
        )}
        {s.year && (
          <>
            {" "}
            acquired <b className="text-ink font-bold">{s.year}</b>
          </>
        )}
        {s.brand && (
          <>
            {" "}
            by <b className="text-ink font-bold">{s.brand}</b>
          </>
        )}
        {s.search.trim() && (
          <>
            {" "}
            named <b className="text-ink font-bold">{s.search.trim()}</b>
          </>
        )}{" "}
        · <b className="text-ink font-bold">{num(scope.totalWears)}</b> wears{" "}
        {fullWindow ? (
          "all time"
        ) : (
          <>
            between <b className="text-ink font-bold">{fmtDate(s.from)}</b> and{" "}
            <b className="text-ink font-bold">{fmtDate(s.to)}</b>
          </>
        )}
      </p>

      <div className="border-hair grid grid-cols-2 gap-px border sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-white">
        {s.tiles.length === 0 ? (
          <p className="text-muted col-span-full px-4 py-6 text-[11.5px]">
            No figures chosen — pick some under “Choose figures”.
          </p>
        ) : (
          s.tiles.map((id) => {
            const m = METRICS.find((x) => x.id === id);
            if (!m) return null;
            const r = m.calc(scope);
            return (
              <div key={id} className="px-4 py-4">
                <div className={`text-[27px] leading-none tabular-nums ${r.tone ?? ""}`}>{r.value}</div>
                <div className="microcap text-muted mt-2.5 text-[8.5px]">{m.name}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setCatalogueOpen((v) => !v)}
          aria-expanded={catalogueOpen}
          className="microcap text-muted hover:text-ink cursor-pointer text-[9px] underline underline-offset-4"
        >
          {catalogueOpen ? "Done" : "Choose figures"}
        </button>
      </div>

      {catalogueOpen && (
        <div className="border-hair mt-3 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-2 gap-y-1 border-t pt-3">
          {METRICS.map((m) => {
            const on = s.tiles.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    "tiles",
                    // Keep catalogue order, so tiles don't reshuffle as they
                    // are ticked on and off.
                    METRICS.filter((x) =>
                      x.id === m.id ? !on : s.tiles.includes(x.id),
                    ).map((x) => x.id),
                  )
                }
                className={`microcap flex cursor-pointer items-center gap-2 px-0.5 py-1 text-left text-[10px] ${
                  on ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 border ${on ? "border-ink bg-ink" : "border-muted"}`}
                />
                {m.name}
              </button>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <div className="border-ink mb-3.5 flex items-baseline justify-between gap-4 border-b pb-1.5">
          <h2>
            <button
              type="button"
              onClick={() => set("breakOpen", !s.breakOpen)}
              aria-expanded={s.breakOpen}
              className="microcap flex cursor-pointer items-center gap-2 text-[10px] font-bold"
            >
              <span
                aria-hidden
                className={`text-muted text-[7px] transition-transform ${s.breakOpen ? "" : "-rotate-90"}`}
              >
                ▼
              </span>
              Breakdown
            </button>
          </h2>
          <div className="flex items-baseline gap-2.5">
            <span className="microcap text-muted text-[9px] tabular-nums">
              {!s.breakOpen
                ? `${groups.total} ${groups.total === 1 ? "group" : "groups"}`
                : groups.truncated
                  ? `top 12 of ${groups.total} by wears`
                  : ""}
            </span>
            {s.breakOpen && (
              <Drop value={s.group} onChange={(v) => set("group", v as Group)} inline>
                {GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Drop>
            )}
          </div>
        </div>

        {s.breakOpen && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <Th>Group</Th>
                  <Th num>Items</Th>
                  <Th num>Wears</Th>
                  <Th className="w-[42%] pl-4">vs. average {num1(groups.avg)}</Th>
                  <Th num>Per wear</Th>
                </tr>
              </thead>
              <tbody>
                {groups.list.map((g) => {
                  const dev = g.wears / g.n - groups.avg;
                  const half = (Math.abs(dev) / groups.maxDev) * 50;
                  const cpw = g.pricedWears > 0 ? g.paid / g.pricedWears : null;
                  return (
                    <tr key={g.key}>
                      <Td className="microcap text-muted text-[9.5px]">{g.key}</Td>
                      <Td num>{g.n}</Td>
                      <Td num>{num(g.wears)}</Td>
                      <Td className="pl-4 whitespace-nowrap">
                        <span className="relative inline-block h-[9px] w-[calc(100%-56px)] min-w-[90px] align-middle">
                          <span
                            className="bg-ink absolute top-0.5 h-1.5"
                            style={
                              dev >= 0
                                ? { left: "50%", width: `${half}%` }
                                : { left: `${50 - half}%`, width: `${half}%` }
                            }
                          />
                          <span className="bg-muted absolute -top-0.5 left-1/2 h-[13px] w-px" />
                        </span>
                        <span className="text-ink ml-2.5 inline-block w-[46px] text-right">
                          {dev >= 0 ? "+" : "−"}
                          {num1(Math.abs(dev))}
                        </span>
                      </Td>
                      <Td num>
                        {cpw === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={tone(cpw)}>{money(Math.round(cpw))}</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {groups.list.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted py-5 text-[11.5px]">
                      Nothing in scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="border-ink mb-3.5 flex items-baseline justify-between gap-4 border-b pb-1.5">
          <h2 className="microcap text-[10px] font-bold">The register</h2>
          <span className="microcap text-muted text-[9px] tabular-nums">
            {sorted.length === 0
              ? ""
              : shown.length < sorted.length
                ? `${shown.length} of ${num(sorted.length)}`
                : `${num(sorted.length)} items`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <Th
                    key={c.key}
                    num={c.num}
                    sortable
                    active={s.sortKey === c.key}
                    dir={s.sortDir}
                    onClick={() => sortBy(c.key)}
                  >
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <Td className="microcap max-w-[280px] text-[10px] font-bold">
                    <Link href={`/items/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                    {r.status === "archived" && (
                      <span className="microcap text-muted ml-2 text-[8px] font-normal">Archived</span>
                    )}
                  </Td>
                  <Td className="microcap text-muted text-[9.5px]">{r.brand ?? "—"}</Td>
                  <Td className="microcap text-muted text-[9.5px]">
                    {r.acquiredOn
                      ? r.acquiredPrecision === "year"
                        ? r.acquiredOn.slice(0, 4)
                        : fmtDate(r.acquiredOn)
                      : "—"}
                  </Td>
                  <Td num>
                    {r.costCents === null ? <span className="text-muted">—</span> : money(r.costCents)}
                  </Td>
                  <Td num>{r.wears}</Td>
                  <Td num>
                    {r.cpw === null ? (
                      <span className="microcap text-muted text-[9.5px]">
                        {r.wears === 0 ? "Never worn" : "No price"}
                      </span>
                    ) : (
                      <span className={tone(r.cpw)}>{money(Math.round(r.cpw))}</span>
                    )}
                  </Td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="text-muted py-5 text-[11.5px]">
                    Nothing matches. Widen the scope above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap gap-3.5">
            <Key className="bg-cpw-good">Under $5 / wear</Key>
            <Key className="bg-cpw-ok">$5 – $14.99</Key>
            <Key className="bg-cpw-bad">$15 and up</Key>
          </div>
          {sorted.length > 25 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="microcap text-muted hover:text-ink cursor-pointer text-[9px] underline underline-offset-4"
            >
              {showAll ? "Show fewer" : `Show all ${num(sorted.length)}`}
            </button>
          )}
        </div>
      </section>

      <div className="border-hair mt-11 grid max-w-[64ch] gap-1.5 border-t pt-3">
        <p className="text-muted text-[9.5px] leading-relaxed">
          <b>Money figures</b> cover the {pricedTotal} of {items.length} items with a recorded price.
          Unpriced items are left out of them rather than counted as $0, but still count as items and
          wears. Items recorded at $0 — gifts, hand-me-downs — stay out of the value rankings, where
          dividing by nothing would put them above everything you actually paid for.
        </p>
        <p className="text-muted text-[9.5px] leading-relaxed">
          <b>Cost per wear</b> follows the wear window, so a narrow window makes it look worse by
          design: it asks what a piece cost you over that stretch. Archived pieces are ones you no
          longer own; their wear history is kept and returns when you include them.
        </p>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function Pick({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-ink hover:bg-tile cursor-pointer appearance-none border-b bg-transparent py-0.5 pr-4 pl-0.5 text-[12px] outline-none"
      >
        {children}
      </select>
      <span aria-hidden className="text-muted pointer-events-none absolute right-0.5 text-[7px]">
        ▼
      </span>
    </span>
  );
}

function Drop({
  value,
  onChange,
  children,
  inline,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        inline
          ? "microcap text-muted hover:text-ink cursor-pointer bg-transparent text-[9px] outline-none"
          : "border-hair hover:border-muted focus:border-ink w-full cursor-pointer border-b bg-transparent px-0.5 py-1 text-[12px] outline-none"
      }
    >
      {children}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="microcap text-muted text-[9px]">{label}</span>
      {children}
    </label>
  );
}

function Th({
  children,
  num,
  className = "",
  sortable,
  active,
  dir,
  onClick,
}: {
  children: React.ReactNode;
  num?: boolean;
  className?: string;
  sortable?: boolean;
  active?: boolean;
  dir?: "asc" | "desc";
  onClick?: () => void;
}) {
  return (
    <th
      scope="col"
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`microcap border-ink border-b pb-1.5 text-left text-[8.5px] font-normal whitespace-nowrap ${
        num ? "pr-0 text-right" : "pr-2.5"
      } ${sortable ? "hover:text-ink cursor-pointer" : ""} ${
        active ? "text-ink font-bold" : "text-muted"
      } ${className}`}
    >
      {children}
      {active && <span className="ml-1 opacity-50">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

function Td({
  children,
  num,
  className = "",
}: {
  children: React.ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-hair border-b py-2 align-baseline text-[11.5px] tabular-nums ${
        num ? "pr-0 text-right" : "pr-2.5"
      } ${className}`}
    >
      {children}
    </td>
  );
}

function Key({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="microcap text-muted text-[8.5px] tabular-nums">
      <i className={`mr-1.5 inline-block h-2 w-2 ${className}`} />
      {children}
    </span>
  );
}
