-- Two hand-made Spanish recipes with en, ru and he rows, to test the recipe_translations design.
-- Local only: docker compose exec -T db psql -U tablewise -d tablewise < script/sample-recipe-translations.sql
-- Safe to re-run. No tags, so the Week never suggests them. Remove: run only the DELETE line.
-- Do not run script/db-dump.sh while they exist, or they enter the seed.
DELETE FROM recipes WHERE id IN ('a0e5a000-0000-4000-8000-000000000001', 'a0e5a000-0000-4000-8000-000000000002');

INSERT INTO recipes (id, title, language, ingredients, ingredient_parts, steps, prep_time, cook_time, servings, credit_kind, credit_name) VALUES
('a0e5a000-0000-4000-8000-000000000001', 'Tortilla de patatas', 'es',
 ARRAY['4 patatas medianas', '6 huevos', '1 cebolla', '120 ml de aceite de oliva', 'Sal al gusto'],
 '[{"originalText":"4 patatas medianas","quantity":4,"unit":null,"ingredient":"patatas medianas"},
   {"originalText":"6 huevos","quantity":6,"unit":null,"ingredient":"huevos"},
   {"originalText":"1 cebolla","quantity":1,"unit":null,"ingredient":"cebolla"},
   {"originalText":"120 ml de aceite de oliva","quantity":120,"unit":"ml","ingredient":"aceite de oliva"},
   {"originalText":"Sal al gusto","quantity":null,"unit":null,"ingredient":"Sal al gusto"}]',
 ARRAY['Pela las patatas y córtalas en láminas finas.',
       'Corta la cebolla en juliana.',
       'Fríe las patatas y la cebolla en el aceite a fuego medio durante 20 minutos.',
       'Bate los huevos con la sal y mezcla con las patatas escurridas.',
       'Cuaja la tortilla 3 minutos por cada lado.'],
 15, 30, '4', 'mine', 'Abuela Carmen'),
('a0e5a000-0000-4000-8000-000000000002', 'Tarta de manzana', 'es',
 ARRAY['3 manzanas', '200 g de harina', '100 g de mantequilla fría', '2 cucharadas de azúcar', '1 huevo', 'Una pizca de canela'],
 '[{"originalText":"3 manzanas","quantity":3,"unit":null,"ingredient":"manzanas"},
   {"originalText":"200 g de harina","quantity":200,"unit":"g","ingredient":"harina"},
   {"originalText":"100 g de mantequilla fría","quantity":100,"unit":"g","ingredient":"mantequilla fría"},
   {"originalText":"2 cucharadas de azúcar","quantity":2,"unit":"tbsp","ingredient":"azúcar"},
   {"originalText":"1 huevo","quantity":1,"unit":null,"ingredient":"huevo"},
   {"originalText":"Una pizca de canela","quantity":null,"unit":null,"ingredient":"Una pizca de canela"}]',
 ARRAY['Mezcla la harina con la mantequilla y el huevo hasta formar una masa.',
       'Deja reposar la masa en la nevera 30 minutos.',
       'Pela las manzanas y córtalas en gajos.',
       'Estira la masa en un molde y coloca las manzanas encima.',
       'Espolvorea el azúcar y la canela.',
       'Hornea a 180 °C durante 40 minutos.'],
 20, 40, '8', 'mine', 'Abuela Carmen');

-- ingredients[i] is the name only, written in the form that reads right after line i's quantity and unit.
INSERT INTO recipe_translations (recipe_id, language, title, ingredients, steps, translated_by) VALUES
('a0e5a000-0000-4000-8000-000000000001', 'en', 'Spanish potato omelette',
 ARRAY['medium potatoes', 'eggs', 'onion', 'olive oil', 'Salt to taste'],
 ARRAY['Peel the potatoes and slice them thinly.',
       'Slice the onion thinly.',
       'Fry the potatoes and onion in the oil over medium heat for 20 minutes.',
       'Beat the eggs with the salt and mix in the drained potatoes.',
       'Cook the omelette for 3 minutes on each side.'], 'ai'),
