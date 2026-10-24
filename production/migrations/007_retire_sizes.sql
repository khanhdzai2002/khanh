-- Preserve every historical SKU, order item, receipt and immutable audit row.
-- Only new catalogue/production use is forbidden. No quantities are rewritten.
CREATE FUNCTION enforce_active_variant_size() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.size NOT IN ('S','M','L','XL') THEN
   RAISE EXCEPTION 'Size da ngung kinh doanh' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.size <> OLD.size) AND (OLD.size NOT IN ('S','M','L','XL') OR NEW.size NOT IN ('S','M','L','XL')) THEN
   RAISE EXCEPTION 'Khong doi dinh danh size lich su' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER active_variant_size BEFORE INSERT OR UPDATE OF size ON variants FOR EACH ROW EXECUTE FUNCTION enforce_active_variant_size();
CREATE FUNCTION enforce_active_order_item_size() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_size text;
BEGIN
 SELECT size INTO selected_size FROM variants WHERE id=NEW.variant_id;
 IF selected_size NOT IN ('S','M','L','XL') THEN
  IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Khong them san xuat size da ngung' USING ERRCODE='23514'; END IF;
  IF NEW.variant_id<>OLD.variant_id OR NEW.qty>OLD.qty THEN RAISE EXCEPTION 'Khong tang san xuat size da ngung' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER active_order_item_size BEFORE INSERT OR UPDATE OF qty,variant_id ON production_order_items FOR EACH ROW EXECUTE FUNCTION enforce_active_order_item_size();
UPDATE lark_inventory_sources SET body=body #- '{mapping,sizes,XS}' #- '{mapping,sizes,2XL}',version=version+1,updated_at=now() WHERE body->'mapping'->'sizes' ?| ARRAY['XS','2XL'];
