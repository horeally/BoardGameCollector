-- Run this in Supabase SQL Editor
alter table board_games add column expansion_bgg_ids integer[] default '{}';
