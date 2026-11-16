-- Private pictures on existing grocery rows, including recipe ingredients.
CREATE TABLE "grocery_item_photos" (
  "owner_id" varchar(64) NOT NULL,
  "item_key" text NOT NULL,
  "image" text,
  CONSTRAINT "grocery_item_photos_owner_id_item_key_pk" PRIMARY KEY("owner_id", "item_key"),
  CONSTRAINT "grocery_item_photos_key" CHECK (length("item_key") BETWEEN 1 AND 12000),
  CONSTRAINT "grocery_item_photos_image" CHECK ("image" IS NULL OR length("image") <= 280023)
);
