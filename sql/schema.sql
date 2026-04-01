-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → your project → SQL Editor)

-- 1. Invite codes table
create table invite_codes (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

-- 2. User profiles table
create table profiles (
  id uuid references auth.users(id) primary key,
  username text unique not null,
  created_at timestamptz default now()
);

-- 3. Board games table
create table board_games (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  name_en text,
  price numeric not null default 0,
  currency text not null default 'CNY',
  purchase_date date,
  category text default 'Other',
  game_type text default 'base',
  players text,
  play_time text,
  year_published text,
  designer text,
  artist text,
  publisher text,
  rating smallint,
  bgg_rating numeric,
  bgg_bayes_rating numeric,
  bgg_rank integer,
  bgg_id integer,
  weight numeric,
  related_games text,
  image text,
  notes text,
  sold boolean default false,
  sold_price numeric,
  sold_currency text,
  sold_date date,
  sold_notes text,
  created_at timestamptz default now()
);

-- 4. Row Level Security (RLS) - each user can only see their own data
alter table board_games enable row level security;
alter table profiles enable row level security;
alter table invite_codes enable row level security;

create policy "Users can read own games"
  on board_games for select using (auth.uid() = user_id);
create policy "Users can insert own games"
  on board_games for insert with check (auth.uid() = user_id);
create policy "Users can update own games"
  on board_games for update using (auth.uid() = user_id);
create policy "Users can delete own games"
  on board_games for delete using (auth.uid() = user_id);

create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Anyone can check invite codes"
  on invite_codes for select using (true);
create policy "Authenticated users can claim invite codes"
  on invite_codes for update using (auth.uid() is not null);

-- 5. Insert invite codes (run manually in Supabase SQL Editor, do NOT commit real codes)
-- insert into invite_codes (code) values ('YOUR-CODE-HERE');
