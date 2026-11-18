-- Account profile: an optional display name and photo. The photo is a resized JPEG data URL, like grocery pictures.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "display_name" varchar(60);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "photo" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "photo_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_photo" CHECK ("accounts"."photo" IS NULL OR length("accounts"."photo") <= 280023);
