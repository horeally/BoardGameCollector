import { Button, Col, Input, Popconfirm, Row, Spin, Table, message } from 'antd';
import { SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { BoardGame, Currency } from '../types';
import { updateGame } from '../utils/db';
import { supabase } from '../utils/supabase';

const sfDisplay = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
const sfText = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

function CurrencyBreakdown({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) return <div style={{ fontSize: 28, fontWeight: 600, fontFamily: sfDisplay, color: '#fff' }}>0</div>;
  return (
    <div>
      {entries.map(([currency, amount]) => (
        <div key={currency} style={{
          fontSize: 28,
          fontWeight: 600,
          fontFamily: sfDisplay,
          lineHeight: 1.3,
          letterSpacing: '-0.28px',
          color: '#fff',
        }}>
          {CURRENCY_SYMBOLS[currency as Currency] || ''}{Math.round(amount)}
          <span style={{
            fontSize: 12,
            fontWeight: 400,
            fontFamily: sfText,
            color: 'rgba(255,255,255,0.48)',
            marginLeft: 4,
            letterSpacing: '-0.08px',
          }}>{currency}</span>
        </div>
      ))}
    </div>
  );
}

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 14,
        fontFamily: sfText,
        color: 'rgba(255,255,255,0.48)',
        letterSpacing: '-0.224px',
        marginBottom: 8,
      }}>{label}</div>
      {children}
    </div>
  );
}

