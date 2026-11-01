-- Reviewed development-only setup. Never run automatically at startup/publish.
CREATE TABLE IF NOT EXISTS recipe_nutrition (
  recipe_id varchar PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  input_hash varchar(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
