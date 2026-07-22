-- Fixes a gap in 0008: Skull Crusher and Preacher Curl were tagged 'barbell'
-- in seed_default_exercises() for newly-seeded users, but the retroactive
-- update for already-existing exercise rows only used the old is_barbell
-- flag (which never covered these two), leaving them as 'other' for anyone
-- who had exercises before 0008 ran. Applies to all users; a no-op for rows
-- already correct.
update public.exercises
set equipment = 'barbell'
where lower(trim(name)) in ('skull crusher', 'preacher curl');
