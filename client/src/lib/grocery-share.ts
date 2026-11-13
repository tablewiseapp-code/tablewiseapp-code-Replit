// Grocery list export & share: pure formatting helpers (no DOM), tested in script/test-grocery-share.ts.
export type ShareScope = "remaining" | "all";
export type ShareItem = { text: string; checked: boolean; pantry: boolean };
export type ShareCategory = { name: string; items: ShareItem[] };

/** Keeps category order; "remaining" drops checked items; empty categories disappear. */
export function scopeList(categories: ShareCategory[], scope: ShareScope): ShareCategory[] {
  return categories
    .map(c => ({ name: c.name, items: scope === "all" ? c.items : c.items.filter(i => !i.checked) }))
    .filter(c => c.items.length > 0);
}

export const countItems = (categories: ShareCategory[]) => categories.reduce((n, c) => n + c.items.length, 0);

const line = (i: ShareItem, pantryLabel: string) => `${i.checked ? "✓" : "-"} ${i.text}${i.pantry ? ` (${pantryLabel})` : ""}`;

export function formatText(title: string, categories: ShareCategory[], pantryLabel: string): string {
  return [title, ...categories.map(c => `\n${c.name}\n${c.items.map(i => line(i, pantryLabel)).join("\n")}`)].join("\n");
}

const csvCell = (v: string) => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** Items are raw recipe lines, so quantity/unit stay empty rather than guessed. BOM keeps Excel on UTF-8. */
export function toCsv(categories: ShareCategory[], headers: [string, string, string, string, string, string]): string {
  const rows = [headers, ...categories.flatMap(c => c.items.map(i => [c.name, i.text, "", "", i.checked ? "yes" : "no", i.pantry ? "yes" : "no"]))];
  return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const mailtoUrl = (subject: string, body: string) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
// Facebook's sharer only takes a URL; it ignores prefilled text.
export const facebookUrl = (link: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;

const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

/** Standalone page for the browser's "Save as PDF": native Unicode/RTL fonts and page breaks for long lists. */
export function printableHtml(title: string, categories: ShareCategory[], pantryLabel: string, lang: string, dir: "ltr" | "rtl"): string {
  const body = categories.map(c =>
    `<section><h2>${esc(c.name)}</h2><ul>${c.items.map(i =>
      `<li${i.checked ? ' class="done"' : ""}>${i.checked ? "✓" : "☐"} ${esc(i.text)}${i.pantry ? ` <small>(${esc(pantryLabel)})</small>` : ""}</li>`).join("")}</ul></section>`).join("");
  return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#242923;margin:24px}
h1{font-size:22px;margin:0 0 12px}h2{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #ddd;break-after:avoid}
ul{list-style:none;margin:0;padding:0}li{padding:2px 0;break-inside:avoid}li.done{color:#777;text-decoration:line-through}small{color:#59745d}
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}
