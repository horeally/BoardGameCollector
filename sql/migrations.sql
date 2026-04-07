-- All incremental migrations (safe to re-run)
-- Run this in Supabase SQL Editor after schema.sql and expansions.sql

-- board_games: expansion BGG IDs
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS expansion_bgg_ids integer[];

-- board_games: kickstarter flag
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS kickstarter boolean DEFAULT false;

-- board_games: linked game IDs (manual version linking)
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS linked_game_ids text[];

-- board_games: accessory BGG IDs
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS accessory_bgg_ids integer[];

-- board_games: allow null price
ALTER TABLE board_games ALTER COLUMN price DROP NOT NULL;

-- owned_expansions: item type (expansion / accessory)
ALTER TABLE owned_expansions ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'expansion';

-- owned_expansions: drop unique constraint for accessories (bgg_id=0)
ALTER TABLE owned_expansions DROP CONSTRAINT IF EXISTS owned_expansions_user_id_base_game_id_bgg_id_key;

-- owned_expansions: official accessory flag
ALTER TABLE owned_expansions ADD COLUMN IF NOT EXISTS official boolean DEFAULT false;
