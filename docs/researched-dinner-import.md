# Researched dinner catalog

## What is ready

Twelve real recipes were checked against their publishers on 2026-10-21. The development database and running preview use these twelve records, not the earlier synthetic dinner fixtures. Production has a separate database: publishing code does **not** import these records.

- Canonical human-readable data: `server/seeds/researched-dinners.json`
- Production **data-only** import: `imports/researched-dinners.sql`
- Review copies: `imports/researched-dinners.json` and `imports/researched-dinners.csv`
- Regenerate those copies with `npm run recipes:prepare-import`.

Existing production recipes are kept. With the three existing recipes, the additive import produces **15 total recipes**, including **12 researched dinners**.

## Sources and published values

Times are minutes. Total time is preparation plus cooking; neither field is guessed from the instructions.

| Recipe and publisher | Yield | Preparation | Cooking | Total |
|---|---|---:|---:|---:|
| [Easy chicken curry — Good Food](https://www.bbcgoodfood.com/recipes/easy-chicken-curry) | 4 | 5 | 45 | 50 |
| [Salmon egg-fried rice — Good Food](https://www.bbcgoodfood.com/recipes/salmon-egg-fried-rice) | 2–3 | 10 | 10 | 20 |
| [Lentil soup — Good Food](https://www.bbcgoodfood.com/recipes/lentil-soup) | 4 | 10 | 60 | 70 |
| [Baked salmon — Good Food](https://www.bbcgoodfood.com/recipes/baked-salmon) | 4 | 5 | 15 | 20 |
| [Coconut curry chickpeas — Budget Bytes](https://www.budgetbytes.com/coconut-curry-chickpeas/) | 4 | 10 | 25 | 35 |
| [One-pot creamy sun-dried tomato pasta — Budget Bytes](https://www.budgetbytes.com/one-pot-creamy-sun-dried-tomato-pasta/) | 4 | 10 | 20 | 30 |
| [Hearty black bean quesadillas — Budget Bytes](https://www.budgetbytes.com/hearty-black-bean-quesadillas/) | 10 quesadillas | 5 | 10 | 15 |
| [Spanish omelette — Good Food](https://www.bbcgoodfood.com/recipes/spanish-omelette) | 3–4 | 10 | 30 | 40 |
| [Easy tuna pasta bake — Good Food](https://www.bbcgoodfood.com/recipes/easy-tuna-pasta-bake) | 4 | 10 | 20 | 30 |
| [Garlic butter baked chicken thighs — Budget Bytes](https://www.budgetbytes.com/garlic-butter-baked-chicken-thighs/) | 5 | 5 | 35 | 40 |
| [Beef & Sichuan pepper stir-fry — Good Food](https://www.bbcgoodfood.com/recipes/beef-sichuan-pepper-stir-fry) | 4 | 10 | 10 | 20 |
| [Spaghetti and meatballs — Good Food](https://www.bbcgoodfood.com/recipes/meatballs-spaghetti) | 6 | 30 | 45 | 75 |

Ingredient quantities follow the sources, including their original units and unspecified amounts such as salt to taste. Optional accompaniments remain optional and are not assigned invented quantities. The lentil soup selects the publisher's vegetable-stock option. The pasta with chicken broth is not labelled vegetarian. Sausages are not assigned an unverified meat species.

Cooking water remains quantified in the method rather than being added to the shopping ingredients.

Yield ranges are retained. Ten quesadillas are not relabelled as ten people. Quesadilla skillet batches may take longer than the published cooking time; the Spanish omelette's published time is also an estimate, not a measured kitchen result. Pre-cooked rice is specified where the sources use it; no rice-cooking duration is silently added.

Instructions are concise, independently worded method summaries, with source links for the full originals. No publisher photographs are copied. These recipes were source-checked, **not kitchen-tested or nutritionally/allergen-certified**.

Equipment is identified from explicit tool names in the saved instructions. It appears in the main planner and advanced planner. It is not a new database column or a claim that every possible utensil is listed.

## Production steps for the owner

Agent production database access is read-only. The production write must be performed by the owner.

1. **Publish the app with its development schema change.** Review the schema difference: the intended change is the nullable `recipes.prep_time` integer and its allowed-duration check. No production schema script or startup migration is supplied. If other changes are proposed, review them separately.
2. **Do not select any option to overwrite production data with development data.** Development contains twelve researched dinners; overwriting would lose the three original production recipes.
3. Open `imports/researched-dinners.sql` in the Files pane and copy its **entire** contents.
4. Open Replit's Database tool, select **Production**, and use its SQL query editor to run the complete copied SQL. This is an additive data import, not a schema migration.
5. Its final result should be:

   ```text
   total_recipes | researched_dinners | preserved_other_recipes
   15            | 12                 | 3
   ```

6. Reload the published app. `/api/recipes` should return fifteen recipes; each new recipe has ingredients, instructions, source URL, preparation/cooking times and yield. The original three recipes are not modified to invent missing metadata.

The import uses stable IDs, a transaction and a brief write lock. A repeated identical import adds nothing. A changed existing import ID, duplicate source under another ID, or missing preparation-time column raises an error rather than overwriting data. If the SQL editor retains a failed transaction, run `ROLLBACK;` before addressing the error and retrying. Do not remove the safety checks.

## Verification

`npm run test:researched-import -- --test-socket /tmp/tablewise-phase2-pilot/socket`

This test only accepts the verified isolated socket-only database. In a disposable schema it verifies:

- missing-column failure without inserting records;
- twelve complete recipe records and fifteen total with three existing fixtures;
- byte-for-byte preservation of pre-existing records, including timestamps;
- repeated import without duplicates or timestamp changes;
- complete rollback if an existing imported record was edited.

`npm run dev:researched` verifies these twelve approved records before starting preview. It also permits unrelated legitimate records and separately validates a recognized full synthetic test batch, if present; see `docs/development-test-recipes.md`. It disables AI calls, operator mutations and pilot-event collection. It does not seed or migrate at startup, and content validation alone is not proof of database isolation.

The browser checks also support this researched catalog:

```text
npm run test:mvp-browser -- "https://$REPLIT_DEV_DOMAIN"
npm run test:meals-timing-browser -- "https://$REPLIT_DEV_DOMAIN"
```

The older synthetic seed and isolated-preview commands remain separate for their original regression tests; they are not the production import.
