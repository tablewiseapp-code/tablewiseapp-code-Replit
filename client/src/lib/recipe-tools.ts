const equipment = [
  { label: "toolOven", pattern: /\boven\b/i },
  { label: "toolStovetop", pattern: /\b(?:stove|stovetop|hob|burner)\b/i },
  { label: "toolPan", pattern: /\b(?:pan|skillet|wok)\b/i },
  { label: "toolPot", pattern: /\b(?:pot|saucepan)\b/i },
  { label: "toolBowl", pattern: /\bbowl\b/i },
  { label: "toolTray", pattern: /\b(?:baking (?:tray|sheet|dish)|sheet pan|roasting (?:tin|dish|pan)|ovenproof dish)\b/i },
  { label: "toolKnife", pattern: /\bknife\b/i },
  { label: "toolBoard", pattern: /\b(?:cutting|chopping) board\b/i },
  { label: "toolBlender", pattern: /\b(?:blender|food processor)\b/i },
  { label: "toolMicrowave", pattern: /\bmicrowave\b/i },
  { label: "toolAirFryer", pattern: /\bair[ -]?fryer\b/i },
] as const;

export type RecipeToolKey = typeof equipment[number]["label"];

// Report equipment supported by the instructions, not a default "No-cook" guess.
export function recipeToolKeys(steps: string[]): RecipeToolKey[] {
  const text = steps.join(" ");
  return equipment.filter(tool => tool.pattern.test(text)).map(tool => tool.label);
}
