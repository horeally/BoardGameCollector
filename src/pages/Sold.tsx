import { Button, Popconfirm, Spin, Table, Tag, Typography, message } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { BoardGame, Currency, OwnedExpansion } from '../types';
import { updateGame } from '../utils/db';
import { supabase } from '../utils/supabase';
import StatCard from '../components/StatCard';
import { Col, Row } from 'antd';

const { Title } = Typography;

function CurrencyBreakdown({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) return <div style={{ fontSize: 24, fontWeight: 500 }}>0</div>;
  return (
    <div>
      {entries.map(([currency, amount]) => (
        <div key={currency} style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.4 }}>
          {CURRENCY_SYMBOLS[currency as Currency] || ''}{Math.round(amount)}
        </div>
      ))}
    </div>
  );
}

export default function Sold() {
  const { state, dispatch } = useGameStore();
  const [expansionsByGame, setExpansionsByGame] = useState<Record<string, OwnedExpansion[]>>({});
  const [loading, setLoading] = useState(true);

  const soldGames = state.games.filter((g) => g.sold);
  const soldGameIds = soldGames.map((g) => g.id);

  // Fetch owned expansions for all sold games
  useEffect(() => {
    if (soldGameIds.length === 0) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('owned_expansions')
        .select('*')
        .eq('owned', true)
        .in('base_game_id', soldGameIds);
      const map: Record<string, OwnedExpansion[]> = {};
      for (const r of data || []) {
        const exp: OwnedExpansion = {
          id: r.id, userId: r.user_id, baseGameId: r.base_game_id,
          bggId: r.bgg_id, name: r.name, image: r.image, owned: r.owned,
          price: r.price ? Number(r.price) : undefined,
          currency: r.currency, purchaseDate: r.purchase_date,
        };
        if (!map[exp.baseGameId]) map[exp.baseGameId] = [];
        map[exp.baseGameId].push(exp);
      }
      setExpansionsByGame(map);
      setLoading(false);
    })();
  }, [soldGameIds.join(',')]);

  // Get expansion cost in CNY for a game
  const expCostCny = (gameId: string): number => {
    return (expansionsByGame[gameId] || []).reduce((sum, e) => {
      return sum + (e.price ? toCNY(e.price, e.currency || 'CNY') : 0);
    }, 0);
  };

  // Get expansion cost by currency for a game
  const expCostByCurrency = (gameId: string): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const e of expansionsByGame[gameId] || []) {
      if (e.price) {
        const c = e.currency || 'CNY';
        map[c] = (map[c] || 0) + e.price;
      }
    }
    return map;
  };

  const boughtByCurrency: Record<string, number> = {};
  const soldByCurrency: Record<string, number> = {};
  for (const g of soldGames) {
    const bc = g.currency || 'CNY';
    boughtByCurrency[bc] = (boughtByCurrency[bc] || 0) + g.price;
    // Add expansion costs
    for (const [c, amount] of Object.entries(expCostByCurrency(g.id))) {
      boughtByCurrency[c] = (boughtByCurrency[c] || 0) + amount;
    }
    const sc = g.soldCurrency || bc;
    soldByCurrency[sc] = (soldByCurrency[sc] || 0) + (g.soldPrice || 0);
  }

  const totalProfit = soldGames.reduce((sum, g) => {
    const sellCny = toCNY(g.soldPrice || 0, g.soldCurrency || g.currency);
    const buyCny = toCNY(g.price, g.currency) + expCostCny(g.id);
    return sum + sellCny - buyCny;
  }, 0);
  const totalProfitRounded = Math.round(totalProfit);

  const handleUnsell = async (game: BoardGame) => {
    const updatedGame = {
      ...game,
      sold: false,
      soldPrice: undefined,
      soldCurrency: undefined,
      soldDate: undefined,
      soldNotes: undefined,
    };
    try {
      await updateGame(updatedGame, state.userId!);
      dispatch({ type: 'UPDATE_GAME', payload: updatedGame });
      message.success('Game moved back to collection');
    } catch {
      message.error('Failed to update game');
    }
  };

  const columns = [
    {
      title: 'Image',
      dataIndex: 'image',
      key: 'image',
      width: 60,
      render: (url: string) =>
        url ? (
          <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
        ) : (
          <div style={{ width: 40, height: 40, background: '#f0f0f0', borderRadius: 4 }} />
        ),
    },
    {
      title: 'Name',
      key: 'name',
      sorter: (a: BoardGame, b: BoardGame) => a.name.localeCompare(b.name),
      render: (_: any, r: BoardGame) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.nameEn && <div style={{ fontSize: 12, color: '#999' }}>{r.nameEn}</div>}
        </div>
      ),
    },
    {
      title: 'Buy Price',
      key: 'buyPrice',
      width: 130,
      render: (_: any, r: BoardGame) => {
        const exps = expansionsByGame[r.id];
        const hasExp = exps && exps.length > 0;
        return (
          <div>
            <div>{CURRENCY_SYMBOLS[r.currency as Currency] || ''}{r.price}</div>
            {hasExp && (
              <div style={{ fontSize: 11, color: '#999' }}>
                +{exps.length} exp: ¥{Math.round(expCostCny(r.id))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Sell Price',
      key: 'sellPrice',
      width: 110,
      render: (_: any, r: BoardGame) =>
        `${CURRENCY_SYMBOLS[(r.soldCurrency || r.currency) as Currency] || ''}${r.soldPrice || 0}`,
    },
    {
      title: 'Profit/Loss (CNY)',
      key: 'profit',
      width: 140,
      sorter: (a: BoardGame, b: BoardGame) => {
        const da = toCNY(a.soldPrice || 0, a.soldCurrency || a.currency) - toCNY(a.price, a.currency) - expCostCny(a.id);
        const db = toCNY(b.soldPrice || 0, b.soldCurrency || b.currency) - toCNY(b.price, b.currency) - expCostCny(b.id);
        return da - db;
      },
      render: (_: any, r: BoardGame) => {
        const buyCny = toCNY(r.price, r.currency) + expCostCny(r.id);
        const sellCny = toCNY(r.soldPrice || 0, r.soldCurrency || r.currency);
        const diff = Math.round(sellCny - buyCny);
        const color = diff > 0 ? '#52c41a' : diff < 0 ? '#ff4d4f' : '#999';
        const prefix = diff > 0 ? '+' : '';
        return (
          <span style={{ color, fontWeight: 600 }}>
            {prefix}¥{diff}
          </span>
        );
      },
    },
    {
      title: 'Buy Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      width: 110,
    },
    {
      title: 'Sell Date',
      dataIndex: 'soldDate',
      key: 'soldDate',
      width: 110,
    },
    {
      title: 'Type',
      dataIndex: 'gameType',
      key: 'gameType',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'expansion' ? 'orange' : 'blue'}>
          {v === 'expansion' ? 'Expansion' : 'Base'}
        </Tag>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'soldNotes',
      key: 'soldNotes',
      ellipsis: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: any, r: BoardGame) => (
        <Popconfirm title="Move back to collection?" onConfirm={() => handleUnsell(r)}>
          <Button type="link" size="small" icon={<UndoOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>Sold Games</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <StatCard title="Games Sold" value={soldGames.length} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Total Bought">
            <CurrencyBreakdown totals={boughtByCurrency} />
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Total Sold">
            <CurrencyBreakdown totals={soldByCurrency} />
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Total Profit (CNY)">
            <div style={{
              fontSize: 24,
              fontWeight: 500,
              color: totalProfitRounded > 0 ? '#52c41a' : totalProfitRounded < 0 ? '#ff4d4f' : undefined,
            }}>
              {totalProfitRounded > 0 ? '+' : ''}¥{totalProfitRounded}
            </div>
          </StatCard>
        </Col>
      </Row>

      <Table
        dataSource={soldGames}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
