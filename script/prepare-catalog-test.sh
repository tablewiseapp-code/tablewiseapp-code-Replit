#!/usr/bin/env bash
set -euo pipefail
# Explicit, local-only preparation after approval. Never touches DATABASE_URL.
base="${1:-/tmp/tablewise-phase2}"
if [[ ! "$base" =~ ^/tmp/tablewise-phase2(-[a-zA-Z0-9_-]+)?$ ]]; then
  echo "Use /tmp/tablewise-phase2 or /tmp/tablewise-phase2-NAME." >&2
  exit 1
fi
if [[ -e "$base" ]]; then
  echo "Refusing to reuse an existing directory. Choose a fresh approved cluster path." >&2
  exit 1
fi
mkdir -m 700 "$base"
initdb -D "$base/data" --auth=trust --no-locale > "$base/init.log"
mkdir -m 700 "$base/socket"
echo "Prepared NEW local cluster at $base/data; no existing database connection used."
echo "Start in a persistent terminal: postgres -D $base/data -c listen_addresses='' -k $base/socket"
echo "Then: createdb -h $base/socket -U $(id -un) tablewise_phase2"
echo "Then: npm run test:catalog -- --test-socket $base/socket"
