#!/usr/bin/env bash
# One-time catalog v1 database pipeline: seed -> verify -> dump -> restore -> verify -> DB safety tests
# -> run the unchanged app against the restored DB -> API + browser checks.
# Every database is a NEW throwaway postgres:16 container created by this run. DATABASE_URL, the compose
# database and any shared/production database are never used. Containers are removed on exit.
# Usage: bash script/recipe-catalog-db.sh            (needs Docker, the tablewise_node_modules volume, Chrome)
set -euo pipefail
cd "$(dirname "$0")/.."
RUN="tablewise-catalog-v1-$(date +%s)-$$"
NET="$RUN-net"; GEN="$RUN-gen"; RESTORE="$RUN-restore"; TEST="$RUN-test"; APP="$RUN-app"
OUT=data/catalog; NAME=tablewise-recipes-v1
WORK=$(mktemp -d)
APP_PORT=${APP_PORT:-5077}
NODE=(docker run --rm -i -v "$PWD":/app -v tablewise_node_modules:/app/node_modules:ro -w /app node:20)
die() { echo "FAIL: $*" >&2; exit 1; }
step() { echo "== $*"; }
cleanup() {
  docker ps -q --filter "label=tablewise.catalog-run=$RUN" | xargs -r docker stop >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

q() { local c=$1; shift; docker exec -i "$c" psql -X -v ON_ERROR_STOP=1 -q -At -U postgres -d catalog "$@"; }
start_db() { # name network
  docker ps -a --format '{{.Names}}' | grep -qx "$1" && die "container $1 already exists"
  docker run -d --rm --name "$1" --network "$2" --label "tablewise.catalog-run=$RUN" \
    -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=catalog postgres:16 >/dev/null
  for _ in $(seq 60); do docker exec "$1" pg_isready -q -h 127.0.0.1 -U postgres -d catalog && break; sleep 1; done
  verify_isolated "$1" "$2"
}
verify_isolated() { # Identity checks before ANY write: our fresh container, no host ports, empty cluster.
  local meta; meta=$(docker inspect -f '{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "tablewise.catalog-run"}}' "$1")
  [ "$meta" = "postgres:16|$2|0|$RUN" ] || die "$1 is not this run's isolated container ($meta)"
  local state; state=$(q "$1" -c "SELECT current_database()||'|'||(SELECT count(*) FROM pg_database WHERE NOT datistemplate)||'|'||(SELECT count(*) FROM pg_tables WHERE schemaname='public')")
  [ "$state" = "catalog|2|0" ] || die "$1 is not an empty fresh cluster ($state)"
  echo "   verified isolated $1: image postgres:16, network $2, no published ports, empty cluster, system id $(q "$1" -c 'SELECT system_identifier FROM pg_control_system()')"
}
rows() { q "$1" -c "SELECT coalesce(json_agg(json_build_object('id',id,'title',title,'ingredients',ingredients,'steps',steps,'image',image,'source_url',source_url,'prep_time',prep_time,'cook_time',cook_time,'servings',servings,'tags',tags) ORDER BY id),'[]') FROM recipes"; }
verify_rows() { rows "$1" | "${NODE[@]}" npx tsx script/verify-recipe-catalog.ts; }
import_sql() { docker exec -i "$@" psql -X -v ON_ERROR_STOP=1 -q -At -U postgres -d catalog < "$OUT/$NAME.sql" 2>&1; }
count() { q "$1" -c "SELECT count(*) FILTER (WHERE id LIKE 'tablewise:catalog:v1:%')||'/'||count(*) FROM recipes"; }
others_hash() { q "$1" -c "SELECT md5(coalesce(string_agg(to_jsonb(r)::text, ',' ORDER BY id), '')) FROM recipes r WHERE id NOT LIKE 'tablewise:catalog:v1:%'"; }
expect() { [[ "$1" == *"$2"* ]] || die "$3: expected '$2', got: $1"; echo "   PASS $3"; }

step "Build and validate catalog (no database)"
"${NODE[@]}" npx tsx script/build-recipe-catalog.ts
step "Export the application's Drizzle schema as DDL (offline; dummy URL is never connected)"
"${NODE[@]}" sh -c 'DATABASE_URL=postgres://export-only@127.0.0.1:1/none npx drizzle-kit export --sql' > "$WORK/schema.sql"
grep -q 'CREATE TABLE "recipes"' "$WORK/schema.sql" || die "schema export"

step "Generation database (network none)"
start_db "$GEN" none
q "$GEN" < "$WORK/schema.sql" >/dev/null
expect "$(import_sql "$GEN")" "inserted 200, already present 0" "initial seed inserts 200"
STAMP1=$(q "$GEN" -c "SELECT md5(string_agg(id||created_at||updated_at, ',' ORDER BY id)) FROM recipes")
expect "$(import_sql "$GEN")" "inserted 0, already present 200" "repeat seed is a no-op"
[ "$STAMP1" = "$(q "$GEN" -c "SELECT md5(string_agg(id||created_at||updated_at, ',' ORDER BY id)) FROM recipes")" ] || die "timestamps changed"
echo "   PASS repeat seed preserves timestamps"
GEN_VERIFY=$(verify_rows "$GEN"); expect "$GEN_VERIFY" '"identicalToCanonical":true' "stored rows identical to canonical JSON"

step "Dump catalog rows (custom format, data only, recipes table only)"
docker exec "$GEN" pg_dump -U postgres -d catalog -Fc --data-only --table=public.recipes --no-owner --no-privileges > "$OUT/$NAME.dump"
TOC=$(docker exec -i "$GEN" pg_restore -l < "$OUT/$NAME.dump" | grep -v '^;' | grep -v '^$')
[ "$(echo "$TOC" | wc -l | tr -d ' ')" = 1 ] && [[ "$TOC" == *"TABLE DATA public recipes"* ]] || die "dump contains more than recipe data: $TOC"
echo "   PASS dump contains only: TABLE DATA public recipes (200 catalog rows, no users/sessions/analytics)"
PG_SERVER=$(q "$GEN" -c 'SHOW server_version'); PG_DUMP=$(docker exec "$GEN" pg_dump --version)

step "Restore into a second clean database"
docker network create "$NET" >/dev/null
start_db "$RESTORE" "$NET"
q "$RESTORE" < "$WORK/schema.sql" >/dev/null
docker exec -i "$RESTORE" pg_restore -U postgres -d catalog --data-only --single-transaction --exit-on-error --no-owner --no-privileges < "$OUT/$NAME.dump"
RESTORE_VERIFY=$(verify_rows "$RESTORE"); expect "$RESTORE_VERIFY" '"identicalToCanonical":true' "restored rows identical to canonical JSON"
expect "$(import_sql "$RESTORE")" "inserted 0, already present 200" "SQL import matches restored dump exactly"

step "Database safety tests (third throwaway database)"
start_db "$TEST" none
q "$TEST" < "$WORK/schema.sql" >/dev/null
q "$TEST" -c "INSERT INTO recipes (id,title,ingredients,steps,servings,tags,created_at,updated_at) VALUES
  ('user-recipe-1','Chicken fajitas',ARRAY['1 kg chicken'],ARRAY['Cook it.'],'4',ARRAY['Dinner'],'2024-01-01','2024-01-02'),
  ('tablewise:dinner:v1:tomato-pasta','Tomato pasta',ARRAY['400 g pasta'],ARRAY['Boil.'],'4',ARRAY['Dinner'],'2024-01-01','2024-01-01')"
USERS0=$(others_hash "$TEST")
expect "$(docker exec -i -e PGOPTIONS='-c tablewise.dry_run=on' "$TEST" psql -X -v ON_ERROR_STOP=1 -q -At -U postgres -d catalog < "$OUT/$NAME.sql" 2>&1 || true)" "DRY RUN OK: would insert 200" "dry run reports and writes nothing"
[ "$(count "$TEST")" = "0/2" ] || die "dry run wrote rows"
q "$TEST" -c "INSERT INTO recipes (id,title,ingredients,steps) VALUES ('tablewise:catalog:v1:waffles','Someone else''s waffles',ARRAY['x'],ARRAY['y'])"
expect "$(import_sql "$TEST" || true)" "Conflict: 1 catalog ID(s) already hold different content" "conflicting ID stops the import"
[ "$(count "$TEST")" = "1/3" ] || die "conflict did not roll back the other 199 inserts"
echo "   PASS conflict rolls back the whole import (0 of 199 other rows kept), conflicting row untouched"
q "$TEST" -c "DELETE FROM recipes WHERE id = 'tablewise:catalog:v1:waffles'" # throwaway test DB only
expect "$(import_sql "$TEST")" "inserted 200" "import beside existing user recipes"
expect "$(import_sql "$TEST")" "inserted 0, already present 200" "re-import creates no duplicates"
[ "$USERS0" = "$(others_hash "$TEST")" ] || die "user recipes changed"
echo "   PASS user recipes (incl. same-title and legacy seed rows) unchanged, timestamps included"
q "$TEST" -c "UPDATE recipes SET title = 'Edited waffles' WHERE id = 'tablewise:catalog:v1:waffles'"
expect "$(import_sql "$TEST" || true)" "Conflict: 1 catalog ID" "edited catalog row is reported, never overwritten"
[ "$(q "$TEST" -c "SELECT title FROM recipes WHERE id='tablewise:catalog:v1:waffles'")" = "Edited waffles" ] || die "edited row overwritten"
DUMP_AGAIN=$(docker exec -i "$TEST" pg_restore -U postgres -d catalog --data-only --single-transaction --exit-on-error --no-owner --no-privileges < "$OUT/$NAME.dump" 2>&1 || true)
expect "$DUMP_AGAIN" "duplicate key" "restoring the dump over existing catalog rows fails"
[ "$(count "$TEST")" = "200/202" ] || die "failed dump restore left partial rows"
echo "   PASS failed dump restore rolled back (single transaction)"

step "Run the unchanged app against the restored database"
docker run -d --rm --name "$APP" --network "$NET" --label "tablewise.catalog-run=$RUN" -p "127.0.0.1:$APP_PORT:5000" \
  -v "$PWD":/app:ro -v tablewise_node_modules:/app/node_modules:ro -w /app \
  -e NODE_ENV=development -e PORT=5000 -e TABLEWISE_PUBLIC_CATALOG_REVIEWED=true \
  -e DATABASE_URL="postgresql://postgres@$RESTORE:5432/catalog" -e PGPASSWORD="$(docker exec "$RESTORE" printenv POSTGRES_PASSWORD)" \
  node:20 npx tsx server/index.ts >/dev/null
for _ in $(seq 90); do curl -sf "http://127.0.0.1:$APP_PORT/api/recipes" -o "$WORK/api.json" && break; sleep 1; done
[ -s "$WORK/api.json" ] || { docker logs "$APP" 2>&1 | tail -20; die "app did not serve /api/recipes"; }
curl -sf "http://127.0.0.1:$APP_PORT/api/recipes/tablewise:catalog:v1:waffles" -o "$WORK/detail.json" || die "detail endpoint"
API=$(node -e '
  const fs = require("fs"); const [list, detail] = process.argv.slice(1).map(f => JSON.parse(fs.readFileSync(f, "utf8")));
  const cat = JSON.parse(fs.readFileSync("data/catalog/tablewise-recipes-v1.json", "utf8")).recipes;
  const got = new Map(list.map(r => [r.id, r])); const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = cat.every(c => { const r = got.get(c.id); return r && r.title === c.title && same(r.ingredients, c.ingredients) && same(r.steps, c.steps)
    && same(r.tags, c.tags) && r.prepTime === c.prepTime && r.cookTime === c.cookTime && r.servings === c.servings && r.image === null; });
  console.log(JSON.stringify({ listed: list.length, catalogMatches: ok, detailOk: detail.id === "tablewise:catalog:v1:waffles" && same(detail.steps, cat.find(c => c.id === detail.id).steps) }));
' "$WORK/api.json" "$WORK/detail.json")
expect "$API" '"listed":200,"catalogMatches":true,"detailOk":true' "GET /api/recipes and /api/recipes/:id return the restored catalog"

BROWSER="not run (set SKIP_BROWSER=1 to skip intentionally)"
if [ -z "${SKIP_BROWSER:-}" ]; then
  step "Browser checks (headless Chrome, throwaway profile, isolated app only)"
  BASE_URL="http://127.0.0.1:$APP_PORT" node script/test-recipe-catalog-browser.mjs | tee "$WORK/browser.txt"
  BROWSER=$(tail -1 "$WORK/browser.txt")
fi

step "Record restore verification and checksums"
"${NODE[@]}" node -e '
  const fs = require("fs"); const path = "data/catalog/tablewise-recipes-v1-validation.json";
  const report = JSON.parse(fs.readFileSync(path, "utf8")); const [gen, restored, api, server, dump, browser] = process.argv.slice(1);
  report.restoreVerification = { passed: true, postgresServer: server, pgDumpClient: dump, generationDatabase: JSON.parse(gen),
    restoredDatabase: JSON.parse(restored), sqlImportAgainstRestore: "inserted 0, already present 200 (identical content)",
    dumpContents: "TABLE DATA public recipes only", api: JSON.parse(api), browser,
    safetyTests: ["idempotent re-run", "timestamps preserved", "dry run writes nothing", "conflict aborts whole import", "user rows unchanged", "edited catalog row never overwritten", "dump restore over existing rows rolls back"] };
  fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n");' "$GEN_VERIFY" "$RESTORE_VERIFY" "$API" "$PG_SERVER" "$PG_DUMP" "$BROWSER"
(cd "$OUT" && shasum -a 256 "$NAME.json" "$NAME.dump" "$NAME.sql" "$NAME-sources.json" "$NAME-validation.json" > "$NAME.sha256" && cat "$NAME.sha256")
echo "ALL CATALOG DATABASE CHECKS PASSED (server $PG_SERVER; $PG_DUMP). Throwaway containers are removed on exit."
