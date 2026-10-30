-- Reviewed additive development migration. No startup or deployment hook.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS credit_kind text;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS credit_name varchar(120);
DO $credit$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recipes'::regclass AND conname = 'recipes_credit_check') THEN
    ALTER TABLE public.recipes ADD CONSTRAINT recipes_credit_check CHECK (
      (credit_kind IS NULL AND credit_name IS NULL) OR
      (credit_kind IS NOT NULL AND credit_kind IN ('chef', 'mine') AND
        (credit_name IS NULL OR (length(btrim(credit_name)) BETWEEN 1 AND 120 AND credit_name = btrim(credit_name))) AND
        (credit_kind = 'mine' OR credit_name IS NOT NULL))
    );
  END IF;
END $credit$;
