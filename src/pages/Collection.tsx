import {
  Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Spin, Table, Tag, Typography, message,
} from 'antd';
import { DeleteOutlined, DollarOutlined, EditOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useGameStore } from '../store/gameStore';
import { CATEGORIES, CATEGORY_COLORS, CURRENCY_SYMBOLS } from '../types';
import type { BoardGame, Currency, OwnedExpansion } from '../types';
import { deleteGame, updateGame, updateLinkedGameIds, fetchExpansionsForGame, upsertExpansions, updateExpansionOwnership, insertAccessory, deleteAccessory, fetchExpansionTotalSpent, fetchExpansionSpentByCurrency } from '../utils/db';
import { fetchExpansions } from '../utils/bgg';

const { Title } = Typography;

export default function Collection() {
  const { state, dispatch } = useGameStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellingGame, setSellingGame] = useState<BoardGame | null>(null);
  const [sellForm] = Form.useForm();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [sorter, setSorter] = useState<{ field?: string; order?: 'ascend' | 'descend' }>({});

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
    price: (a, b) => a.price - b.price,
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

      // Fetch BGG expansions if not yet cached
      const hasExpansionBgg = game.expansionBggIds && game.expansionBggIds.length > 0;
      const hasDbExpansions = dbExpansions.some((e) => e.itemType !== 'accessory');
      if (!hasDbExpansions && hasExpansionBgg) {
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

  const handleAddAccessory = async (game: BoardGame) => {
    const name = window.prompt('Accessory name:');
    if (!name?.trim()) return;
    try {
      const acc = await insertAccessory(game.id, state.userId!, name.trim(), undefined, game.currency, game.purchaseDate);
      setExpansionMap((prev) => ({
        ...prev,
        [game.id]: [...(prev[game.id] || []), acc],
      }));
      message.success('Accessory added');
    } catch {
      message.error('Failed to add accessory');
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
      render: (v: number) => (v ? v : '-'),
    },
    {
      title: 'Image',
      dataIndex: 'image',
      key: 'image',
      width: 90,
      align: 'center' as const,
      render: (url: string) =>
        url ? (
          <img src={url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 70, height: 70, background: '#f0f0f0', borderRadius: 4 }} />
        ),
    },
    {
      title: 'Name',
      key: 'name',
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => a.name.localeCompare(b.name),
      onCell: (r: BoardGame) => ({
        className: r.kickstarter ? 'ks-name-cell' : '',
      }),
      render: (_: any, r: BoardGame) => {
        const linkedGames = getLinkedGames(r);

        return (
          <div>
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            {r.nameEn && <div style={{ fontSize: 12, color: '#999' }}>{r.nameEn}</div>}
            {r.gameType === 'base' && r.expansionBggIds && r.expansionBggIds.length > 0 && (
              <div style={{ fontSize: 11, color: '#1677ff', marginTop: 2 }}>
                {r.expansionBggIds.length} expansions
              </div>
            )}
            {linkedGames.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {linkedGames.map((lg) => (
                  <Tag
                    key={lg.id}
                    icon={<LinkOutlined />}
                    color="cyan"
                    style={{ cursor: 'pointer', fontSize: 11, marginTop: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToGame(lg.id);
                    }}
                  >
                    {lg.name}{lg.yearPublished ? ` (${lg.yearPublished})` : ''}
                  </Tag>
                ))}
              </div>
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
        const conf = v === 'expansion' ? { color: 'orange', label: 'Expansion' }
          : v === 'accessory' ? { color: 'purple', label: 'Accessory' }
          : { color: 'blue', label: 'Base' };
        return <Tag color={conf.color}>{conf.label}</Tag>;
      },
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      align: 'center' as const,
      render: (v: string) => v ? <Tag color={CATEGORY_COLORS[v]}>{v}</Tag> : '-',
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
      sorter: (a: BoardGame, b: BoardGame) => a.price - b.price,
      render: (_: any, r: BoardGame) =>
        `${CURRENCY_SYMBOLS[r.currency as Currency] || ''}${r.price}`,
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      width: 85,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.rating || 0) - (b.rating || 0),
      render: (v: number) => (v ? `${v}/10` : '-'),
    },
    {
      title: 'BGG Avg',
      dataIndex: 'bggRating',
      key: 'bggRating',
      width: 85,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.bggRating || 0) - (b.bggRating || 0),
      render: (v: number) => (v ? v.toFixed(1) : '-'),
    },
    {
      title: 'Weight',
      dataIndex: 'weight',
      key: 'weight',
      width: 80,
      align: 'center' as const,
      sorter: (a: BoardGame, b: BoardGame) => (a.weight || 0) - (b.weight || 0),
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
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      align: 'center' as const,
      render: (_: any, r: BoardGame) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/add?edit=${r.id}`)}
          />
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            style={{ color: '#13c2c2' }}
            onClick={() => openLinkModal(r)}
          />
          <Button
            type="link"
            size="small"
            icon={<DollarOutlined />}
            style={{ color: '#52c41a' }}
            onClick={() => openSellModal(r)}
          />
          <Popconfirm title="Delete this game?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
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
      render: (url: string) =>
        url ? (
          <img src={url} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 3 }} />
        ) : (
          <div style={{ width: 50, height: 50, background: '#f0f0f0', borderRadius: 3 }} />
        ),
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
      render: (_: any, r: OwnedExpansion) => (
        <Tag color={r.itemType === 'accessory' ? 'purple' : 'orange'}>
          {r.itemType === 'accessory' ? 'Accessory' : 'Expansion'}
        </Tag>
      ),
    },
    {
      title: 'Players',
      key: 'players',
      width: 90,
      align: 'center' as const,
      render: () => '-',
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
    <div>
      <Title level={3}>My Collection</Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search games..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
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
        <span style={{ color: '#999' }}>{filtered.length} games</span>
      </Space>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        size="small"
        scroll={{ x: 1600 }}
        pagination={{ pageSize, current: currentPage, onChange: (p) => setCurrentPage(p) }}
        onChange={(_pagination, _filters, s) => {
          const srt = Array.isArray(s) ? s[0] : s;
          setSorter({ field: srt?.columnKey as string, order: srt?.order || undefined });
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
                  <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
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
                  <div style={{ padding: '4px 0 8px', color: '#999', fontSize: 13 }}>No expansions or accessories yet</div>
                )}
                <Button
                  type="dashed"
                  size="small"
                  style={{ marginTop: 8 }}
                  onClick={() => handleAddAccessory(record)}
                >
                  + Add Accessory
                </Button>
              </div>
            );
          },
        }}
      />

      <Modal
        title={`Sell: ${sellingGame?.name || ''}`}
        open={sellModalOpen}
        onOk={handleSell}
        onCancel={() => setSellModalOpen(false)}
        okText="Confirm Sell"
      >
        {sellingGame && (
          <div style={{ marginBottom: 16, color: '#999' }}>
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
        <div style={{ marginBottom: 12, color: '#999', fontSize: 13 }}>
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
          0% { background-color: #e6f7ff; }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
}
