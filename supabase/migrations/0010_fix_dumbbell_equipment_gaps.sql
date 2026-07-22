-- Same gap as 0009, for dumbbell: the 0008 retroactive update for
-- already-existing exercise rows only listed 8 of the 14 exercises that
-- seed_default_exercises() actually tags 'dumbbell', so anyone who had
-- exercises before 0008 ran is missing the dumbbell tag on the other 6.
-- Applies to all users; a no-op for rows already correct.
update public.exercises
set equipment = 'dumbbell'
where lower(trim(name)) in (
  'incline dumbbell press',
  'flat dumbbell press',
  'dumbbell fly',
  'seated dumbbell shoulder press',
  'lateral raise',
  'front raise',
  'rear delt fly',
  'arnold press',
  'overhead triceps extension',
  'dumbbell curl',
  'hammer curl',
  'single-arm dumbbell row',
  'bulgarian split squat',
  'walking lunge'
);
