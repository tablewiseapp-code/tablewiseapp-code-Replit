// Every en/ru/he dictionary has the same keys, the same {placeholders}, and no empty values.
// Usage: npm run test:i18n   (prints English-identical ru/he values as warnings with I18N_VERBOSE=1)
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

const LANGS = ["en", "ru", "he"] as const;
const files = ["client/src/lib/i18n.tsx", ...readdirSync("client/src/lib").filter(f => f.endsWith("-copy.ts") && f !== "grocery-shopping-copy.ts" /* [en, ru, he] tuples: tsc checks them */).map(f => `client/src/lib/${f}`)];
type Dict = Map<string, string | null>; // null = not a plain string (function, template with values)

function dictOf(node: ts.Node, sf: ts.SourceFile): Dict | null {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  if (!ts.isObjectLiteralExpression(node)) return null;
  const d: Dict = new Map();
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p)) { d.set(`...${p.expression.getText(sf)}`, null); continue; }
    if (!p.name) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf);
    const v = ts.isPropertyAssignment(p) ? p.initializer : null;
    d.set(key, v && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) ? v.text : null);
  }
  return d;
}

const problems: string[] = []; const same: string[] = [];
let groups = 0;
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1].toLowerCase()));

for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const sets: Record<string, Dict>[] = [];
  // Top-level `const en = {...}; const ru = {...}`
  const top: Record<string, Dict> = {};
  // Any object literal with en/ru/he properties, at any depth.
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && (LANGS as readonly string[]).includes(n.name.text) && n.initializer && n.parent.parent.parent === sf) {
      const d = dictOf(n.initializer, sf); if (d) top[n.name.text] = d;
    }
    if (ts.isObjectLiteralExpression(n)) {
      const byLang: Record<string, Dict> = {};
      for (const p of n.properties) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && (LANGS as readonly string[]).includes(p.name.text)) { const d = dictOf(p.initializer, sf); if (d) byLang[p.name.text] = d; }
      if (Object.keys(byLang).length) sets.push(byLang);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (Object.keys(top).length) sets.push(top);

  for (const set of sets) {
    const where = `${file}:${[...(set.en ?? set.ru ?? set.he).keys()].slice(0, 2).join(",")}`;
    const missingLang = LANGS.filter(l => !set[l]);
    // Small {en, ru, he} records whose values are plain strings (e.g. one label) are dictionaries too.
    if (missingLang.length) { problems.push(`${where}: no ${missingLang.join("/")} dictionary`); continue; }
    groups++;
    const en = set.en;
    for (const l of ["ru", "he"] as const) {
      for (const k of en.keys()) if (!set[l].has(k)) problems.push(`${file}: ${l} missing "${k}"`);
      for (const k of set[l].keys()) if (!en.has(k)) problems.push(`${file}: ${l} has extra "${k}"`);
      for (const [k, v] of set[l]) {
        const e = en.get(k);
        if (v === "" ) problems.push(`${file}: ${l} "${k}" is empty`);
        if (typeof v === "string" && typeof e === "string") {
          // A translation keeps every English placeholder (case-insensitive: {Meal} is passed beside {meal}); it may add one (Russian "one" also covers 21, 31…).
          const lost = [...placeholders(e)].filter(x => !placeholders(v).has(x));
          if (lost.length) problems.push(`${file}: ${l} "${k}" drops {${lost.join(",")}}`);
          if (v === e && /[a-z]{3}/.test(e)) same.push(`${file}: ${l} "${k}" = "${e}"`);
          if (l === "he" && /[a-z]{4}/i.test(v) && !/[֐-׿]/.test(v)) same.push(`${file}: he "${k}" has no Hebrew: "${v}"`);
          if (l === "ru" && /[a-z]{4}/i.test(v) && !/[Ѐ-ӿ]/.test(v)) same.push(`${file}: ru "${k}" has no Cyrillic: "${v}"`);
        }
      }
    }
  }
}

console.log(`${files.length} files, ${groups} dictionaries`);
if (process.env.I18N_VERBOSE || problems.length === 0) for (const s of [...new Set(same)]) console.log(`  note: ${s}`);
for (const p of problems) console.log(`  FAIL: ${p}`);
assert.equal(problems.length, 0, `${problems.length} translation problems`);
console.log("i18n dictionaries OK");
