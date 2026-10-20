-- One currency per event: once set (with the first ticket type), it never
-- changes, so every ticket, order, payment and refund of the event agrees.
CREATE OR REPLACE FUNCTION "event_currency_lock"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."currency" IS NOT NULL AND NEW."currency" IS DISTINCT FROM OLD."currency" THEN
    RAISE EXCEPTION 'An event''s currency cannot change once set' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "event_currency_lock"
  BEFORE UPDATE OF "currency" ON "Event"
  FOR EACH ROW EXECUTE FUNCTION "event_currency_lock"();
