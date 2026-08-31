-- Stops receipt approval destroying what the AI actually read off the photo.
--
-- THE RULE THIS RESTORES: imported source data is never rewritten in place.
-- `approveReceipt` writes the human-corrected `line_items`, `merchant_guess`
-- and `txn_date_guess` back over the receipt row, so the moment a receipt is
-- approved there is no record of what was extracted — only what Alan corrected
-- it to. That makes it impossible to tell a good scan from a bad one, which is
-- the only way to know whether receipt scanning is worth paying for.
--
-- It has been recorded twice in PROGRESS.md as "ongoing data loss, not a
-- latent risk" and deferred twice as out of scope. It is in scope now.
--
-- WHAT CANNOT BE RECOVERED: receipts approved before this migration. Their
-- original extraction is already gone and no backfill can invent it. MANUAL.md
-- says so in plain English rather than leaving Alan to wonder why older
-- receipts have no "what the scan said" panel.

alter table public.receipts
  add column if not exists original_extraction jsonb;

comment on column public.receipts.original_extraction is
  'What the vision model returned, frozen at extraction time: { line_items, merchant_guess, txn_date_guess, extracted_at }. Written ONCE and never updated — the corrected values live in the columns of the same name. Null for receipts approved before migration 0036, whose extraction was overwritten and is unrecoverable.';

-- Backfill for receipts NOT yet approved. Their current column values are
-- still the AI's own output — nothing has corrected them yet — so this is a
-- faithful snapshot rather than a guess. Approved rows are deliberately left
-- null: their columns already hold Alan's corrections, and copying those in
-- would be worse than an empty field, because it would look like the model
-- had been right all along.
update public.receipts
set original_extraction = jsonb_build_object(
      'line_items', coalesce(line_items, '[]'::jsonb),
      'merchant_guess', merchant_guess,
      'txn_date_guess', txn_date_guess,
      'extracted_at', created_at,
      'backfilled', true
    )
where original_extraction is null
  and status = 'pending_review';
