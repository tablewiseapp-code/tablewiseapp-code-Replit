-- Explicit additive development migration. Never run automatically at startup.
CREATE TABLE IF NOT EXISTS "public"."pilot_events" (
  event_id uuid PRIMARY KEY,
  pilot_id uuid NOT NULL,
  event_name varchar(40) NOT NULL,
  week_start date NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  recipe_id varchar(150) NOT NULL DEFAULT '',
  CONSTRAINT pilot_events_name CHECK (event_name IN
    ('planner_opened','meal_selected','plan_completed','grocery_list_opened','next_week_plan_created')),
  CONSTRAINT pilot_events_week CHECK (extract(isodow FROM week_start) = 1 AND week_start BETWEEN '2000-01-01' AND '2100-12-31'),
  CONSTRAINT pilot_events_recipe CHECK (
    (event_name = 'meal_selected' AND recipe_id ~ '^[a-zA-Z0-9:_-]{1,150}$')
    OR (event_name <> 'meal_selected' AND recipe_id = '')),
  CONSTRAINT pilot_events_semantic UNIQUE (pilot_id, event_name, week_start, recipe_id)
);
CREATE INDEX IF NOT EXISTS pilot_events_completion ON "public"."pilot_events" (pilot_id, occurred_at, event_id) WHERE event_name = 'plan_completed';
CREATE INDEX IF NOT EXISTS pilot_events_funnel ON "public"."pilot_events" (event_name, week_start);
