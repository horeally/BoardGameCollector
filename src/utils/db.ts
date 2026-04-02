import { supabase } from './supabase';
import type { BoardGame, OwnedExpansion } from '../types';

// Convert DB row (snake_case) to app model (camelCase)
function toGame(row: any): BoardGame {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    price: Number(row.price),
    currency: row.currency,
    purchaseDate: row.purchase_date || '',
    category: row.category,
    gameType: row.game_type || 'base',
    players: row.players || '',
    playTime: row.play_time,
    yearPublished: row.year_published,
    designer: row.designer,
    artist: row.artist,
    publisher: row.publisher,
    rating: row.rating,
    bggRating: row.bgg_rating ? Number(row.bgg_rating) : undefined,
    bggBayesRating: row.bgg_bayes_rating ? Number(row.bgg_bayes_rating) : undefined,
    bggRank: row.bgg_rank,
    bggId: row.bgg_id,
    weight: row.weight ? Number(row.weight) : undefined,
    relatedGames: row.related_games,
    expansionBggIds: row.expansion_bgg_ids || [],
    linkedGameIds: row.linked_game_ids || [],
    kickstarter: row.kickstarter || false,
    image: row.image,
    notes: row.notes,
    sold: row.sold,
    soldPrice: row.sold_price ? Number(row.sold_price) : undefined,
    soldCurrency: row.sold_currency,
    soldDate: row.sold_date,
    soldNotes: row.sold_notes,
    createdAt: row.created_at,
  };
}

// Convert app model (camelCase) to DB row (snake_case)
function toRow(game: BoardGame, userId: string) {
  return {
    id: game.id,
    user_id: userId,
    name: game.name,
    name_en: game.nameEn || null,
    price: game.price,
    currency: game.currency,
    purchase_date: game.purchaseDate || null,
    category: game.category,
    game_type: game.gameType,
    players: game.players || null,
    play_time: game.playTime || null,
    year_published: game.yearPublished || null,
    designer: game.designer || null,
    artist: game.artist || null,
    publisher: game.publisher || null,
    rating: game.rating || null,
    bgg_rating: game.bggRating || null,
    bgg_bayes_rating: game.bggBayesRating || null,
    bgg_rank: game.bggRank || null,
    bgg_id: game.bggId || null,
    weight: game.weight || null,
    related_games: game.relatedGames || null,
    expansion_bgg_ids: game.expansionBggIds || [],
    linked_game_ids: game.linkedGameIds || [],
    kickstarter: game.kickstarter || false,
    image: game.image || null,
    notes: game.notes || null,
    sold: game.sold || false,
    sold_price: game.soldPrice || null,
    sold_currency: game.soldCurrency || null,
    sold_date: game.soldDate || null,
    sold_notes: game.soldNotes || null,
  };
}

