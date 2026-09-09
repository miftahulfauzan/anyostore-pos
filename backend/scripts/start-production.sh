#!/bin/sh
set -eu

# A failed migration must prevent the API from listening on an incompatible schema.
node scripts/migrate.js
# Preserve the legacy idempotent media repair, but report failures explicitly.
if ! node scripts/fix-clone-paths.js; then
  printf '%s\n' '[startup] Media path repair failed; inspect backend logs' >&2
  exit 1
fi
exec node src/index.js
