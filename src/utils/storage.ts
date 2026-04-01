import type { BoardGame } from '../types';

const STORAGE_KEY = 'board_game_collection';

export function loadGames(): BoardGame[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveGames(games: BoardGame[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function exportGames(games: BoardGame[]): void {
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `board-games-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importGames(file: File): Promise<BoardGame[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const games = JSON.parse(e.target?.result as string);
        if (Array.isArray(games)) {
          resolve(games);
        } else {
          reject(new Error('Invalid file format'));
        }
      } catch {
        reject(new Error('Failed to parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