export async function fetchGames(): Promise<BoardGame[]> {
  const { data, error } = await supabase
    .from('board_games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toGame);
}

export async function insertGame(game: BoardGame, userId: string): Promise<void> {
  const { error } = await supabase
    .from('board_games')
    .insert(toRow(game, userId));

  if (error) throw error;
}

export async function updateGame(game: BoardGame, userId: string): Promise<void> {
  const { error } = await supabase
    .from('board_games')
    .update(toRow(game, userId))
    .eq('id', game.id);

  if (error) throw error;
}

export async function updateLinkedGameIds(id: string, linkedGameIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('board_games')
    .update({ linked_game_ids: linkedGameIds })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteGame(id: string): Promise<void> {
  const { error } = await supabase
    .from('board_games')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function validateInviteCode(code: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('id, used_by')
    .eq('code', code)
    .single();

  if (error || !data) return false;
  return data.used_by === null;
}

export async function claimInviteCode(code: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('invite_codes')
    .update({ used_by: userId, used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_by', null);

  return !error;
}

export async function createProfile(userId: string, username: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, username });

  return !error;
}

// --- Expansion functions ---

function toOwnedExpansion(row: any): OwnedExpansion {
  return {
    id: row.id,
    userId: row.user_id,
    baseGameId: row.base_game_id,
    bggId: row.bgg_id,
    name: row.name,
    image: row.image,
    owned: row.owned,
    itemType: row.item_type || 'expansion',
    official: row.official || false,
    price: row.price ? Number(row.price) : undefined,
    currency: row.currency,
    purchaseDate: row.purchase_date,
    bggRating: row.bgg_rating ? Number(row.bgg_rating) : undefined,
    bggBayesRating: row.bgg_bayes_rating ? Number(row.bgg_bayes_rating) : undefined,
    bggRank: row.bgg_rank,
    weight: row.weight ? Number(row.weight) : undefined,
    designer: row.designer,
    yearPublished: row.year_published,
  };
}

export async function fetchExpansionsForGame(baseGameId: string): Promise<OwnedExpansion[]> {
  const { data, error } = await supabase
    .from('owned_expansions')
    .select('*')
    .eq('base_game_id', baseGameId)
    .order('name');

  if (error) throw error;
  return (data || []).map(toOwnedExpansion);
}

export async function fetchExpansionTotalSpent(): Promise<number> {
  const { data, error } = await supabase
    .from('owned_expansions')
    .select('price')
    .eq('owned', true);

  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + (Number(row.price) || 0), 0);
}

export async function fetchExpansionSpentByCurrency(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('owned_expansions')
    .select('price, currency')
    .eq('owned', true);

  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of data || []) {
    const c = row.currency || 'CNY';
    const p = Number(row.price) || 0;
    if (p > 0) map[c] = (map[c] || 0) + p;
  }
  return map;
}

export async function upsertExpansions(
  expansions: Omit<OwnedExpansion, 'id'>[],
  userId: string,
  baseGameId: string,
): Promise<void> {
  const rows = expansions.map((e) => ({
    user_id: userId,
    base_game_id: baseGameId,
    bgg_id: e.bggId,
    name: e.name,
    image: e.image || null,
    owned: e.owned || false,
    price: e.price || null,
    currency: e.currency || 'CNY',
    purchase_date: e.purchaseDate || null,
    bgg_rating: e.bggRating || null,
    bgg_bayes_rating: e.bggBayesRating || null,
    bgg_rank: e.bggRank || null,
    weight: e.weight || null,
    designer: e.designer || null,
    year_published: e.yearPublished || null,
  }));

  const { error } = await supabase
    .from('owned_expansions')
    .upsert(rows, { onConflict: 'user_id,base_game_id,bgg_id' });

  if (error) throw error;
}

export async function insertAccessory(
  baseGameId: string,
  userId: string,
  name: string,
  price?: number,
  currency?: string,
  purchaseDate?: string,
): Promise<OwnedExpansion> {
  const row = {
    user_id: userId,
    base_game_id: baseGameId,
    bgg_id: 0,
    name,
    owned: true,
    item_type: 'accessory',
    price: price || null,
    currency: currency || 'CNY',
    purchase_date: purchaseDate || null,
  };

  const { data, error } = await supabase
    .from('owned_expansions')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return toOwnedExpansion(data);
}

export async function updateAccessoryOfficial(id: string, official: boolean): Promise<void> {
  const { error } = await supabase
    .from('owned_expansions')
    .update({ official })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteAccessory(id: string): Promise<void> {
  const { error } = await supabase
    .from('owned_expansions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function updateExpansionOwnership(
  id: string,
  owned: boolean,
  price?: number,
  currency?: string,
  purchaseDate?: string,
): Promise<void> {
  const { error } = await supabase
    .from('owned_expansions')
    .update({
      owned,
      price: price || null,
      currency: currency || 'CNY',
      purchase_date: purchaseDate || null,
    })
    .eq('id', id);

  if (error) throw error;
}
