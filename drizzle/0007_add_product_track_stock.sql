ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "track_stock" boolean NOT NULL DEFAULT false;

-- Enable tracking automatically for business types where stock is expected by default
UPDATE "products" p
SET track_stock = true
FROM "shops" s
WHERE p.shop_id = s.id
  AND s.business_type IN ('fruits_veg', 'mini_grocery', 'pharmacy', 'mini_wholesale');
