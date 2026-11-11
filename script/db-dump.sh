#!/bin/sh
# Refresh the local database snapshot that Docker loads into an EMPTY database volume on first start.
# Contains only recipe catalog data from this dev database (no users, secrets or analytics). Run from the project root.
set -eu
docker compose exec -T db pg_dump -U tablewise --no-owner --no-privileges \
  --exclude-table-data=pilot_events --exclude-table-data=users tablewise | gzip -9 > db/init/tablewise.sql.gz
echo "Wrote db/init/tablewise.sql.gz ($(du -h db/init/tablewise.sql.gz | cut -f1))"
