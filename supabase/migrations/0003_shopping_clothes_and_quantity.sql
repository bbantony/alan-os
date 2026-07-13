-- Alan OS — add a Clothes category and optional quantity/unit to shopping_items.

alter type public.shopping_category add value 'clothes';

create type public.shopping_unit as enum ('count', 'g', 'kg', 'ml', 'l');

alter table public.shopping_items
  add column quantity numeric,
  add column quantity_unit public.shopping_unit;
