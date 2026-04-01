-- Run this in Supabase SQL Editor after schema.sql

create table owned_expansions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  base_game_id uuid references board_games(id) on delete cascade not null,
  bgg_id integer not null,
  name text not null,
  image text,
  owned boolean default false,
  price numeric,
  currency text default 'CNY',
  purchase_date date,
  bgg_rating numeric,
  bgg_bayes_rating numeric,
  bgg_rank integer,
  weight numeric,
  designer text,
  year_published text,
  created_at timestamptz default now(),
  unique(user_id, base_game_id, bgg_id)
);

alter table owned_expansions enable row level security;

create policy "Users can read own expansions"
  on owned_expansions for select using (auth.uid() = user_id);
create policy "Users can insert own expansions"
  on owned_expansions for insert with check (auth.uid() = user_id);
create policy "Users can update own expansions"
  on owned_expansions for update using (auth.uid() = user_id);
create policy "Users can delete own expansions"
  on owned_expansions for delete using (auth.uid() = user_id);
