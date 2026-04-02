import { XMLParser } from 'fast-xml-parser';
import type { BGGSearchResult, BGGGameDetail, ExpansionInfo } from '../types';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const BGG_API = '/bgg-api';

export async function searchBGG(query: string): Promise<BGGSearchResult[]> {
  if (!query.trim()) return [];

  const res = await fetch(`${BGG_API}/search?query=${encodeURIComponent(query)}&type=boardgame,boardgameexpansion`);
  const xml = await res.text();
  const data = parser.parse(xml);

  const items = data?.items?.item;
  if (!items) return [];

  const list = Array.isArray(items) ? items : [items];
  const results = list.map((item: any) => ({
    id: Number(item['@_id']),
    name: item.name?.['@_value'] || (Array.isArray(item.name) ? item.name[0]?.['@_value'] : ''),
    yearPublished: item.yearpublished?.['@_value'],
  }));

  const q = query.toLowerCase().trim();
  // Word boundary pattern: query appears as a standalone word
  const wordRe = new RegExp(`(^|[\\s:;,._\\-–—()])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s:;,._\\-–—()]|$)`, 'i');

  const relevance = (name: string): number => {
    const n = name.toLowerCase();
    if (n === q) return 0;                     // exact match
    if (n.startsWith(q + ' ') || n.startsWith(q + ':')) return 1; // "Ra: ..." or "Ra something"
    if (wordRe.test(name)) return 2;           // query as whole word anywhere
    if (n.startsWith(q)) return 3;             // starts with query
    return 4;                                  // contains query
  };

  results.sort((a: BGGSearchResult, b: BGGSearchResult) => {
    const ra = relevance(a.name);
    const rb = relevance(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.length - b.name.length;
  });

  return results.slice(0, 20);
}

function parseRank(stats: any): number | undefined {
  const ranks = stats?.ranks?.rank;
  if (!ranks) return undefined;
  const rankList = Array.isArray(ranks) ? ranks : [ranks];
  const mainRank = rankList.find((r: any) => r['@_name'] === 'boardgame');
  if (mainRank && mainRank['@_value'] !== 'Not Ranked') {
    return Number(mainRank['@_value']);
  }
  return undefined;
}

const BGG_RANK_TO_CATEGORY: Record<string, string> = {
  'abstracts': 'Abstract Games',
  'cgs': 'Customizable Games',
  'thematic': 'Thematic Games',
  'familygames': 'Family Games',
  'childrensgames': "Children's Games",
  'partygames': 'Party Games',
  'strategygames': 'Strategy Games',
  'wargames': 'Wargames',
};

function parseGameType(stats: any): string | undefined {
  const ranks = stats?.ranks?.rank;
  if (!ranks) return undefined;
  const rankList = Array.isArray(ranks) ? ranks : [ranks];
  // Find the best-ranked subtype (lowest number, excluding "boardgame" which is overall)
  let best: { name: string; value: number } | undefined;
  for (const r of rankList) {
    const name = r['@_name'];
    if (name === 'boardgame' || r['@_value'] === 'Not Ranked') continue;
    const val = Number(r['@_value']);
    if (!best || val < best.value) {
      best = { name, value: val };
    }
  }
  return best ? BGG_RANK_TO_CATEGORY[best.name] : undefined;
}

const toNum = (val: any) => val ? Number(Number(val).toFixed(1)) : undefined;

export async function getBGGDetail(id: number): Promise<BGGGameDetail | null> {
  const res = await fetch(`${BGG_API}/thing?id=${id}&stats=1`);
  const xml = await res.text();
  const data = parser.parse(xml);

  const item = data?.items?.item;
  if (!item) return null;

  const isExpansion = item['@_type'] === 'boardgameexpansion';
  const names = Array.isArray(item.name) ? item.name : [item.name];
  const primaryName = names.find((n: any) => n['@_type'] === 'primary')?.['@_value'] || '';

  const links = Array.isArray(item.link) ? item.link : [item.link];

  const getLinks = (type: string) =>
    links.filter((l: any) => l['@_type'] === type).map((l: any) => l['@_value']);
  const getLinkIds = (type: string) =>
    links.filter((l: any) => l['@_type'] === type).map((l: any) => Number(l['@_id']));

  const designers = getLinks('boardgamedesigner');
  const artists = getLinks('boardgameartist');
  const publishers = getLinks('boardgamepublisher');
  const expansions = getLinks('boardgameexpansion');
  const expansionIds = getLinkIds('boardgameexpansion');

  const stats = item.statistics?.ratings;

  return {
    id,
    name: primaryName,
    image: item.image || item.thumbnail,
    gameType: isExpansion ? 'expansion' : 'base',
    minPlayers: Number(item.minplayers?.['@_value']) || undefined,
    maxPlayers: Number(item.maxplayers?.['@_value']) || undefined,
    playTime: item.playingtime?.['@_value'] ? `${item.playingtime['@_value']} min` : undefined,
    yearPublished: item.yearpublished?.['@_value'] || undefined,
    category: parseGameType(stats) || undefined,
    designer: designers.join(', ') || undefined,
    artist: artists.join(', ') || undefined,
    publisher: publishers.join(', ') || undefined,
    bggRating: toNum(stats?.average?.['@_value']),
    bggBayesRating: toNum(stats?.bayesaverage?.['@_value']),
    bggRank: parseRank(stats),
    weight: toNum(stats?.averageweight?.['@_value']),
    relatedGames: expansions.join(', ') || undefined,
    expansionIds,
  };
}

// Fetch expansion details in batch (BGG supports comma-separated IDs)
export async function fetchExpansions(bggIds: number[]): Promise<ExpansionInfo[]> {
  if (bggIds.length === 0) return [];

  // BGG API supports up to ~20 IDs per request
  const results: ExpansionInfo[] = [];
  const chunks: number[][] = [];
  for (let i = 0; i < bggIds.length; i += 20) {
    chunks.push(bggIds.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    const ids = chunk.join(',');
    const res = await fetch(`${BGG_API}/thing?id=${ids}&stats=1`);
    const xml = await res.text();
    const data = parser.parse(xml);

    const items = data?.items?.item;
    if (!items) continue;

    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      const names = Array.isArray(item.name) ? item.name : [item.name];
      const primaryName = names.find((n: any) => n['@_type'] === 'primary')?.['@_value'] || '';

      const itemLinks = Array.isArray(item.link) ? item.link : (item.link ? [item.link] : []);
      const designers = itemLinks
        .filter((l: any) => l['@_type'] === 'boardgamedesigner')
        .map((l: any) => l['@_value']);

      const stats = item.statistics?.ratings;

      results.push({
        bggId: Number(item['@_id']),
        name: primaryName,
        image: item.thumbnail || item.image,
        yearPublished: item.yearpublished?.['@_value'] || undefined,
        bggRating: toNum(stats?.average?.['@_value']),
        bggBayesRating: toNum(stats?.bayesaverage?.['@_value']),
        bggRank: parseRank(stats),
        weight: toNum(stats?.averageweight?.['@_value']),
        designer: designers.join(', ') || undefined,
      });
    }
  }

  return results;
}
