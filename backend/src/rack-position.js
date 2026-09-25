const MAX_RACK_POSITION_LENGTH = 100;

function normalizeRackPosition(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > MAX_RACK_POSITION_LENGTH) {
    throw Object.assign(new Error(`Posisi rak maksimal ${MAX_RACK_POSITION_LENGTH} karakter`), { status: 400 });
  }
  return normalized;
}

module.exports = { MAX_RACK_POSITION_LENGTH, normalizeRackPosition };
