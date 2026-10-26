-- New policy: actual factory output may exceed ordered quantity.
-- Preserve original ordered quantities, receipts and all history.
ALTER TABLE production_order_items
  DROP CONSTRAINT production_order_items_check;
ALTER TABLE production_order_items
  ADD CONSTRAINT production_order_items_received_check CHECK (received >= 0);
