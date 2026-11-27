export function stockStatus(group) {
  if (group.total <= 0) return 'out';
  if (group.total <= group.min_stock) return 'low';
  return 'safe';
}
