-- Keep existing category codes and permit named, store-configured categories.
-- Existing expense rows and row-level security policies are unchanged.
ALTER TABLE public.expenses DROP CONSTRAINT expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (
  category IN ('labor', 'rent', 'mgmt', 'elec', 'water', 'net', 'card', 'goods', 'etc')
  OR (left(category, 7) = 'custom:'
      AND char_length(substring(category FROM 8)) BETWEEN 1 AND 40
      AND substring(category FROM 8) = btrim(substring(category FROM 8)))
);
