ALTER TABLE "product_presentations"
ADD CONSTRAINT "chk_presentations_quantity_contained_positive"
CHECK ("quantity_contained" > 0);
