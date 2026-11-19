-- Still Sailing: update #3 — admin login, letter review, and "your letter was reviewed" notices.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it once,
-- AFTER 01-setup.sql and 02-letters-and-daily-quests.sql.
--
-- Then make yourself an admin (see the bottom of this file).

-- ── Admins ───────────────────────────────────────────────────────────────────
-- Whoever is listed here can log in at  <your site>/#/admin  and review letters.
-- There are deliberately NO policies on this table: nobody can read or change it
-- from the website. You add admins yourself in the SQL editor.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ── Letters: pending → approved / rejected ──────────────────────────────────
alter table public.letters
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists review_note text check (char_length(review_note) <= 500), -- optional message to the writer
  add column if not exists reviewed_at timestamptz,
  add column if not exists author_seen boolean not null default true; -- false = the writer has news they haven't opened yet

-- Carry over letters you already approved by hand.
update public.letters set status = 'approved', reviewed_at = coalesce(reviewed_at, created_at)
where approved = true and status = 'pending';

-- `approved` is now worked out from `status`, so older code that reads it keeps working.
drop policy if exists "approved letters are readable" on public.letters;
drop policy if exists "submit own letters" on public.letters;
drop index if exists public.letters_approved_idx;
alter table public.letters drop column approved;
alter table public.letters add column approved boolean generated always as (status = 'approved') stored;

create index if not exists letters_status_idx on public.letters (status, created_at desc);
create index if not exists letters_author_idx on public.letters (user_id, created_at desc);

-- Everyone sees approved letters. Writers also see their own (any status). Admins see all.
create policy "approved letters are readable" on public.letters
  for select using (status = 'approved');
create policy "writers see their own letters" on public.letters
  for select using (auth.uid() = user_id);
create policy "admins see all letters" on public.letters
  for select using (public.is_admin());

-- Submit as yourself, as a fresh pending letter, max 3 per day.
-- (Writers can now see their own pending letters, so this count includes them.
--  Before, it only counted approved ones, so the limit didn't really bite.)
create policy "submit own letters" on public.letters
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and review_note is null
    and reviewed_at is null
    and author_seen = true
    and (
      select count(*) from public.letters l
      where l.user_id = auth.uid() and l.created_at > now() - interval '1 day'
    ) < 3
  );

-- Still no update/delete policies. Changes go through the two functions below,
-- which check who is calling.

-- Admins: approve or reject a letter, with an optional note to the writer.
create or replace function public.review_letter(letter_id bigint, decision text, note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can review letters.' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  update public.letters
     set status = decision,
         review_note = nullif(trim(note), ''),
         reviewed_at = now(),
         author_seen = false
   where id = letter_id;
  if not found then
    raise exception 'No letter with that id.' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.review_letter(bigint, text, text) from public, anon;
grant execute on function public.review_letter(bigint, text, text) to authenticated;

-- Writers: mark "your letter was reviewed" notices as read.
create or replace function public.mark_my_letters_seen()
returns void
language sql security definer set search_path = public as $$
  update public.letters set author_seen = true
  where user_id = auth.uid() and author_seen = false
$$;
revoke execute on function public.mark_my_letters_seen() from public, anon;
grant execute on function public.mark_my_letters_seen() to authenticated;

-- ── Make yourself an admin ───────────────────────────────────────────────────
-- 1. Sign up on the site with the account you want to use as admin
--    (or create it in Supabase → Authentication → Users).
-- 2. Run this, with that account's email:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'you@example.com';
--
-- To remove an admin:  delete from public.admins where user_id = (select id from auth.users where email = '...');
