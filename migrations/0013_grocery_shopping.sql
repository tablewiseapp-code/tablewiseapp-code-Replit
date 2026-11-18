CREATE TABLE grocery_shopping_items (
  owner_id varchar(64) NOT NULL,
  item_key text NOT NULL,
  skipped boolean NOT NULL DEFAULT false,
  price_cents integer,
  price_text text,
  CONSTRAINT grocery_shopping_items_owner_id_item_key_pk PRIMARY KEY (owner_id, item_key),
  CONSTRAINT grocery_shopping_items_price_check CHECK (
    (price_cents IS NULL AND price_text IS NULL) OR
    (price_cents IS NOT NULL AND price_cents BETWEEN 0 AND 10000000 AND price_text IS NOT NULL)
  )
);

ALTER TABLE grocery_extras ADD COLUMN category text;
DROP INDEX grocery_extras_owner_text;
CREATE INDEX grocery_extras_owner_text ON grocery_extras (owner_id, text);
