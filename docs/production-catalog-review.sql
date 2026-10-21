-- READ ONLY. Run in the PRODUCTION database's SQL editor.
-- Returns counts only; does not publish, seed, update, or delete anything.
-- Compares API-visible content with the 12 reviewed dinner recipes.
-- Validated against the isolated local catalog, NOT against production.
-- Exact reviewed-only catalog: 12 total, 12 matches, 0 changed, 0 other, 0 missing.
WITH expected(id, content_hash) AS (VALUES
  ('tablewise:dinner:v1:tomato-pasta', 'b69af26e8b16b6b6fa1a0102141be80f'),
  ('tablewise:dinner:v1:oven-baked-chicken', '83c5a4ab67076e4c12135e6812002129'),
  ('tablewise:dinner:v1:vegetable-fried-rice', '76e3baf7b40de056584b94cd9f4219de'),
  ('tablewise:dinner:v1:baked-salmon', 'a45da714986601ecc22535f07922f5a5'),
  ('tablewise:dinner:v1:chicken-stir-fry', '9c373426962f48c557ac8484302ce3f9'),
  ('tablewise:dinner:v1:vegetable-omelet', '169a7e36fe243d5ef0c49b5969f39000'),
  ('tablewise:dinner:v1:beef-tacos', '14f22a0abb608834561bbcd643111701'),
  ('tablewise:dinner:v1:lentil-soup', 'bf9041dc58834cc7f78256b6190c71d3'),
  ('tablewise:dinner:v1:chicken-and-rice', '9599093f95554ac384f6d4c549c2c387'),
  ('tablewise:dinner:v1:roasted-vegetables-with-potatoes', '6a6187824539dbacfae0101bd7766c8e'),
  ('tablewise:dinner:v1:homemade-pizza', '278c035dc5e004ac90f3c9c11efd763a'),
  ('tablewise:dinner:v1:pasta-with-mushrooms', 'a476157fa02044d45bb4bc769068a2e4')
), reviewed AS (
  SELECT e.content_hash,
    md5(jsonb_build_array(r.id, r.title, r.ingredients, r.steps, r.image,
      r.source_url, r.cook_time, r.servings, r.tags)::text) AS actual_hash
  FROM public.recipes r
  LEFT JOIN expected e ON e.id = r.id
)
SELECT
  count(*) AS total_recipes,
  count(*) FILTER (WHERE content_hash = actual_hash) AS reviewed_exact_matches,
  count(*) FILTER (WHERE content_hash IS NOT NULL AND content_hash <> actual_hash) AS changed_reviewed_recipes,
  count(*) FILTER (WHERE content_hash IS NULL) AS other_recipes,
  (SELECT count(*) FROM expected e
    WHERE NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = e.id)) AS missing_reviewed_recipes
FROM reviewed;
