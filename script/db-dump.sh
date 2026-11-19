#!/bin/sh
# Refresh the local database snapshot that Docker loads into an EMPTY database volume on first start.
# Contains only recipe catalog data from this dev database (no users, secrets or analytics). Run from the project root.
set -eu
docker compose exec -T db pg_dump -U tablewise --no-owner --no-privileges \
  --exclude-table-data=pilot_events --exclude-table-data=users \
  --exclude-table-data=grocery_item_photos --exclude-table-data=grocery_extras --exclude-table-data=grocery_shopping_items --exclude-table-data=cooking_sessions --exclude-table-data=cooking_photos \
  --exclude-table-data=shared_grocery_lists --exclude-table-data=shared_grocery_items --exclude-table-data=grocery_notes --exclude-table-data=recipe_sources --exclude-table-data=home_tasks --exclude-table-data=week_plans --exclude-table-data=accounts --exclude-table-data=account_sessions --exclude-table-data=recipe_marks --exclude-table-data=household_settings tablewise | gzip -9 > db/init/tablewise.sql.gz
echo "Wrote db/init/tablewise.sql.gz ($(du -h db/init/tablewise.sql.gz | cut -f1))"
