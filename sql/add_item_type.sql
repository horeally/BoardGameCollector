-- Add item_type column to owned_expansions to distinguish expansion vs accessory
ALTER TABLE owned_expansions ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'expansion';

-- Drop the unique constraint that requires bgg_id (accessories have bgg_id=0)
ALTER TABLE owned_expansions DROP CONSTRAINT IF EXISTS owned_expansions_user_id_base_game_id_bgg_id_key;
