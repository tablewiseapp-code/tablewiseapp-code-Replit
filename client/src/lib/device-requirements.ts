// Structured cooking-device requirements: AND of OR-groups.
//   []                              → no-cook (always compatible)
//   [["Oven", "Air fryer"]]         → Oven OR Air fryer
//   [["Oven"], ["Stovetop"]]        → Oven AND Stovetop
//   [["Oven", "Air fryer"], ["Stovetop"]] → (Oven OR Air fryer) AND Stovetop
// Inferred deterministically from the steps; explicit recipe metadata (recipe.deviceRequirements) wins.

/** Extensible registry. Only `selectable` devices appear in My Basic Settings and are detected in steps. */
export const deviceRegistry = [
  { id: "Oven", selectable: true },
  { id: "Air fryer", selectable: true },
  { id: "Stovetop", selectable: true },
  { id: "Microwave", selectable: true },
  // Future: { id: "Slow cooker", selectable: false }, { id: "Pressure cooker", selectable: false } — add a pattern below when enabled.
] as const;
export type DeviceId = typeof deviceRegistry[number]["id"];
export const selectableDevices = deviceRegistry.filter(d => d.selectable).map(d => d.id) as DeviceId[];
export type DeviceRequirements = DeviceId[][];

// Device nouns. Cooking verbs below only count when a sentence names no device ("Simmer in a saucepan or the
// microwave" is one either/or choice, not Stovetop AND (Stovetop OR Microwave)).
const nouns: Record<DeviceId, RegExp> = {
  "Air fryer": /\bair[- ]?fr(y|yer|yers|ied|ying)\b/g,
  Microwave: /\bmicrowav\w*/g,
  Oven: /\boven\b|\bgrill\b(?! pan)/g, // UK "grill" is part of the oven
  Stovetop: /\b(hob|stove|stovetop|burner|saucepan|frying pan|skillet|wok|griddle|grill pan|pot)\b|\bover (a )?(very )?(low|medium|high|gentle|moderate)(-high|-low)? heat\b/g,
};
const verbs: Partial<Record<DeviceId, RegExp>> = {
  Oven: /\b(bake|baking|roast|roasting)\b(?! (powder|soda|paper|parchment|beans|tray|sheet|dish|tin))/g,
  Stovetop: /\b(dry[- ]roast\w*|simmer\w*|boil\w*|sauté\w*|saute\w*|stir[- ]fr\w*|fry|fries|fried|frying|deep[- ]fr\w*|poach\w*|scrambl\w*)\b/g,
};
// Mentions that don't make a device mandatory: storage, reheating leftovers, optional extras.
const incidental = /\b(leftovers?|reheat\w*|re-heat\w*|store|storing|freez\w*|fridge|refrigerat\w*|optional(ly)?|if you like|if you prefer|if you have|keep warm|to serve)\b/;
const alternative = /^(alternatively|or)\b/;

type Mention = { device: DeviceId; index: number };
function find(text: string, table: Partial<Record<DeviceId, RegExp>>): Mention[] {
  const found: Mention[] = [];
  for (const device of ["Air fryer", "Microwave", "Stovetop", "Oven"] as DeviceId[]) {
    const re = table[device];
    if (!re) continue;
    for (const match of text.matchAll(re)) found.push({ device, index: match.index! });
    text = text.replace(re, m => " ".repeat(m.length)); // a word counts for one device only ("air fryer" is not "fry")
  }
  return found;
}
function mentions(sentence: string): Mention[] {
  const text = sentence.replace(/\b(pour|with|cover with|add) (the )?boiling water\b/g, m => " ".repeat(m.length)).replace(/\bkettle\b/g, "      ");
  const named = find(text, nouns);
  const masked = named.length ? text.replace(/\bair[- ]?fr\w*/g, m => " ".repeat(m.length)) : text;
  return (named.length ? named : find(masked, verbs)).sort((a, b) => a.index - b.index);
}

/** Groups devices mentioned in one sentence: devices joined by "or" are alternatives, others are each required. */
function sentenceGroups(sentence: string, found: Mention[]): DeviceId[][] {
  const groups: DeviceId[][] = [];
  for (const [i, m] of found.entries()) {
    const previous = found[i - 1];
    const between = previous ? sentence.slice(previous.index, m.index) : "";
    if (previous && /\bor\b/.test(between) && !/[.;]/.test(between)) groups[groups.length - 1].push(m.device);
    else groups.push([m.device]);
  }
  return groups.map(g => [...new Set(g)]);
}

export function inferDeviceRequirements(steps: readonly string[]): DeviceRequirements {
  const groups: DeviceId[][] = [];
  const sentences = steps.flatMap(step => step.toLowerCase().split(/(?<=[.!?;])\s+/));
  for (const sentence of sentences) {
    if (incidental.test(sentence)) continue;
    const found = mentions(sentence);
    if (!found.length) continue;
    const local = sentenceGroups(sentence, found);
    // "Alternatively, use the air fryer…" extends the previous sentence's requirement instead of adding one.
    if (alternative.test(sentence.trim()) && groups.length) {
      groups[groups.length - 1] = [...new Set([...groups[groups.length - 1], ...local.flat()])];
    } else groups.push(...local);
  }
  return normalize(groups);
}

/** Canonical form: dedupe, and drop an OR-group that another requirement already implies
 * (absorption: "Stovetop AND (Stovetop OR Microwave)" is just "Stovetop"). Ambiguous single mentions stay required. */
export function normalize(groups: DeviceId[][]): DeviceRequirements {
  const unique = new Map<string, DeviceId[]>();
  for (const group of groups) {
    const sorted = selectableDevices.filter(d => group.includes(d));
    if (sorted.length) unique.set(sorted.join("|"), sorted);
  }
  const list = [...unique.values()];
  const implied = (g: DeviceId[]) => list.some(other => other !== g && other.length < g.length && other.every(d => g.includes(d)));
  const rank = (g: DeviceId[]) => g.map(d => selectableDevices.indexOf(d)).join(",");
  return list.filter(g => !implied(g)).sort((a, b) => a.length - b.length || rank(a).localeCompare(rank(b)));
}

/** Explicit metadata, if a recipe carries it, overrides inference. */
export function deviceRequirementsOf(recipe: { steps: readonly string[]; deviceRequirements?: DeviceRequirements | null }): DeviceRequirements {
  return recipe.deviceRequirements ? normalize(recipe.deviceRequirements) : inferDeviceRequirements(recipe.steps);
}

export const satisfiesDevices = (requirements: DeviceRequirements, available: readonly string[]) =>
  requirements.every(group => group.some(device => available.includes(device)));

/** Devices in a requirement that the person is missing, per unmet group (for "needs Oven or Air fryer"). */
export const unmetGroups = (requirements: DeviceRequirements, available: readonly string[]) =>
  requirements.filter(group => !group.some(device => available.includes(device)));
