import assert from "node:assert/strict";
import * as s from "../client/src/lib/grocery-share";

const list: s.ShareCategory[] = [
  { name: "Produce", items: [{ text: "2 carrots", checked: false, pantry: false }, { text: "3 onions", checked: true, pantry: false }] },
  { name: "Молочные и яйца", items: [{ text: "2 ביצים", checked: true, pantry: false }] },
  { name: "Other", items: [{ text: "1/2 tsp salt, \"fine\"", checked: false, pantry: true }] },
];

// Scope: remaining drops checked items and emptied categories; order kept.
const remaining = s.scopeList(list, "remaining");
assert.deepEqual(remaining.map(c => c.name), ["Produce", "Other"]);
assert.equal(s.countItems(remaining), 2);
assert.equal(s.countItems(s.scopeList(list, "all")), 4);
assert.equal(list[0].items.length, 2, "scoping does not mutate the user's list");

// Text: grouped, Unicode intact, checked marked, pantry noted, no HTML.
const text = s.formatText("TableWise Grocery List", s.scopeList(list, "all"), "In your pantry");
assert.equal(text, "TableWise Grocery List\n\nProduce\n- 2 carrots\n✓ 3 onions\n\nМолочные и яйца\n✓ 2 ביצים\n\nOther\n- 1/2 tsp salt, \"fine\" (In your pantry)");

// WhatsApp / email encoding round-trips exactly.
assert.equal(decodeURIComponent(s.whatsappUrl(text).split("?text=")[1]), text);
const mail = new URL(s.mailtoUrl("Grocery & list", text));
assert.equal(mail.protocol, "mailto:");
assert.equal(new URLSearchParams(mail.search).get("subject"), "Grocery & list");
assert.equal(decodeURIComponent(s.mailtoUrl("x", "a\nb").split("&body=")[1]), "a\r\nb", "mail bodies use CRLF");
assert.ok(!s.mailtoUrl("x", "a b").includes("+"), "spaces are %20, not +");
assert.equal(new URL(s.facebookUrl("https://app.example/?a=1&b=2")).searchParams.get("u"), "https://app.example/?a=1&b=2");

// CSV: BOM, escaping, no invented quantity/unit.
const csv = s.toCsv(remaining, ["Category", "Ingredient", "Quantity", "Unit", "Checked", "Pantry"]);
assert.ok(csv.startsWith("﻿Category,Ingredient,Quantity,Unit,Checked,Pantry\r\n"));
assert.ok(csv.includes('Other,"1/2 tsp salt, ""fine""",,,no,yes\r\n'));

// Printable page escapes content and carries direction.
const html = s.printableHtml("<List>", [{ name: "A&B", items: [{ text: "<b>x</b>", checked: true, pantry: false }] }], "p", "he", "rtl");
assert.ok(html.includes('dir="rtl"') && html.includes("&#60;b&#62;x") && !html.includes("<b>x"));

// Long list stays complete.
const long = [{ name: "Other", items: Array.from({ length: 500 }, (_, i) => ({ text: `item ${i}`, checked: false, pantry: false })) }];
assert.equal(s.formatText("T", long, "p").split("\n").length, 503);
console.log("grocery-share: ok");
