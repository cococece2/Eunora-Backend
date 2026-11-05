-- Still Sailing: update #2 — daily quest reset + user-written letters.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it once.
-- (You already ran supabase-setup.sql. This only ADDS things; it doesn't delete anything.)

-- ── Daily quests ─────────────────────────────────────────────────────────────
-- total_xp is now lifetime XP (it only goes up). quests_day remembers which day
-- the ticked-off quests belong to, so a new day starts with a clean list.
alter table public.profiles add column if not exists quests_day text;

-- ── Letters in bottles written by users ──────────────────────────────────────
create table public.letters (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 50 and 1500),
  approved boolean not null default false,   -- YOU switch this to true to publish a letter
  created_at timestamptz not null default now()
);
create index letters_approved_idx on public.letters (approved, created_at desc);

alter table public.letters enable row level security;

-- Everyone can read APPROVED letters only. Pending ones are invisible on the site.
create policy "approved letters are readable" on public.letters
  for select using (approved = true);

-- You can submit a letter as yourself, it must start unapproved, and max 3 per day.
create policy "submit own letters" on public.letters
  for insert with check (
    auth.uid() = user_id
    and approved = false
    and (
      select count(*) from public.letters l
      where l.user_id = auth.uid() and l.created_at > now() - interval '1 day'
    ) < 3
  );

-- There is deliberately no update/delete policy: people can't approve their own letters.
-- To review: Supabase → Table Editor → letters. Read the body, then:
--   * publish it: set approved = true
--   * reject it:  delete the row
