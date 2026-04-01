import { createContext, useContext } from 'react';
import type { BoardGame } from '../types';

export interface GameState {
  games: BoardGame[];
  loading: boolean;
  userId: string | null;
  expansionSpent: number;
  expansionSpentByCurrency: Record<string, number>;
}

export type GameAction =
  | { type: 'SET_GAMES'; payload: BoardGame[] }
  | { type: 'ADD_GAME'; payload: BoardGame }
  | { type: 'UPDATE_GAME'; payload: BoardGame }
  | { type: 'DELETE_GAME'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: string | null }
  | { type: 'SET_EXPANSION_SPENT'; payload: number }
  | { type: 'SET_EXPANSION_SPENT_BY_CURRENCY'; payload: Record<string, number> };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_GAMES':
      return { ...state, games: action.payload, loading: false };
    case 'ADD_GAME':
      return { ...state, games: [action.payload, ...state.games] };
    case 'UPDATE_GAME':
      return {
        ...state,
        games: state.games.map((g) => (g.id === action.payload.id ? action.payload : g)),
      };
    case 'DELETE_GAME':
      return { ...state, games: state.games.filter((g) => g.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_USER':
      return { ...state, userId: action.payload };
    case 'SET_EXPANSION_SPENT':
      return { ...state, expansionSpent: action.payload };
    case 'SET_EXPANSION_SPENT_BY_CURRENCY':
      return { ...state, expansionSpentByCurrency: action.payload };
    default:
      return state;
  }
}

export const initialState: GameState = { games: [], loading: true, userId: null, expansionSpent: 0, expansionSpentByCurrency: {} };

export const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}>({ state: initialState, dispatch: () => {} });

export const useGameStore = () => useContext(GameContext);
