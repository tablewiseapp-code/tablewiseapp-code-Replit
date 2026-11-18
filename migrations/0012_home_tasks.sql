-- Home Tasks: private household to-dos and a shared catalog of suggested task names.
CREATE TABLE IF NOT EXISTS "home_tasks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_id" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "due_date" date,
  "priority" varchar(8) NOT NULL,
  "image" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "home_tasks_name" CHECK (length("name") BETWEEN 1 AND 120),
  CONSTRAINT "home_tasks_priority" CHECK ("priority" IN ('high','normal','low')),
  CONSTRAINT "home_tasks_image" CHECK ("image" IS NULL OR length("image") <= 280023)
);
CREATE INDEX IF NOT EXISTS "home_tasks_owner" ON "home_tasks" USING btree ("owner_id");
CREATE TABLE IF NOT EXISTS "household_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "names" jsonb NOT NULL
);
INSERT INTO "household_tasks" (id, names) VALUES ('do-laundry', '{"en": "Do laundry", "ru": "Постирать бельё", "he": "לעשות כביסה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('fold-laundry', '{"en": "Fold laundry", "ru": "Сложить бельё", "he": "לקפל כביסה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('iron-clothes', '{"en": "Iron clothes", "ru": "Погладить одежду", "he": "לגהץ בגדים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('change-bed-sheets', '{"en": "Change bed sheets", "ru": "Поменять постельное бельё", "he": "להחליף מצעים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('wash-dishes', '{"en": "Wash the dishes", "ru": "Помыть посуду", "he": "לשטוף כלים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('run-dishwasher', '{"en": "Run the dishwasher", "ru": "Запустить посудомойку", "he": "להפעיל מדיח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('empty-dishwasher', '{"en": "Empty the dishwasher", "ru": "Разгрузить посудомойку", "he": "לרוקן מדיח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('take-out-trash', '{"en": "Take out the trash", "ru": "Вынести мусор", "he": "להוציא את הזבל"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('take-out-recycling', '{"en": "Take out the recycling", "ru": "Вынести вторсырьё", "he": "להוציא מחזור"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('vacuum', '{"en": "Vacuum", "ru": "Пропылесосить", "he": "לשאוב אבק"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('mop-floors', '{"en": "Mop the floors", "ru": "Помыть полы", "he": "לשטוף רצפה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('dust', '{"en": "Dust the furniture", "ru": "Вытереть пыль", "he": "לנגב אבק"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-bathroom', '{"en": "Clean the bathroom", "ru": "Убрать ванную", "he": "לנקות את חדר האמבטיה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-toilet', '{"en": "Clean the toilet", "ru": "Почистить унитаз", "he": "לנקות את האסלה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-kitchen', '{"en": "Clean the kitchen", "ru": "Убрать кухню", "he": "לנקות את המטבח"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-fridge', '{"en": "Clean the fridge", "ru": "Помыть холодильник", "he": "לנקות את המקרר"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-oven', '{"en": "Clean the oven", "ru": "Почистить духовку", "he": "לנקות את התנור"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-windows', '{"en": "Clean the windows", "ru": "Помыть окна", "he": "לנקות חלונות"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('water-plants', '{"en": "Water the plants", "ru": "Полить цветы", "he": "להשקות את העציצים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('feed-pets', '{"en": "Feed the pets", "ru": "Покормить питомцев", "he": "להאכיל את חיות המחמד"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('walk-dog', '{"en": "Walk the dog", "ru": "Выгулять собаку", "he": "להוציא את הכלב"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('clean-litter-box', '{"en": "Clean the litter box", "ru": "Убрать кошачий лоток", "he": "לנקות ארגז חול"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-electricity-bill', '{"en": "Pay electricity bill", "ru": "Оплатить счёт за электричество", "he": "לשלם חשבון חשמל"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-water-bill', '{"en": "Pay water bill", "ru": "Оплатить счёт за воду", "he": "לשלם חשבון מים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('pay-rent', '{"en": "Pay rent", "ru": "Оплатить аренду", "he": "לשלם שכר דירה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('change-light-bulb', '{"en": "Change a light bulb", "ru": "Заменить лампочку", "he": "להחליף נורה"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('replace-water-filter', '{"en": "Replace the water filter", "ru": "Заменить фильтр для воды", "he": "להחליף פילטר מים"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('tidy-living-room', '{"en": "Tidy the living room", "ru": "Прибраться в гостиной", "he": "לסדר את הסלון"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('make-beds', '{"en": "Make the beds", "ru": "Заправить кровати", "he": "לסדר את המיטות"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('sort-mail', '{"en": "Sort the mail", "ru": "Разобрать почту", "he": "למיין את הדואר"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('declutter-closet', '{"en": "Declutter the closet", "ru": "Разобрать шкаф", "he": "לסדר את הארון"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
INSERT INTO "household_tasks" (id, names) VALUES ('wash-car', '{"en": "Wash the car", "ru": "Помыть машину", "he": "לשטוף את הרכב"}'::jsonb) ON CONFLICT (id) DO UPDATE SET names = EXCLUDED.names;
