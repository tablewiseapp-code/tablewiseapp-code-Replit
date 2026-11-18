import assert from "node:assert/strict";
import { groupTasks, homePreview, localDate, nextDay, sectionOf, type HomeTask } from "../shared/home-tasks";
import { homeTaskInput } from "../server/request-schemas";

const today = "2026-11-17";
let n = 0;
const task = (name: string, extra: Partial<HomeTask> = {}): HomeTask => ({
  id: name, name, dueDate: null, priority: "normal", image: null, completedAt: null,
  createdAt: `2026-11-01T00:00:${String(n++).padStart(2, "0")}.000Z`, ...extra,
});

assert.equal(sectionOf({ dueDate: "2026-11-16" }, today), "overdue");
assert.equal(sectionOf({ dueDate: today }, today), "today");
assert.equal(sectionOf({ dueDate: "2026-11-18" }, today), "upcoming");
assert.equal(sectionOf({ dueDate: null }, today), "anytime");
assert.equal(nextDay("2026-12-31"), "2027-01-01");
assert.equal(nextDay("2028-02-28"), "2028-02-29");
assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05", "local calendar date, not UTC");

const tasks = [
  task("old low", { priority: "low" }),
  task("old normal"),
  task("new normal"),
  task("high", { priority: "high" }),
  task("upcoming later", { dueDate: "2026-11-30" }),
  task("upcoming soon", { dueDate: "2026-11-20" }),
  task("upcoming high", { dueDate: "2026-12-30", priority: "high" }),
  task("overdue", { dueDate: "2026-11-10" }),
  task("today low", { dueDate: today, priority: "low" }),
  task("today normal", { dueDate: today }),
  task("today high", { dueDate: today, priority: "high" }),
  task("done first", { completedAt: "2026-11-17T08:00:00.000Z", dueDate: today }),
  task("done last", { completedAt: "2026-11-17T09:00:00.000Z" }),
];
const groups = groupTasks(tasks, today);
const names = (list: HomeTask[]) => list.map(t => t.name);
assert.deepEqual(names(groups.anytime), ["high", "new normal", "old normal", "old low"]);
assert.deepEqual(names(groups.upcoming), ["upcoming high", "upcoming soon", "upcoming later"]);
assert.deepEqual(names(groups.today), ["today high", "today normal", "today low"]);
assert.deepEqual(names(groups.overdue), ["overdue"]);
assert.deepEqual(names(groups.completed), ["done last", "done first"], "completed are not in open sections");
assert.deepEqual(names(homePreview(tasks, today)), ["overdue", "today high", "today normal"]);
assert.deepEqual(homePreview([task("anytime")], today), [], "Home shows only Overdue and Today");

const valid = { name: "  Fold laundry ", dueDate: null, priority: "normal", image: null, completedAt: null };
assert.equal(homeTaskInput.parse(valid).name, "Fold laundry");
for (const bad of [{ ...valid, name: "   " }, { ...valid, dueDate: "2026-02-30" }, { ...valid, priority: "urgent" },
  { ...valid, ownerId: "x" }, { ...valid, image: "https://example.com/a.jpg" }]) {
  assert.equal(homeTaskInput.safeParse(bad).success, false, JSON.stringify(bad));
}
console.log("home tasks: ok");
