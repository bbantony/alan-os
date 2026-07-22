-- Alan OS — Phase 5: Finance AI scaffolding (receipts table + storage bucket).
-- The actual AI vision/categorization calls are wired in once an AI API key
-- exists (owner action, in progress) — everything here works standalone in
-- the meantime: a receipt can be uploaded and reviewed with fully manual
-- entry, which SPEC.md Part F already calls the correct graceful-failure
-- path ("on parse failure ... fail gracefully to manual entry").

create type public.receipt_status as enum ('pending_review', 'approved', 'discarded');

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  merchant_guess text,
  total_cents_guess bigint,
  txn_date_guess date,
  line_items jsonb not null default '[]'::jsonb,
  status public.receipt_status not null default 'pending_review',
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;
create policy "receipts_all_own" on public.receipts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index receipts_user_status_idx on public.receipts (user_id, status);

-- transactions.receipt_id was added in 0016 without a FK (receipts didn't
-- exist yet) — wire the real constraint up now that it does.
alter table public.transactions
  add constraint transactions_receipt_id_fkey
  foreign key (receipt_id) references public.receipts (id) on delete set null;

-- Private storage bucket for receipt photos. Path convention is
-- "<user_id>/<uuid>.<ext>" — the RLS policy below checks the first path
-- segment against auth.uid(), the standard Supabase Storage per-user pattern.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_own" on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