export default function Sold() {
  const { state, dispatch } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const soldGames = state.games.filter((g) => {
    if (!g.sold) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return g.name.toLowerCase().includes(q) || g.nameEn?.toLowerCase().includes(q);
  });
  const soldGameIds = soldGames.map((g) => g.id);

  const [costByGame, setCostByGame] = useState<Record<string, { exp: number; acc: number; expByCurrency: Record<string, number>; accByCurrency: Record<string, number> }>>({});

  useEffect(() => {
    if (soldGameIds.length === 0) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('owned_expansions')
        .select('base_game_id, price, currency, item_type')
        .eq('owned', true)
        .in('base_game_id', soldGameIds);
      const map: Record<string, { exp: number; acc: number; expByCurrency: Record<string, number>; accByCurrency: Record<string, number> }> = {};
      for (const r of data || []) {
        const p = Number(r.price) || 0;
        if (p <= 0) continue;
        const c = r.currency || 'CNY';
        const cny = toCNY(p, c);
        if (!map[r.base_game_id]) map[r.base_game_id] = { exp: 0, acc: 0, expByCurrency: {}, accByCurrency: {} };
        const entry = map[r.base_game_id];
        if (r.item_type === 'accessory') {
          entry.acc += cny;
          entry.accByCurrency[c] = (entry.accByCurrency[c] || 0) + p;
        } else {
          entry.exp += cny;
          entry.expByCurrency[c] = (entry.expByCurrency[c] || 0) + p;
        }
      }
      setCostByGame(map);
      setLoading(false);
    })();
  }, [soldGameIds.join(',')]);

  const gameCostCny = (g: BoardGame) => {
    const base = toCNY(g.price || 0, g.currency);
    const costs = costByGame[g.id];
    return base + (costs?.exp || 0) + (costs?.acc || 0);
  };

  const boughtByCurrency: Record<string, number> = {};
  const soldByCurrency: Record<string, number> = {};
  for (const g of soldGames) {
    const bc = g.currency || 'CNY';
    boughtByCurrency[bc] = (boughtByCurrency[bc] || 0) + (g.price || 0);
    const costs = costByGame[g.id];
    if (costs) {
      for (const [c, amount] of Object.entries(costs.expByCurrency)) {
        boughtByCurrency[c] = (boughtByCurrency[c] || 0) + amount;
      }
      for (const [c, amount] of Object.entries(costs.accByCurrency)) {
        boughtByCurrency[c] = (boughtByCurrency[c] || 0) + amount;
      }
    }
    const sc = g.soldCurrency || bc;
    soldByCurrency[sc] = (soldByCurrency[sc] || 0) + (g.soldPrice || 0);
  }

  const totalProfit = soldGames.reduce((sum, g) => {
    const sellCny = toCNY(g.soldPrice || 0, g.soldCurrency || g.currency);
    return sum + sellCny - gameCostCny(g);
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
      width: 56,
      render: (url: string) =>
        url ? (
          <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
        ) : (
          <div style={{ width: 40, height: 40, background: '#f5f5f7', borderRadius: 8 }} />
        ),
    },
    {
      title: 'Name',
      key: 'name',
      sorter: (a: BoardGame, b: BoardGame) => a.name.localeCompare(b.name),
      render: (_: any, r: BoardGame) => (
        <div>
          <div style={{
            fontWeight: 400,
            fontFamily: sfText,
            fontSize: 14,
            letterSpacing: '-0.224px',
            color: '#1d1d1f',
          }}>{r.name}</div>
          {r.nameEn && <div style={{
            fontSize: 12,
            fontFamily: sfText,
            letterSpacing: '-0.12px',
            color: 'rgba(0,0,0,0.48)',
            marginTop: 1,
          }}>{r.nameEn}</div>}
        </div>
      ),
    },
    {
      title: 'Buy Price',
      key: 'buyPrice',
      width: 150,
      render: (_: any, r: BoardGame) => {
        const baseCny = Math.round(toCNY(r.price || 0, r.currency));
        const costs = costByGame[r.id];
        const expCny = Math.round(costs?.exp || 0);
        const accCny = Math.round(costs?.acc || 0);
        const total = baseCny + expCny + accCny;
        const hasExtra = expCny > 0 || accCny > 0;
        const parts = [expCny > 0 ? `exp ¥${expCny}` : '', accCny > 0 ? `acc ¥${accCny}` : ''].filter(Boolean);
        return (
          <div>
            <div style={{ fontFamily: sfText, fontSize: 14, fontWeight: 600, letterSpacing: '-0.224px', color: '#1d1d1f' }}>¥{total}</div>
            {hasExtra && (
              <div style={{ fontSize: 11, fontFamily: sfText, letterSpacing: '-0.08px', color: 'rgba(0,0,0,0.48)' }}>
                base ¥{baseCny} + {parts.join(' + ')}
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
      render: (_: any, r: BoardGame) => (
        <span style={{ fontFamily: sfText, fontSize: 14, fontWeight: 600, letterSpacing: '-0.224px', color: '#1d1d1f' }}>
          {CURRENCY_SYMBOLS[(r.soldCurrency || r.currency) as Currency] || ''}{r.soldPrice || 0}
        </span>
      ),
    },
    {
      title: 'Profit/Loss',
      key: 'profit',
      width: 120,
      sorter: (a: BoardGame, b: BoardGame) => {
        const da = toCNY(a.soldPrice || 0, a.soldCurrency || a.currency) - gameCostCny(a);
        const db = toCNY(b.soldPrice || 0, b.soldCurrency || b.currency) - gameCostCny(b);
        return da - db;
      },
      render: (_: any, r: BoardGame) => {
        const buyCny = gameCostCny(r);
        const sellCny = toCNY(r.soldPrice || 0, r.soldCurrency || r.currency);
        const diff = Math.round(sellCny - buyCny);
        const color = diff > 0 ? '#34c759' : diff < 0 ? '#ff3b30' : 'rgba(0,0,0,0.48)';
        const prefix = diff > 0 ? '+' : '';
        return (
          <span style={{ color, fontWeight: 600, fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}>
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
      render: (v: string) => (
        <span style={{ fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)' }}>{v}</span>
      ),
    },
    {
      title: 'Sell Date',
      dataIndex: 'soldDate',
      key: 'soldDate',
      width: 110,
      render: (v: string) => (
        <span style={{ fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)' }}>{v}</span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'gameType',
      key: 'gameType',
      width: 90,
      render: (v: string) => {
        const conf = v === 'expansion'
          ? { bg: 'rgba(255, 149, 0, 0.12)', color: '#ff9500', label: 'Expansion' }
          : v === 'accessory'
          ? { bg: 'rgba(175, 82, 222, 0.12)', color: '#af52de', label: 'Accessory' }
          : { bg: 'rgba(0, 113, 227, 0.12)', color: '#0071e3', label: 'Base' };
        return (
          <span style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 980,
            background: conf.bg,
            color: conf.color,
            fontSize: 12,
            fontFamily: sfText,
            fontWeight: 600,
            letterSpacing: '-0.12px',
          }}>
            {conf.label}
          </span>
        );
      },
    },
    {
      title: 'Notes',
      dataIndex: 'soldNotes',
      key: 'soldNotes',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ fontFamily: sfText, fontSize: 13, letterSpacing: '-0.12px', color: 'rgba(0,0,0,0.48)' }}>{v}</span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: any, r: BoardGame) => (
        <Popconfirm title="Move back to collection?" onConfirm={() => handleUnsell(r)}>
          <Button type="text" size="small" icon={<UndoOutlined />} style={{ color: 'rgba(0,0,0,0.32)' }} />
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
    <div style={{ fontFamily: sfText }}>
      {/* Page Title */}
      <h1 style={{
        fontSize: 40,
        fontWeight: 600,
        fontFamily: sfDisplay,
        lineHeight: 1.1,
        letterSpacing: '-0.5px',
        color: '#1d1d1f',
        margin: '0 0 24px 0',
      }}>
        Sold Games
      </h1>

      {/* Hero Stats — Black immersive section */}
      <div style={{
        background: '#000',
        borderRadius: 12,
        padding: '28px 32px',
        marginBottom: 24,
      }}>
        <Row gutter={[32, 20]}>
          <Col xs={12} sm={6}>
            <StatBlock label="Games Sold">
              <div style={{
                fontSize: 28,
                fontWeight: 600,
                fontFamily: sfDisplay,
                lineHeight: 1.14,
                letterSpacing: '-0.28px',
                color: '#fff',
              }}>{soldGames.length}</div>
            </StatBlock>
          </Col>
          <Col xs={12} sm={6}>
            <StatBlock label="Total Bought">
              <CurrencyBreakdown totals={boughtByCurrency} />
            </StatBlock>
          </Col>
          <Col xs={12} sm={6}>
            <StatBlock label="Total Sold">
              <CurrencyBreakdown totals={soldByCurrency} />
            </StatBlock>
          </Col>
          <Col xs={12} sm={6}>
            <StatBlock label="Profit (CNY)">
              <div style={{
                fontSize: 28,
                fontWeight: 600,
                fontFamily: sfDisplay,
                lineHeight: 1.3,
                letterSpacing: '-0.28px',
                color: totalProfitRounded > 0 ? '#34c759' : totalProfitRounded < 0 ? '#ff3b30' : '#fff',
              }}>
                {totalProfitRounded > 0 ? '+' : ''}¥{totalProfitRounded}
              </div>
            </StatBlock>
          </Col>
        </Row>
      </div>

      {/* Search */}
      <Input
        placeholder="Search sold games..."
        prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.32)' }} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: 260,
          marginBottom: 16,
          borderRadius: 8,
          fontFamily: sfText,
          fontSize: 14,
          letterSpacing: '-0.224px',
        }}
        allowClear
      />

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
        <Table
          dataSource={soldGames}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 50 }}
        />
      </div>
    </div>
  );
}
