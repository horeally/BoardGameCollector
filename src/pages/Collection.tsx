import {
  Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Spin, Table, message,
} from 'antd';
import { DeleteOutlined, DollarOutlined, EditOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useGameStore } from '../store/gameStore';
import { CATEGORIES, CURRENCY_SYMBOLS, toCNY } from '../types';
import type { BoardGame, Currency, OwnedExpansion } from '../types';
import { deleteGame, updateGame, updateLinkedGameIds, fetchExpansionsForGame, upsertExpansions, updateExpansionOwnership, insertAccessory, deleteAccessory, updateAccessoryOfficial, fetchExpansionTotalSpent, fetchExpansionSpentByCurrency } from '../utils/db';
import { fetchExpansions, fetchAccessories } from '../utils/bgg';
import { supabase } from '../utils/supabase';
import type { AccessoryInfo } from '../utils/bgg';

const sfDisplay = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
const sfText = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

// Apple-style pill badge
const APPLE_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  base: { bg: 'rgba(0, 113, 227, 0.12)', color: '#0071e3' },
  expansion: { bg: 'rgba(255, 149, 0, 0.12)', color: '#ff9500' },
  accessory: { bg: 'rgba(175, 82, 222, 0.12)', color: '#af52de' },
};

const APPLE_CATEGORY_STYLES: Record<string, { bg: string; color: string }> = {
  'Abstract Games': { bg: 'rgba(175, 82, 222, 0.12)', color: '#af52de' },
  'Customizable Games': { bg: 'rgba(0, 113, 227, 0.12)', color: '#0071e3' },
  'Thematic Games': { bg: 'rgba(88, 86, 214, 0.12)', color: '#5856d6' },
  'Family Games': { bg: 'rgba(52, 199, 89, 0.12)', color: '#34c759' },
  "Children's Games": { bg: 'rgba(162, 212, 50, 0.12)', color: '#7ab030' },
  'Party Games': { bg: 'rgba(255, 149, 0, 0.12)', color: '#ff9500' },
  'Strategy Games': { bg: 'rgba(0, 113, 227, 0.12)', color: '#0071e3' },
  'Wargames': { bg: 'rgba(255, 59, 48, 0.12)', color: '#ff3b30' },
};

function ApplePill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 980,
      background: bg,
      color,
      fontSize: 12,
      fontFamily: sfText,
      fontWeight: 600,
      letterSpacing: '-0.12px',
    }}>
      {label}
    </span>
  );
}

const LINKED_SHOW_COUNT = 2;

function LinkedTags({ games, onClickGame }: { games: BoardGame[]; onClickGame: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? games : games.slice(0, LINKED_SHOW_COUNT);
  const hiddenCount = games.length - LINKED_SHOW_COUNT;

  const pillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 8px',
    borderRadius: 980,
    background: 'rgba(90, 200, 250, 0.12)',
    color: '#0a84ff',
    fontSize: 11,
    fontFamily: sfText,
    fontWeight: 500,
    letterSpacing: '-0.08px',
    cursor: 'pointer',
    marginTop: 3,
    marginRight: 4,
  };
  const metaPillStyle: React.CSSProperties = {
    ...pillStyle,
    background: 'rgba(0, 0, 0, 0.05)',
    color: 'rgba(0, 0, 0, 0.48)',
  };

  return (
    <div style={{ marginTop: 4 }}>
      {visible.map((lg) => (
        <span
          key={lg.id}
          style={pillStyle}
          onClick={(e) => {
            e.stopPropagation();
            onClickGame(lg.id);
          }}
        >
          <LinkOutlined style={{ fontSize: 10 }} />
          {lg.name}{lg.yearPublished ? ` (${lg.yearPublished})` : ''}
        </span>
      ))}
      {!expanded && hiddenCount > 0 && (
        <span
          style={metaPillStyle}
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        >
          +{hiddenCount} more
        </span>
      )}
      {expanded && hiddenCount > 0 && (
        <span
          style={metaPillStyle}
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
        >
          collapse
        </span>
      )}
    </div>
  );
}

