-- Makes the gluten-free book recipes the only catalog recipes. Cascades to likes, cooking sessions, nutrition and translations of the removed recipes.
BEGIN;
DELETE FROM recipes WHERE id NOT LIKE 'tablewise:catalog:gf-basic:%';
COMMIT;
