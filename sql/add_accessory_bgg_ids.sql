-- Add accessory_bgg_ids column to board_games for BGG accessory references
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS accessory_bgg_ids integer[];
