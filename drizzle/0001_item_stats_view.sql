-- Times worn and cost per wear are derived, never stored. The spreadsheet
-- cached them as COUNTIF results and they drifted out of sync with the logs;
-- counting on read makes that class of bug impossible.
CREATE VIEW item_stats AS
SELECT
  i.id AS item_id,
  COUNT(w.id)::int AS times_worn,
  CASE
    WHEN COUNT(w.id) > 0 AND i.cost_cents IS NOT NULL
    THEN ROUND(i.cost_cents::numeric / COUNT(w.id), 2)
  END AS cost_per_wear_cents,
  MIN(w.worn_on) AS first_worn,
  MAX(w.worn_on) AS last_worn
FROM items i
LEFT JOIN wears w ON w.item_id = i.id
GROUP BY i.id, i.cost_cents;
