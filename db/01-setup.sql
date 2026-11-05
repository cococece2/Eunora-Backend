-- Still Sailing: database setup for Supabase.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it once.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  sailor_name text not null check (char_length(sailor_name) between 3 and 24),
  total_xp integer not null default 0 check (total_xp >= 0),
  completed_quests text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rooms (
  id text primary key,
  name text not null,
  description text not null,
  emoji text not null default '⚓',
  sort_order int not null default 0
);

create table public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  hidden boolean not null default false,   -- set to true to hide a message from everyone
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at desc);

create table public.reports (
  message_id bigint not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);

-- ── Make a profile automatically when someone signs up ──────────────────────

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  final text;
begin
  base := left(coalesce(nullif(trim(new.raw_user_meta_data->>'sailor_name'), ''), 'Sailor'), 20);
  if char_length(base) < 3 then base := 'Sailor'; end if;
  final := base;
  if exists (select 1 from public.profiles where sailor_name = final) then
    final := base || '_' || (floor(random() * 900) + 100)::int;
  end if;
  insert into public.profiles (id, sailor_name) values (new.id, final);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Auto-hide a message once 3 different people report it ────────────────────

create function public.hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reports where message_id = new.message_id) >= 3 then
    update public.messages set hidden = true where id = new.message_id;
  end if;
  return new;
end $$;

create trigger on_report_added
  after insert on public.reports
  for each row execute function public.hide_reported();

-- ── Security rules (Row Level Security) ──────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.messages     enable row level security;
alter table public.reports      enable row level security;

-- profiles: everyone can see sailor names; you can only change your own progress
create policy "profiles are readable" on public.profiles for select using (true);
create policy "update own profile"    on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- rooms: everyone can read; only you (in the Supabase dashboard) can add or edit rooms
create policy "rooms are readable" on public.rooms for select using (true);

-- room_members: anyone can see counts; you can only join/leave as yourself
create policy "members are readable" on public.room_members for select using (true);
create policy "join as yourself"     on public.room_members for insert with check (auth.uid() = user_id);
create policy "leave as yourself"    on public.room_members for delete using (auth.uid() = user_id);

-- messages: hidden ones are invisible; you can only post as yourself, in a crew you joined
create policy "visible messages are readable" on public.messages for select using (hidden = false);
create policy "post in your crews" on public.messages for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.room_members m
    where m.room_id = messages.room_id and m.user_id = auth.uid()
  )
);

-- reports: you can file a report as yourself; nobody can read the list from the website
create policy "report as yourself" on public.reports for insert with check (auth.uid() = reporter_id);

-- ── Live chat ────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.messages;

-- ── Starter crews (edit, add or delete these any time in Table Editor → rooms) ─

insert into public.rooms (id, name, description, emoji, sort_order) values
  ('daily',  'Daily Check-ins',  'How is the water today? Share a word, a feeling, or a small win.',        '🌅', 1),
  ('wins',   'Small Wins',       'Ate a meal, told someone, took a breath. It all counts here.',            '🎉', 2),
  ('rough',  'Rough Seas',       'A gentle place for the hard days. Listen first, advise only if asked.',   '🌧️', 3),
  ('family', 'Family & Friends', 'Talking to the people who love you, even when it feels scary.',           '🫂', 4),
  ('quiet',  'Quiet Harbor',     'No pressure to talk. Just sit with the crew for a while.',                '⚓', 5);