('a0e5a000-0000-4000-8000-000000000001', 'ru', 'Испанская тортилья с картофелем',
 ARRAY['средние картофелины', 'яиц', 'луковица', 'оливкового масла', 'Соль по вкусу'],
 ARRAY['Очистите картофель и нарежьте его тонкими ломтиками.',
       'Нарежьте лук тонкими полукольцами.',
       'Обжаривайте картофель и лук в масле на среднем огне 20 минут.',
       'Взбейте яйца с солью и смешайте с картофелем, слив лишнее масло.',
       'Жарьте тортилью по 3 минуты с каждой стороны.'], 'ai'),
('a0e5a000-0000-4000-8000-000000000001', 'he', 'טורטייה ספרדית עם תפוחי אדמה',
 ARRAY['תפוחי אדמה בינוניים', 'ביצים', 'בצל', 'שמן זית', 'מלח לפי הטעם'],
 ARRAY['קלפו את תפוחי האדמה ופרסו אותם לפרוסות דקות.',
       'פרסו את הבצל לרצועות דקות.',
       'טגנו את תפוחי האדמה והבצל בשמן על אש בינונית במשך 20 דקות.',
       'טרפו את הביצים עם המלח וערבבו עם תפוחי האדמה המסוננים.',
       'בשלו את הטורטייה 3 דקות מכל צד.'], 'ai'),
('a0e5a000-0000-4000-8000-000000000002', 'en', 'Apple tart',
 ARRAY['apples', 'flour', 'cold butter', 'sugar', 'egg', 'A pinch of cinnamon'],
 ARRAY['Mix the flour with the butter and the egg until a dough forms.',
       'Rest the dough in the fridge for 30 minutes.',
       'Peel the apples and cut them into wedges.',
       'Roll out the dough in a tin and arrange the apples on top.',
       'Sprinkle with the sugar and cinnamon.',
       'Bake at 180 °C for 40 minutes.'], 'ai'),
('a0e5a000-0000-4000-8000-000000000002', 'ru', 'Яблочный тарт',
 ARRAY['яблока', 'муки', 'холодного сливочного масла', 'сахара', 'яйцо', 'Щепотка корицы'],
 ARRAY['Смешайте муку с маслом и яйцом до образования теста.',
       'Уберите тесто в холодильник на 30 минут.',
       'Очистите яблоки и нарежьте их дольками.',
       'Раскатайте тесто в форме и выложите сверху яблоки.',
       'Посыпьте сахаром и корицей.',
       'Выпекайте при 180 °C 40 минут.'], 'ai'),
('a0e5a000-0000-4000-8000-000000000002', 'he', 'טארט תפוחים',
 ARRAY['תפוחים', 'קמח', 'חמאה קרה', 'סוכר', 'ביצה', 'קורט קינמון'],
 ARRAY['ערבבו את הקמח עם החמאה והביצה עד לקבלת בצק.',
       'העבירו את הבצק למקרר ל-30 דקות.',
       'קלפו את התפוחים וחתכו אותם לפלחים.',
       'רדדו את הבצק בתבנית וסדרו מעליו את התפוחים.',
       'פזרו מעל את הסוכר והקינמון.',
       'אפו ב-180 מעלות במשך 40 דקות.'], 'ai');

-- Check 1: every translation has as many lines as its original. Expect 0 rows.
SELECT r.title, t.language FROM recipe_translations t JOIN recipes r ON r.id = t.recipe_id
WHERE cardinality(t.ingredients) <> cardinality(r.ingredients) OR cardinality(t.steps) <> cardinality(r.steps);

-- Check 2: what a Russian reader would see (quantity and unit codes + translated name).
SELECT t.title, concat_ws(' ', p->>'quantity', p->>'unit', t.ingredients[n]) AS ingredient
FROM recipe_translations t JOIN recipes r ON r.id = t.recipe_id
CROSS JOIN LATERAL generate_subscripts(t.ingredients, 1) AS n
CROSS JOIN LATERAL (SELECT r.ingredient_parts -> (n - 1) AS p) part
WHERE t.language = 'ru' ORDER BY t.title, n;
