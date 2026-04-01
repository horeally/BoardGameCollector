-- Add linked_game_ids column for manual game version linking
ALTER TABLE board_games ADD COLUMN IF NOT EXISTS linked_game_ids text[];
