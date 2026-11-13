# TableWise catalog v1 — recipe authoring spec

Recipes are **original TableWise recipes**, written independently from general
cooking knowledge. Do not reproduce any published recipe's wording, headnotes
or distinctive step sequence. Common dish names and standard techniques are fine.

## Output file format

A JSON array. Each element:

```json
{
  "slug": "chicken-fajitas",
  "title": "Chicken fajitas",
  "category": "Dinner",
  "cuisine": "Mexican",
  "tags": ["Chicken", "Kid friendly"],
  "prepTime": 15,
  "cookTime": 15,
  "servings": "4",
  "ingredients": [
    { "quantity": 600, "unit": "g", "name": "chicken breast", "note": "thinly sliced" },
    { "quantity": 2, "unit": "", "name": "bell peppers", "note": "sliced" },
    { "quantity": 8, "unit": "", "name": "small flour tortillas" },
    { "quantity": 100, "unit": "g", "name": "soured cream", "optional": true }
  ],
  "steps": ["Heat the oil in a large frying pan over medium-high heat. ..."]
}
```

### Fields
- `slug`: use exactly the slug you were assigned. Lowercase kebab-case.
- `title`: use the assigned title (sentence case).
- `category`: exactly the assigned category: `Dinner`, `Lunch`, `Breakfast`, `Dessert`, `Snack` or `Soup`.
- `cuisine`: one of `American, British, Caribbean, Chinese, French, Greek, Indian, Italian, Japanese, Korean, Mediterranean, Mexican, Middle Eastern, North African, Scandinavian, Spanish, Thai, Vietnamese, Eastern European, International`.
- `tags`: zero or more from this list only:
  `Chicken, Turkey, Beef, Pork, Lamb, Fish, Seafood, Vegetarian, Vegan, Gluten-free, Dairy-free, Kid friendly, Budget, Batch cooking, Pasta, Rice, Potatoes, Noodles, Eggs, Baking`.
  Do NOT add the category or "Quick" — the build adds them.
- `prepTime`, `cookTime`: integer minutes, realistic for a home cook. `cookTime` may be 0 for no-cook. Put chilling/setting/marinating/rising time in the steps, not in these fields.
- `servings`: a numeric string, normally `"4"`. Baked goods may use e.g. `"12"` (no words).

### Ingredients (metric, UK/Commonwealth home-cook wording)
- `quantity`: a positive number (decimals up to 2 places: `0.5`, `0.25`, `1.5`). Required for every ingredient, including salt/pepper (use `tsp` or `pinch`).
- `unit`: one of `g, kg, ml, l, tsp, tbsp, pinch, clove, cloves, slice, slices, sprig, sprigs, sheet, sheets`, or `""` for a plain count (`2` `""` `eggs`).
- `name`: the ingredient as bought (`chicken thighs, boneless and skinless` is fine as `name: "boneless skinless chicken thighs"`). Plural for count > 1.
- `note`: optional prep note (`diced`, `grated`, `drained and rinsed`).
- `optional`: `true` only for garnishes/serving extras. Essential components are never optional.
- **No digits anywhere in `name` or `note`** (the app scales the leading quantity and refuses lines with a second number). Put sizes like "2 cm cubes" in the steps instead ("cut into 2 cm cubes").
- No vague essential ingredients ("some chicken", "vegetables as needed", "to taste" without a quantity).
- Canned goods by drained/net weight in g (`400 g canned chopped tomatoes`, `240 g canned chickpeas` + note `drained and rinsed`).
- Rice/pasta/grains by dry weight. Stock in ml.

### Steps
- 4–9 steps, each a complete instruction (1–3 sentences), in order. Include every essential action.
- Temperatures in °C (conventional oven; you may add "(fan X°C)"). Realistic times. Clear doneness cues.
- Name the equipment so it is identifiable: e.g. "large frying pan", "saucepan", "large pot", "mixing bowl", "baking tray", "oven", "knife", "blender", "grill". Every recipe must mention at least one such word.
- Food safety (use these numbers):
  - Poultry and turkey mince: cook until the thickest part reaches 74°C and juices run clear.
  - Minced beef/pork/lamb: 71°C, no pink remaining.
  - Whole cuts of beef/pork/lamb: at least 63°C, rest 3 minutes.
  - Fish: 63°C or flesh opaque and flakes easily. Prawns: pink and opaque throughout.
  - Egg-based bakes/casseroles: set in the centre (71°C). No raw or lightly cooked eggs in desserts unless pasteurised eggs are specified.
  - Cooked rice for later use: cool within 1 hour, refrigerate, eat within 24 hours; reheat until steaming hot.
  - Wash hands and boards after handling raw meat where relevant.
- Leftovers / batch notes are welcome in the final step where useful.

### Dietary tags — only when TRUE for every ingredient as written
- `Vegetarian`: no meat, poultry, fish, seafood, gelatine, fish sauce, oyster sauce, anchovies, Worcestershire sauce, meat/fish stock, lard. Hard Italian cheese must be written as `vegetarian hard cheese` (traditional Parmesan uses animal rennet).
- `Vegan`: Vegetarian plus no milk, butter, cream, cheese, yogurt, eggs, honey, mayonnaise, ghee (plant versions must say `plant-based` / `oat milk` / `coconut yogurt` etc.).
- `Gluten-free`: no wheat flour, bread, pasta, couscous, bulgur, barley, rye, spelt, semolina, breadcrumbs, pastry, flour tortillas, noodles (except `rice noodles`), beer, malt. Packaged items that commonly contain gluten must be written as gluten-free: `gluten-free stock`, `tamari (gluten-free soy sauce)`, `gluten-free oats`, `gluten-free baking powder`, `gluten-free pasta`. `cornflour`, `rice flour`, `corn tortillas` are fine.
- `Dairy-free`: no milk, butter, cream, cheese, yogurt, ghee, crème fraîche, buttermilk, milk chocolate. Plant alternatives must be explicit (`oat milk`, `coconut milk`, `dairy-free spread`, `dairy-free dark chocolate`).
- If unsure, leave the tag off. A wrong dietary tag is a build failure.

### Title pitfalls (the planner infers meal slot from titles)
Titles must not contain these substrings unless the category is Breakfast: `oat`, `toast`, `omelet`, `breakfast` (watch "goat", "coated", "float").
Titles must not contain `wrap`, `salad`, `sandwich`, `lunch` unless the category is Lunch.
If an assigned title breaks this, keep the slug and adjust the title minimally.

### Quality
Family-oriented home cooking, supermarket ingredients, sensible portions (main
meals ~120–180 g protein per adult serving), affordable where possible.
Write in a friendly, plain, imperative style. Spelling: British English.
