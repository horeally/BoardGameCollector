export interface BoardGame {
  id: string;
  name: string;
  nameEn?: string;
  price: number;
  currency: string;
  purchaseDate: string;
  category: string;
  gameType: 'base' | 'expansion';
  players: string;
  playTime?: string;
  yearPublished?: string;
  designer?: string;
  artist?: string;
  publisher?: string;
  rating?: number;
  bggRating?: number;
  bggBayesRating?: number;
  bggRank?: number;
  bggId?: number;
  weight?: number;
  relatedGames?: string;
  expansionBggIds?: number[];
  linkedGameIds?: string[];
  kickstarter?: boolean;
  image?: string;
  notes?: string;
  sold?: boolean;
  soldPrice?: number;
  soldCurrency?: string;
  soldDate?: string;
  soldNotes?: string;
  createdAt: string;
}

export interface BGGSearchResult {
  id: number;
  name: string;
  yearPublished?: string;
}

export interface BGGGameDetail {
  id: number;
  name: string;
  nameEn?: string;
  image?: string;
  minPlayers?: number;
  maxPlayers?: number;
  playTime?: string;
  yearPublished?: string;
  category?: string;
  designer?: string;
  artist?: string;
  publisher?: string;
  bggRating?: number;
  bggBayesRating?: number;
  bggRank?: number;
  weight?: number;
  gameType?: 'base' | 'expansion';
  relatedGames?: string;
  expansionIds?: number[];
}

export interface ExpansionInfo {
  bggId: number;
  name: string;
  image?: string;
  yearPublished?: string;
  bggRating?: number;
  bggBayesRating?: number;
  bggRank?: number;
  weight?: number;
  designer?: string;
}

export interface OwnedExpansion {
  id: string;
  userId: string;
  baseGameId: string;
  bggId: number;
  name: string;
  image?: string;
  owned: boolean;
  price?: number;
  currency?: string;
  purchaseDate?: string;
  bggRating?: number;
  bggBayesRating?: number;
  bggRank?: number;
  weight?: number;
  designer?: string;
  yearPublished?: string;
}

export type Currency = 'CNY' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'SGD';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
};

// Approximate exchange rates to CNY
export const EXCHANGE_RATES: Record<Currency, number> = {
  CNY: 1,
  USD: 7.2,
  EUR: 7.8,
  GBP: 9.1,
  JPY: 0.048,
  SGD: 5.4,
};

export function toCNY(price: number, currency: string): number {
  return price * (EXCHANGE_RATES[currency as Currency] || 1);
}

export const CATEGORIES = [
  'Abstract Games',
  'Customizable Games',
  'Thematic Games',
  'Family Games',
  "Children's Games",
  'Party Games',
  'Strategy Games',
  'Wargames',
];

export const CATEGORY_COLORS: Record<string, string> = {
  'Abstract Games': 'purple',
  'Customizable Games': 'geekblue',
  'Thematic Games': 'magenta',
  'Family Games': 'green',
  "Children's Games": 'lime',
  'Party Games': 'orange',
  'Strategy Games': 'blue',
  'Wargames': 'red',
};
