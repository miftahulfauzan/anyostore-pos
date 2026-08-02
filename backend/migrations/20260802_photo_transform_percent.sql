-- Convert legacy transform values from pixel-based pan to percentage-based pan.
-- Old modal box was ~400x533px, so xPct = x/400*100 and yPct = y/533.333*100.
-- Only convert rows that actually have a transform (not null/empty/'1,0,0').
UPDATE product_photos
SET transform = CONCAT(
  SUBSTRING_INDEX(transform, ',', 1), ',',
  ROUND(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(transform, ',', 2), ',', -1) AS DECIMAL(12,4)) / 4.0, 4), ',',
  ROUND(CAST(SUBSTRING_INDEX(transform, ',', -1) AS DECIMAL(12,4)) / 5.33333, 4)
)
WHERE transform IS NOT NULL
  AND transform <> ''
  AND transform <> '1,0,0';
