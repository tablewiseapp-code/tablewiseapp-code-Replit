-- Accounts: email and password sign-in. An account points at one owner; guests keep working without one.
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(254) NOT NULL,
  "password_hash" text,
  "owner_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_email_unique" UNIQUE("email"),
  CONSTRAINT "accounts_owner_id_unique" UNIQUE("owner_id")
);
CREATE TABLE IF NOT EXISTS "account_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL CONSTRAINT "account_sessions_account_id_accounts_id_fk" REFERENCES "accounts"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_sessions_account" ON "account_sessions" USING btree ("account_id");
