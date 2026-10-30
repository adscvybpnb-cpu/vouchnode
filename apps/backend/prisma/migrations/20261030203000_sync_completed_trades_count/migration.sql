UPDATE "User" AS merchant
SET "completedTradesCount" = (
  SELECT COUNT(*)::INTEGER
  FROM "Order" AS completed_order
  WHERE completed_order."sellerId" = merchant.id
    AND completed_order.status = 'COMPLETED'
);

CREATE OR REPLACE FUNCTION update_completed_trades_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'COMPLETED' THEN
      UPDATE "User"
      SET "completedTradesCount" = "completedTradesCount" + 1
      WHERE id = NEW."sellerId";
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'COMPLETED' THEN
      UPDATE "User"
      SET "completedTradesCount" = GREATEST("completedTradesCount" - 1, 0)
      WHERE id = OLD."sellerId";
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'COMPLETED'
     AND (NEW.status <> 'COMPLETED' OR NEW."sellerId" <> OLD."sellerId") THEN
    UPDATE "User"
    SET "completedTradesCount" = GREATEST("completedTradesCount" - 1, 0)
    WHERE id = OLD."sellerId";
  END IF;

  IF NEW.status = 'COMPLETED'
     AND (OLD.status <> 'COMPLETED' OR NEW."sellerId" <> OLD."sellerId") THEN
    UPDATE "User"
    SET "completedTradesCount" = "completedTradesCount" + 1
    WHERE id = NEW."sellerId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_completed_trades_count
AFTER INSERT OR UPDATE OF status, "sellerId" OR DELETE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION update_completed_trades_count();