function HoverImage({ url, size, side = 'right' }: { url?: string; size: number; side?: 'left' | 'right' }) {
  const [show, setShow] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const imgRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const onEnter = () => {
    timer.current = setTimeout(() => {
      setShow(true);
      // Position after render so we can measure popup size
      requestAnimationFrame(() => {
        if (!imgRef.current || !popRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const pop = popRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 8;

        // Horizontal: prefer specified side, flip if no room
        let left: number;
        if (side === 'left') {
          left = rect.left - pop.width - pad;
          if (left < pad) left = rect.right + pad;
        } else {
          left = rect.right + pad;
          if (left + pop.width > vw - pad) left = rect.left - pop.width - pad;
        }
        // Keep within horizontal bounds
        left = Math.max(pad, Math.min(left, vw - pop.width - pad));

        // Vertical: align top with thumbnail, clamp to viewport
        let top = rect.top;
        if (top + pop.height > vh - pad) top = vh - pop.height - pad;
        top = Math.max(pad, top);

        setStyle({ top, left, opacity: 1 });
      });
    }, 1000);
  };
  const onLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
    setStyle({});
  };

  if (!url) {
    return <div style={{ width: size, height: size, background: '#f5f5f7', borderRadius: 8, margin: '0 auto' }} />;
  }

  return (
    <div ref={imgRef} style={{ display: 'inline-block' }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <img src={url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8 }} />
      {show && createPortal(
        <div ref={popRef} style={{
          position: 'fixed',
          zIndex: 99999,
          opacity: 0,
          ...style,
          background: '#fff',
          borderRadius: 12,
          boxShadow: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0px',
          padding: 6,
          pointerEvents: 'none',
        }}>
          <img src={url} alt="" style={{ display: 'block', borderRadius: 8, maxWidth: '40vw', maxHeight: '70vh' }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function Collection() {
  const { state, dispatch } = useGameStore();
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(urlParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(urlParams.get('cat') || undefined);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellingGame, setSellingGame] = useState<BoardGame | null>(null);
  const [sellForm] = Form.useForm();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [costByGame, setCostByGame] = useState<Record<string, { exp: number; acc: number; ownedExpCount: number }>>({});

  // Fetch expansion/accessory costs and owned expansion counts
  // Re-fetch when games array changes (e.g. after BGG refresh updates expansionBggIds)
  useEffect(() => {
    if (!state.games.length) return;
    let stale = false;
    (async () => {
      const { data, error } = await supabase
        .from('owned_expansions')
        .select('base_game_id, price, currency, item_type')
        .eq('owned', true)
        .limit(10000);
      console.log('[costByGame] rows:', data?.length, 'error:', error);
      if (stale) return;
      const map: Record<string, { exp: number; acc: number; ownedExpCount: number }> = {};
      for (const r of data || []) {
        const cny = toCNY(Number(r.price) || 0, r.currency || 'CNY');
        if (!map[r.base_game_id]) map[r.base_game_id] = { exp: 0, acc: 0, ownedExpCount: 0 };
        if (r.item_type === 'accessory') {
          map[r.base_game_id].acc += cny;
        } else {
          map[r.base_game_id].exp += cny;
          map[r.base_game_id].ownedExpCount++;
        }
      }
      // Log games that have expansionBggIds but 0 owned count
      for (const g of state.games) {
        if (g.gameType === 'base' && g.expansionBggIds?.length && !map[g.id]?.ownedExpCount) {
          console.log('[costByGame] ZERO:', g.name, g.id, 'entry:', map[g.id]);
        }
      }
      setCostByGame(map);
    })();
    return () => { stale = true; };
  }, [state.games]);
  const [sorter, setSorter] = useState<{ field?: string; order?: 'ascend' | 'descend' }>(() => {
    try { return JSON.parse(localStorage.getItem('bgc-collection-sort') || '{}'); } catch { return {}; }
  });

  // Linked versions: highlight + scroll
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkingGame, setLinkingGame] = useState<BoardGame | null>(null);
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);

  // Build id -> game map for linked game lookups
  const gameById = new Map<string, BoardGame>();
  for (const g of state.games) {
    if (!g.sold) gameById.set(g.id, g);
  }

  // Get all games linked to a given game (direct + reverse)
  const getLinkedGames = (game: BoardGame): BoardGame[] => {
    const linkedIds = new Set(game.linkedGameIds || []);
    // Also check reverse: other games that link to this one
    for (const g of state.games) {
      if (!g.sold && g.linkedGameIds?.includes(game.id)) {
        linkedIds.add(g.id);
      }
    }
    linkedIds.delete(game.id);
    return [...linkedIds].map((id) => gameById.get(id)).filter((g): g is BoardGame => !!g);
  };

  const openLinkModal = (game: BoardGame) => {
    setLinkingGame(game);
    setSelectedLinkIds(game.linkedGameIds || []);
    setLinkModalOpen(true);
  };

  const handleLinkSave = async () => {
    if (!linkingGame) return;
    const prevLinkedIds = linkingGame.linkedGameIds || [];
    const newLinkedIds = selectedLinkIds;

    try {
      // Update current game
      await updateLinkedGameIds(linkingGame.id, newLinkedIds);
      dispatch({ type: 'UPDATE_GAME', payload: { ...linkingGame, linkedGameIds: newLinkedIds } });

      // Add bidirectional links for newly added
      const added = newLinkedIds.filter((id) => !prevLinkedIds.includes(id));
      for (const targetId of added) {
        const target = gameById.get(targetId);
        if (target) {
          const targetLinks = [...new Set([...(target.linkedGameIds || []), linkingGame.id])];
          await updateLinkedGameIds(targetId, targetLinks);
          dispatch({ type: 'UPDATE_GAME', payload: { ...target, linkedGameIds: targetLinks } });
        }
      }

      // Remove bidirectional links for removed
      const removed = prevLinkedIds.filter((id) => !newLinkedIds.includes(id));
      for (const targetId of removed) {
        const target = gameById.get(targetId);
        if (target) {
          const targetLinks = (target.linkedGameIds || []).filter((id) => id !== linkingGame.id);
          await updateLinkedGameIds(targetId, targetLinks);
          dispatch({ type: 'UPDATE_GAME', payload: { ...target, linkedGameIds: targetLinks } });
        }
      }

      message.success('Links updated');
      setLinkModalOpen(false);
      setLinkingGame(null);
    } catch {
      message.error('Failed to update links');
    }
  };

  // Expansion state: keyed by base game id
  const [expansionMap, setExpansionMap] = useState<Record<string, OwnedExpansion[]>>({});
  const [loadingExpansions, setLoadingExpansions] = useState<Record<string, boolean>>({});

  const filtered = state.games.filter((g) => {
    if (g.sold) return false;
    const matchSearch =
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.nameEn?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || g.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  // Sorter comparators keyed by column dataIndex/key
  const sorterFns: Record<string, (a: BoardGame, b: BoardGame) => number> = {
    bggRank: (a, b) => (a.bggRank || 99999) - (b.bggRank || 99999),
    name: (a, b) => a.name.localeCompare(b.name),
    price: (a, b) => (a.price || 0) - (b.price || 0),
    rating: (a, b) => (a.rating || 0) - (b.rating || 0),
    bggRating: (a, b) => (a.bggRating || 0) - (b.bggRating || 0),
    weight: (a, b) => (a.weight || 0) - (b.weight || 0),
    purchaseDate: (a, b) => a.purchaseDate.localeCompare(b.purchaseDate),
  };

  const scrollToGame = useCallback((gameId: string) => {
    // Apply current sort to get the actual display order
    let sorted = [...filtered];
    if (sorter.field && sorter.order && sorterFns[sorter.field]) {
      const cmp = sorterFns[sorter.field];
      sorted.sort((a, b) => sorter.order === 'descend' ? cmp(b, a) : cmp(a, b));
    }
    const idx = sorted.findIndex((g) => g.id === gameId);
    if (idx === -1) {
      message.info('Game not visible (filtered out or sold)');
      return;
    }
    const targetPage = Math.floor(idx / pageSize) + 1;
    setCurrentPage(targetPage);
    setTimeout(() => {
      const row = document.querySelector(`tr[data-row-key="${gameId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightedId(gameId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 2000);
    }, 50);
  }, [filtered, sorter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteGame(id);
      dispatch({ type: 'DELETE_GAME', payload: id });
      message.success('Game deleted');
    } catch {
      message.error('Failed to delete game');
    }
  };

  const openSellModal = (game: BoardGame) => {
    setSellingGame(game);
    sellForm.setFieldsValue({
      soldPrice: game.price,
      soldCurrency: game.currency,
      soldDate: dayjs(),
      soldNotes: '',
    });
    setSellModalOpen(true);
  };

  const handleSell = () => {
    sellForm.validateFields().then(async (values) => {
      if (!sellingGame) return;
      const updatedGame = {
        ...sellingGame,
        sold: true,
        soldPrice: values.soldPrice,
        soldCurrency: values.soldCurrency,
        soldDate: values.soldDate ? values.soldDate.format('YYYY-MM-DD') : '',
        soldNotes: values.soldNotes,
      };
      try {
        await updateGame(updatedGame, state.userId!);
        dispatch({ type: 'UPDATE_GAME', payload: updatedGame });
        message.success('Game marked as sold');
        setSellModalOpen(false);
        setSellingGame(null);
      } catch {
        message.error('Failed to update game');
      }
    });
  };

  // Load expansions + accessories for a base game
  const loadExpansions = async (game: BoardGame) => {
    if (expansionMap[game.id] || loadingExpansions[game.id]) return;
    if (game.gameType !== 'base') return;

    setLoadingExpansions((prev) => ({ ...prev, [game.id]: true }));
    try {
      let dbExpansions = await fetchExpansionsForGame(game.id);

      const hasExpansionBgg = game.expansionBggIds && game.expansionBggIds.length > 0;
      const hasDbExpansions = dbExpansions.some((e) => e.itemType !== 'accessory');

      if (!hasDbExpansions && hasExpansionBgg) {
        // First time: fetch from BGG and insert
        const bggData = await fetchExpansions(game.expansionBggIds!);
        const newExpansions = bggData.map((e) => ({
          userId: state.userId!,
          baseGameId: game.id,
          bggId: e.bggId,
          name: e.name,
          image: e.image,
          owned: false,
          bggRating: e.bggRating,
          bggBayesRating: e.bggBayesRating,
          bggRank: e.bggRank,
          weight: e.weight,
          designer: e.designer,
          yearPublished: e.yearPublished,
        }));
        await upsertExpansions(newExpansions, state.userId!, game.id);
        dbExpansions = await fetchExpansionsForGame(game.id);
      } else if (hasDbExpansions && hasExpansionBgg) {
        // Check if any expansion still has a thumbnail URL that needs upgrading
        const needsImageUpdate = dbExpansions.some(
          (e) => e.itemType !== 'accessory' && e.image && (e.image.includes('_t.') || e.image.includes('/thumb/'))
        );
        if (needsImageUpdate) {
          fetchExpansions(game.expansionBggIds!).then(async (bggData) => {
            const bggMap = new Map(bggData.map((e) => [e.bggId, e]));
            let updated = false;
            for (const exp of dbExpansions) {
              const bgg = bggMap.get(exp.bggId);
              if (bgg?.image && bgg.image !== exp.image) {
                await supabase.from('owned_expansions').update({ image: bgg.image }).eq('id', exp.id);
                exp.image = bgg.image;
                updated = true;
              }
            }
            if (updated) {
              setExpansionMap((prev) => ({ ...prev, [game.id]: [...dbExpansions] }));
            }
          }).catch(() => {});
        }
      }

      setExpansionMap((prev) => ({ ...prev, [game.id]: dbExpansions }));
    } catch (err) {
      console.error('Failed to load expansions', err);
      message.error('Failed to load expansions');
    } finally {
      setLoadingExpansions((prev) => ({ ...prev, [game.id]: false }));
    }
  };

  const refreshExpansionSpent = async () => {
    try {
      const [total, byCurrency] = await Promise.all([fetchExpansionTotalSpent(), fetchExpansionSpentByCurrency()]);
      dispatch({ type: 'SET_EXPANSION_SPENT', payload: total });
      dispatch({ type: 'SET_EXPANSION_SPENT_BY_CURRENCY', payload: byCurrency });
      // Also refresh per-game costs
      const { data } = await supabase
        .from('owned_expansions')
        .select('base_game_id, price, currency, item_type')
        .eq('owned', true)
        .limit(10000);
      const map: Record<string, { exp: number; acc: number; ownedExpCount: number }> = {};
      for (const r of data || []) {
        const cny = toCNY(Number(r.price) || 0, r.currency || 'CNY');
        if (!map[r.base_game_id]) map[r.base_game_id] = { exp: 0, acc: 0, ownedExpCount: 0 };
        if (r.item_type === 'accessory') map[r.base_game_id].acc += cny;
        else { map[r.base_game_id].exp += cny; map[r.base_game_id].ownedExpCount++; }
      }
      setCostByGame(map);
    } catch { /* ignore */ }
  };

  const handleExpansionOwnedChange = async (exp: OwnedExpansion, owned: boolean) => {
    try {
      // Default date to base game's purchase date when marking as owned
      let date = exp.purchaseDate;
      let currency = exp.currency;
      if (owned && !date) {
        const baseGame = state.games.find((g) => g.id === exp.baseGameId);
        if (baseGame?.purchaseDate) date = baseGame.purchaseDate;
        if (baseGame?.currency) currency = baseGame.currency;
      }
      await updateExpansionOwnership(exp.id, owned, exp.price, currency, date);
      setExpansionMap((prev) => ({
        ...prev,
        [exp.baseGameId]: prev[exp.baseGameId].map((e) =>
          e.id === exp.id ? { ...e, owned, purchaseDate: date, currency } : e
        ),
      }));
      refreshExpansionSpent();
    } catch {
      message.error('Failed to update');
    }
  };

  const handleExpansionPriceChange = async (exp: OwnedExpansion, price: number | null, currency?: string) => {
    try {
      await updateExpansionOwnership(exp.id, exp.owned, price ?? undefined, currency || exp.currency, exp.purchaseDate);
      setExpansionMap((prev) => ({
        ...prev,
        [exp.baseGameId]: prev[exp.baseGameId].map((e) =>
          e.id === exp.id ? { ...e, price: price ?? undefined, currency: currency || e.currency } : e
        ),
      }));
      refreshExpansionSpent();
    } catch {
      message.error('Failed to update price');
    }
  };

  const handleExpansionDateChange = async (exp: OwnedExpansion, date: any) => {
    const dateStr = date ? date.format('YYYY-MM-DD') : undefined;
    try {
      await updateExpansionOwnership(exp.id, exp.owned, exp.price, exp.currency, dateStr);
      setExpansionMap((prev) => ({
        ...prev,
        [exp.baseGameId]: prev[exp.baseGameId].map((e) =>
          e.id === exp.id ? { ...e, purchaseDate: dateStr } : e
        ),
      }));
    } catch {
      message.error('Failed to update date');
    }
  };

  // Add Accessory modal state
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [accModalGame, setAccModalGame] = useState<BoardGame | null>(null);
  const [accManualName, setAccManualName] = useState('');
  const [bggAccessories, setBggAccessories] = useState<AccessoryInfo[]>([]);
  const [loadingBggAcc, setLoadingBggAcc] = useState(false);

  const openAccModal = async (game: BoardGame) => {
    setAccModalGame(game);
    setAccManualName('');
    setBggAccessories([]);
    setAccModalOpen(true);
    // Fetch BGG accessories if available
    if (game.accessoryBggIds?.length) {
      setLoadingBggAcc(true);
      try {
        const data = await fetchAccessories(game.accessoryBggIds);
        // Filter out already added ones
        const existing = (expansionMap[game.id] || []).map((e) => e.bggId);
        setBggAccessories(data.filter((a) => !existing.includes(a.bggId)));
      } catch {
        // ignore
      } finally {
        setLoadingBggAcc(false);
      }
    }
  };

  const handleAddAccessoryManual = async () => {
    if (!accModalGame || !accManualName.trim()) return;
    try {
      const acc = await insertAccessory(accModalGame.id, state.userId!, accManualName.trim(), undefined, accModalGame.currency, accModalGame.purchaseDate);
      setExpansionMap((prev) => ({
        ...prev,
        [accModalGame.id]: [...(prev[accModalGame.id] || []), acc],
      }));
      setAccManualName('');
      message.success('Accessory added');
    } catch {
      message.error('Failed to add accessory');
    }
  };

  const handleAddAccessoryFromBgg = async (info: AccessoryInfo) => {
    if (!accModalGame) return;
    try {
      const acc = await insertAccessory(accModalGame.id, state.userId!, info.name, undefined, accModalGame.currency, accModalGame.purchaseDate, info.image, info.bggId);
      setExpansionMap((prev) => ({
        ...prev,
        [accModalGame.id]: [...(prev[accModalGame.id] || []), acc],
      }));
      // Remove from list
      setBggAccessories((prev) => prev.filter((a) => a.bggId !== info.bggId));
      message.success('Accessory added');
    } catch {
      message.error('Failed to add accessory');
    }
  };

  const handleAccessoryOfficialChange = async (exp: OwnedExpansion, official: boolean) => {
    try {
      await updateAccessoryOfficial(exp.id, official);
      setExpansionMap((prev) => ({
        ...prev,
        [exp.baseGameId]: prev[exp.baseGameId].map((e) =>
          e.id === exp.id ? { ...e, official } : e
        ),
      }));
    } catch {
      message.error('Failed to update');
    }
  };

  const handleDeleteAccessory = async (exp: OwnedExpansion) => {
    try {
      await deleteAccessory(exp.id);
      setExpansionMap((prev) => ({
        ...prev,
        [exp.baseGameId]: prev[exp.baseGameId].filter((e) => e.id !== exp.id),
      }));
      refreshExpansionSpent();
      message.success('Accessory deleted');
    } catch {
      message.error('Failed to delete accessory');
    }
  };

  const columns = [
    {
      title: 'BGG Rank',
      dataIndex: 'bggRank',
      key: 'bggRank',
      width: 100,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.bggRank || 99999) - (b.bggRank || 99999),
      sortOrder: sorter.field === 'bggRank' ? sorter.order : undefined,
      render: (v: number) => (v ? v : '-'),
    },
    {
      title: 'Image',
      dataIndex: 'image',
      key: 'image',
      width: 90,
      align: 'center' as const,
      render: (url: string) => <HoverImage url={url} size={70} />,
    },
    {
      title: 'Name',
      key: 'name',
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => a.name.localeCompare(b.name),
      sortOrder: sorter.field === 'name' ? sorter.order : undefined,
      onCell: (r: BoardGame) => ({
        className: r.kickstarter ? 'ks-name-cell' : '',
      }),
      render: (_: any, r: BoardGame) => {
        const linkedGames = getLinkedGames(r);

        return (
          <div>
            <div style={{ fontWeight: 400, fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px', color: '#1d1d1f' }}>{r.name}</div>
            {r.nameEn && <div style={{ fontSize: 12, fontFamily: sfText, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)', marginTop: 1 }}>{r.nameEn}</div>}
            {r.gameType === 'base' && r.expansionBggIds && r.expansionBggIds.length > 0 && (() => {
              // Prefer expansionMap (updated immediately on toggle) over costByGame (async, can be stale)
              const exps = expansionMap[r.id];
              const owned = exps
                ? exps.filter((e) => e.itemType !== 'accessory' && e.owned).length
                : (costByGame[r.id]?.ownedExpCount || 0);
              const total = r.expansionBggIds.length;
              const allOwned = owned >= total;
              return (
                <div style={{ fontSize: 11, fontFamily: sfText, letterSpacing: '-0.08px', color: allOwned ? '#34c759' : '#0071e3', marginTop: 2 }}>
                  {owned}/{total} expansions
                </div>
              );
            })()}
            {linkedGames.length > 0 && (
              <LinkedTags games={linkedGames} onClickGame={(id) => scrollToGame(id)} />
            )}
          </div>
        );
      },
    },
    {
      title: 'Type',
      dataIndex: 'gameType',
      key: 'gameType',
      width: 100,
      align: 'center' as const,
      render: (v: string) => {
        const label = v === 'expansion' ? 'Expansion' : v === 'accessory' ? 'Accessory' : 'Base';
        const s = APPLE_TYPE_STYLES[v] || APPLE_TYPE_STYLES.base;
        return <ApplePill label={label} bg={s.bg} color={s.color} />;
      },
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      align: 'center' as const,
      render: (v: string) => {
        if (!v) return <span style={{ color: 'rgba(0,0,0,0.32)' }}>-</span>;
        const s = APPLE_CATEGORY_STYLES[v] || { bg: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.6)' };
        return <ApplePill label={v} bg={s.bg} color={s.color} />;
      },
    },
    {
      title: 'Players',
      dataIndex: 'players',
      key: 'players',
      width: 90,
      align: 'center' as const,
    },
    {
      title: 'Price',
      key: 'price',
      width: 170,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => {
        const aCost = toCNY(a.price || 0, a.currency) + (costByGame[a.id]?.exp || 0) + (costByGame[a.id]?.acc || 0);
        const bCost = toCNY(b.price || 0, b.currency) + (costByGame[b.id]?.exp || 0) + (costByGame[b.id]?.acc || 0);
        return aCost - bCost;
      },
      sortOrder: sorter.field === 'price' ? sorter.order : undefined,
      render: (_: any, r: BoardGame) => {
        if (r.price == null) return '-';
        const costs = costByGame[r.id];
        const expCny = Math.round(costs?.exp || 0);
        const accCny = Math.round(costs?.acc || 0);
        const hasExtra = expCny > 0 || accCny > 0;
        const baseCny = Math.round(toCNY(r.price || 0, r.currency));
        const total = baseCny + expCny + accCny;
        if (!hasExtra) {
          return <span style={{ fontFamily: sfText, fontSize: 14, fontWeight: 600, letterSpacing: '-0.224px', color: '#1d1d1f' }}>{CURRENCY_SYMBOLS[r.currency as Currency] || ''}{r.price}</span>;
        }
        const parts = [expCny > 0 ? `exp ¥${expCny}` : '', accCny > 0 ? `acc ¥${accCny}` : ''].filter(Boolean);
        return (
          <div>
            <div style={{ fontFamily: sfText, fontSize: 14, fontWeight: 600, letterSpacing: '-0.224px', color: '#1d1d1f' }}>¥{total}</div>
            <div style={{ fontSize: 11, fontFamily: sfText, letterSpacing: '-0.08px', color: 'rgba(0,0,0,0.48)' }}>
              base ¥{baseCny} + {parts.join(' + ')}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      width: 85,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.rating || 0) - (b.rating || 0),
      sortOrder: sorter.field === 'rating' ? sorter.order : undefined,
      render: (v: number) => (v ? `${v}/10` : '-'),
    },
    {
      title: 'BGG Avg',
      dataIndex: 'bggRating',
      key: 'bggRating',
      width: 85,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.bggRating || 0) - (b.bggRating || 0),
      sortOrder: sorter.field === 'bggRating' ? sorter.order : undefined,
      render: (v: number) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: 'Weight',
      dataIndex: 'weight',
      key: 'weight',
      width: 80,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.weight || 0) - (b.weight || 0),
      sortOrder: sorter.field === 'weight' ? sorter.order : undefined,
      render: (v: number) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: 'Year',
      dataIndex: 'yearPublished',
      key: 'yearPublished',
      width: 70,
      align: 'center' as const,
    },
    {
      title: 'Designer',
      dataIndex: 'designer',
      key: 'designer',
      width: 140,
      align: 'center' as const,
      ellipsis: true,
    },
    {
      title: 'Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      width: 120,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => a.purchaseDate.localeCompare(b.purchaseDate),
      sortOrder: sorter.field === 'purchaseDate' ? sorter.order : undefined,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      align: 'center' as const,
      render: (_: any, r: BoardGame) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            style={{ color: 'rgba(0,0,0,0.32)' }}
            onClick={() => {
              const params = new URLSearchParams();
              params.set('edit', r.id);
              if (search) params.set('q', search);
              if (categoryFilter) params.set('cat', categoryFilter);
              navigate(`/add?${params.toString()}`);
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            style={{ color: '#5ac8fa' }}
            onClick={() => openLinkModal(r)}
          />
          <Button
            type="text"
            size="small"
            icon={<DollarOutlined />}
            style={{ color: '#34c759' }}
            onClick={() => openSellModal(r)}
          />
          <Popconfirm title="Delete this game?" onConfirm={() => handleDelete(r.id)}>
            <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#ff3b30' }} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Expansion sub-table: columns aligned with main table
  const expansionColumns = [
    {
      title: 'Owned',
      key: 'owned',
      width: 75,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) => (
        <Checkbox
          checked={r.owned}
          onChange={(e) => handleExpansionOwnedChange(r, e.target.checked)}
        />
      ),
    },
    {
      title: 'Image',
      dataIndex: 'image',
      key: 'image',
      width: 90,
      align: 'center' as const,
      render: (url: string) => <HoverImage url={url} size={50} />,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      align: 'center' as const,
      ellipsis: true,
      render: (v: string, r: OwnedExpansion) => (
        <span style={{ opacity: r.owned ? 1 : 0.5 }}>{v}</span>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      width: 100,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) => {
        const type = r.itemType === 'accessory' ? 'accessory' : 'expansion';
        const label = r.itemType === 'accessory' ? 'Accessory' : 'Expansion';
        const s = APPLE_TYPE_STYLES[type];
        return <ApplePill label={label} bg={s.bg} color={s.color} />;
      },
    },
    {
      title: 'Official',
      key: 'official',
      width: 75,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) =>
        r.itemType === 'accessory' ? (
          <Checkbox
            checked={r.official}
            onChange={(e) => handleAccessoryOfficialChange(r, e.target.checked)}
          />
        ) : null,
    },
    {
      title: 'Price',
      key: 'price',
      width: 170,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) => (
        <Space size={4}>
          <InputNumber
            size="small"
            style={{ width: 70 }}
            min={0}
            value={r.price}
            placeholder="0"
            disabled={!r.owned}
            onChange={(val) => handleExpansionPriceChange(r, val)}
          />
          <Select
            size="small"
            style={{ width: 58 }}
            value={r.currency || 'CNY'}
            disabled={!r.owned}
            onChange={(val) => handleExpansionPriceChange(r, r.price ?? null, val)}
            options={[
              { label: '¥', value: 'CNY' },
              { label: '$', value: 'USD' },
              { label: '€', value: 'EUR' },
              { label: '£', value: 'GBP' },
              { label: 'S$', value: 'SGD' },
            ]}
          />
        </Space>
      ),
    },
    {
      title: 'BGG Avg',
      dataIndex: 'bggRating',
      key: 'bggRating',
      width: 85,
      align: 'center' as const,
      render: (v: number) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: 'Weight',
      dataIndex: 'weight',
      key: 'weight',
      width: 80,
      align: 'center' as const,
      render: (v: number) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: 'Year',
      dataIndex: 'yearPublished',
      key: 'yearPublished',
      width: 70,
      align: 'center' as const,
    },
    {
      title: 'Date',
      key: 'purchaseDate',
      width: 140,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) => (
        <DatePicker
          size="small"
          style={{ width: 130 }}
          value={r.purchaseDate ? dayjs(r.purchaseDate) : null}
          disabled={!r.owned}
          onChange={(date) => handleExpansionDateChange(r, date)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      align: 'center' as const,
      render: (_: any, r: OwnedExpansion) =>
        r.itemType === 'accessory' ? (
          <Popconfirm title="Delete this accessory?" onConfirm={() => handleDeleteAccessory(r)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div style={{ fontFamily: sfText }}>
      <h1 style={{
        fontSize: 40,
        fontWeight: 600,
        fontFamily: sfDisplay,
        lineHeight: 1.1,
        letterSpacing: '-0.5px',
        color: '#1d1d1f',
        margin: '0 0 24px 0',
      }}>
        My Collection
      </h1>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search games..."
          prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.32)' }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240, borderRadius: 8, fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}
          allowClear
        />
        <Select
          placeholder="Filter by category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowClear
          style={{ width: 200 }}
          options={CATEGORIES.map((c) => ({ label: c, value: c }))}
        />
        <span style={{ color: 'rgba(0,0,0,0.48)', fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}>{filtered.length} games</span>
      </Space>
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        size="small"
        scroll={{ x: 1600 }}
        pagination={{ pageSize, current: currentPage, onChange: (p) => setCurrentPage(p) }}
        onChange={(_pagination, _filters, s) => {
          const srt = Array.isArray(s) ? s[0] : s;
          const newSorter = { field: srt?.columnKey as string, order: srt?.order || undefined };
          setSorter(newSorter);
          localStorage.setItem('bgc-collection-sort', JSON.stringify(newSorter));
        }}
        rowClassName={(r) => (r.id === highlightedId ? 'linked-highlight' : '')}
        expandable={{
          rowExpandable: (record) => record.gameType === 'base',
          onExpand: (expanded, record) => {
            if (expanded) loadExpansions(record);
          },
          expandedRowRender: (record) => {
            const exps = expansionMap[record.id];
            const isLoading = loadingExpansions[record.id];

            if (isLoading) {
              return (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Spin tip="Loading expansions from BGG..." />
                </div>
              );
            }

            const expansions = (exps || []).filter((e) => e.itemType !== 'accessory');
            const ownedCount = expansions.filter((e) => e.owned).length;

            return (
              <div style={{ paddingLeft: 16 }}>
                {expansions.length > 0 && (
                  <div style={{ marginBottom: 8, fontSize: 13, fontFamily: sfText, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)' }}>
                    {ownedCount} / {expansions.length} expansions owned
                  </div>
                )}
                {(exps && exps.length > 0) && (
                  <Table
                    dataSource={exps}
                    columns={expansionColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                    rowClassName={(r) => (r.owned ? '' : 'expansion-unowned')}
                  />
                )}
                {(!exps || exps.length === 0) && (
                  <div style={{ padding: '4px 0 8px', color: 'rgba(0,0,0,0.48)', fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px' }}>No expansions or accessories yet</div>
                )}
                <Button
                  type="dashed"
                  size="small"
                  style={{ marginTop: 8 }}
                  onClick={() => openAccModal(record)}
                >
                  + Add Accessory
                </Button>
              </div>
            );
          },
        }}
      />
      </div>

      <Modal
        title={`Sell: ${sellingGame?.name || ''}`}
        open={sellModalOpen}
        onOk={handleSell}
        onCancel={() => setSellModalOpen(false)}
        okText="Confirm Sell"
      >
        {sellingGame && (
          <div style={{ marginBottom: 16, color: 'rgba(0,0,0,0.48)', fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}>
            Bought for: {CURRENCY_SYMBOLS[sellingGame.currency as Currency] || ''}{sellingGame.price}
          </div>
        )}
        <Form form={sellForm} layout="vertical">
          <Form.Item name="soldPrice" label="Sell Price" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="soldCurrency" label="Currency">
            <Select
              options={[
                { label: 'CNY ¥', value: 'CNY' },
                { label: 'USD $', value: 'USD' },
                { label: 'EUR €', value: 'EUR' },
                { label: 'GBP £', value: 'GBP' },
                { label: 'JPY ¥', value: 'JPY' },
                { label: 'SGD S$', value: 'SGD' },
              ]}
            />
          </Form.Item>
          <Form.Item name="soldDate" label="Sell Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="soldNotes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Link: ${linkingGame?.name || ''}`}
        open={linkModalOpen}
        onOk={handleLinkSave}
        onCancel={() => { setLinkModalOpen(false); setLinkingGame(null); }}
        okText="Save"
      >
        <div style={{ marginBottom: 12, color: 'rgba(0,0,0,0.48)', fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px' }}>
          Select games to link as related versions (e.g. different editions).
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="Search and select games..."
          value={selectedLinkIds}
          onChange={setSelectedLinkIds}
          optionFilterProp="label"
          showSearch
          options={state.games
            .filter((g) => !g.sold && g.id !== linkingGame?.id)
            .map((g) => ({
              label: `${g.name}${g.yearPublished ? ` (${g.yearPublished})` : ''}`,
              value: g.id,
            }))}
        />
      </Modal>

      <Modal
        title={`Add Accessory: ${accModalGame?.name || ''}`}
        open={accModalOpen}
        onCancel={() => { setAccModalOpen(false); setAccModalGame(null); }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Manual Input</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Accessory name..."
              value={accManualName}
              onChange={(e) => setAccManualName(e.target.value)}
              onPressEnter={handleAddAccessoryManual}
            />
            <Button type="primary" onClick={handleAddAccessoryManual} disabled={!accManualName.trim()}>
              Add
            </Button>
          </Space.Compact>
        </div>
        {accModalGame?.accessoryBggIds && accModalGame.accessoryBggIds.length > 0 && (
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>BGG Accessories</div>
            {loadingBggAcc ? (
              <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>
            ) : bggAccessories.length > 0 ? (
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {bggAccessories.map((a) => (
                  <div key={a.bggId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {a.image ? <HoverImage url={a.image} size={32} side="left" /> : <div style={{ width: 32, height: 32, background: '#f5f5f7', borderRadius: 8 }} />}
                      <span style={{ fontSize: 13, fontFamily: sfText, letterSpacing: '-0.12px', color: '#1d1d1f' }}>{a.name}</span>
                    </div>
                    <Button size="small" type="link" onClick={() => handleAddAccessoryFromBgg(a)}>Add</Button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(0,0,0,0.48)', fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px' }}>All BGG accessories already added</div>
            )}
          </div>
        )}
      </Modal>

      <style>{`
        .expansion-unowned td {
          opacity: 0.55;
        }
        .expansion-unowned td:first-child {
          opacity: 1;
        }
        .ant-table-row td {
          position: relative;
          overflow: hidden;
        }
        .ks-name-cell {
          position: relative;
          overflow: hidden;
        }
        .ks-name-cell::after {
          content: '';
          position: absolute;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 120px;
          height: 120px;
          background: url('/ks-badge.png') no-repeat center / contain;
          opacity: 0.35;
          pointer-events: none;
        }
        .linked-highlight td {
          animation: highlightFade 2s ease-out;
        }
        @keyframes highlightFade {
          0% { background-color: rgba(0, 113, 227, 0.08); }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
}
