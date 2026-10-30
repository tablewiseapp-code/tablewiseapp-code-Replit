import assert from "node:assert/strict";
import { plannerRecipeURL, recipePlannerURL } from "../client/src/lib/week-plan";

const week = "2026-10-19";
const id = "tablewise:real:v1:salmon-egg-fried-rice";
const link = plannerRecipeURL(id, week);
assert.equal(new URL(link, "https://example.test").pathname, `/recipe/${encodeURIComponent(id)}`);
assert.equal(recipePlannerURL(link.split("?")[1]), `/meals?week=${week}`);
for (const search of [
  "", "?week=", "?week=2026-10-20", "?week=2026-02-30", "?week=1999-12-27",
  "?week=2101-01-03", "?week=2026-10-19T00:00:00Z", "?week=https://example.test",
  "?week=2026-10-19&week=2026-10-26", "?returnTo=https://example.test",
  "?redirect=/meals", "?week=%2F%2Fevil.test", "?week=2026-10-19%26redirect%3D%2Fmeals",
]) {
  assert.equal(recipePlannerURL(search), "/meals", search);
}
assert.equal(recipePlannerURL(`?week=${week}&returnTo=https://example.test`), `/meals?week=${week}`);
assert.equal(recipePlannerURL("?week=2028-02-28"), "/meals?week=2028-02-28");
console.log("PASS planner return: explicit Monday context, encoded recipe IDs, direct-entry fallback, invalid/duplicate weeks and arbitrary redirect rejection; no database access.");
