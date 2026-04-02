import { Col, Row, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { Currency } from '../types';
import { supabase } from '../utils/supabase';
import StatCard from '../components/StatCard';
import dayjs from 'dayjs';

const { Title } = Typography;

function groupByCurrency(items: { price: number; currency: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const c = item.currency || 'CNY';
    map[c] = (map[c] || 0) + item.price;
  }
  return map;
}

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

export default function Dashboard() {
  const { state } = useGameStore();
  const { games } = state;
  const ownedGames = games.filter((g) => !g.sold);
  const [costByGame, setCostByGame] = useState<Record<string, { exp: number; acc: number }>>({});

  // Fetch expansion/accessory costs grouped by base_game_id and item_type
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('owned_expansions')
        .select('base_game_id, price, currency, item_type')
        .eq('owned', true);
      const map: Record<string, { exp: number; acc: number }> = {};
      for (const r of data || []) {
        const cny = toCNY(Number(r.price) || 0, r.currency || 'CNY');
        if (!map[r.base_game_id]) map[r.base_game_id] = { exp: 0, acc: 0 };
        if (r.item_type === 'accessory') {
          map[r.base_game_id].acc += cny;
        } else {
          map[r.base_game_id].exp += cny;
        }
      }
      setCostByGame(map);
    })();
  }, []);

  const totalGames = ownedGames.length;
  const gameSpentByCurrency = groupByCurrency(ownedGames.map((g) => ({ price: g.price, currency: g.currency })));

  // Merge game + expansion spending by currency
  const totalSpentByCurrency: Record<string, number> = { ...gameSpentByCurrency };
  for (const [c, amount] of Object.entries(state.expansionSpentByCurrency)) {
    totalSpentByCurrency[c] = (totalSpentByCurrency[c] || 0) + amount;
  }

  const thisMonth = ownedGames.filter(
    (g) => dayjs(g.purchaseDate).format('YYYY-MM') === dayjs().format('YYYY-MM')
  ).length;

  const recentGames = [...ownedGames]
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
    .slice(0, 5);

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    {
      title: 'Total Cost (CNY)',
      key: 'price',
      render: (_: any, r: any) => {
        const baseCny = Math.round(toCNY(r.price, r.currency));
        const costs = costByGame[r.id];
        const expCny = Math.round(costs?.exp || 0);
        const accCny = Math.round(costs?.acc || 0);
        const total = baseCny + expCny + accCny;
        const parts = [`base ¥${baseCny}`, expCny > 0 ? `exp ¥${expCny}` : '', accCny > 0 ? `acc ¥${accCny}` : ''].filter(Boolean);
        return (
          <div>
            <div>¥{total}</div>
            {(expCny > 0 || accCny > 0) && (
              <div style={{ fontSize: 11, color: '#999' }}>
                {parts.join(' + ')}
              </div>
            )}
          </div>
        );
      },
    },
    { title: 'Date', dataIndex: 'purchaseDate', key: 'purchaseDate' },
  ];

  return (
    <div>
      <Title level={3}>Dashboard</Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <StatCard title="Total Games" value={totalGames} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Total Spent (incl. Expansions)">
            <CurrencyBreakdown totals={totalSpentByCurrency} />
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="This Month" value={thisMonth} />
        </Col>
      </Row>
      <Title level={4} style={{ marginTop: 24 }}>
        Recently Added
      </Title>
      <Table
        dataSource={recentGames}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </div>
  );
}
