-- My Basic Settings and Your household: one document per owner (was browser localStorage only).
CREATE TABLE IF NOT EXISTS "household_settings" (
  "owner_id" varchar(64) PRIMARY KEY NOT NULL,
  "settings" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
