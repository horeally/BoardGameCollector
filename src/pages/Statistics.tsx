import { Card, Col, Empty, Row, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { Currency, OwnedExpansion } from '../types';
import { supabase } from '../utils/supabase';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function Statistics() {
  const { state } = useGameStore();
  const games = state.games.filter((g) => !g.sold);
  const [ownedExpansions, setOwnedExpansions] = useState<OwnedExpansion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('owned_expansions')
        .select('*')
        .eq('owned', true);
      setOwnedExpansions((data || []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        baseGameId: r.base_game_id,
        bggId: r.bgg_id,
        name: r.name,
        image: r.image,
        owned: r.owned,
        price: r.price ? Number(r.price) : undefined,
        currency: r.currency,
        purchaseDate: r.purchase_date,
        bggRating: r.bgg_rating ? Number(r.bgg_rating) : undefined,
        bggBayesRating: r.bgg_bayes_rating ? Number(r.bgg_bayes_rating) : undefined,
        bggRank: r.bgg_rank,
        weight: r.weight ? Number(r.weight) : undefined,
        designer: r.designer,
        yearPublished: r.year_published,
        itemType: r.item_type || 'expansion',
      })));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  // Combine games + owned expansions/accessories as spending items
  const allSpendingItems = [
    ...games.map((g) => ({ price: g.price, currency: g.currency || 'CNY', purchaseDate: g.purchaseDate, type: 'game' })),
    ...ownedExpansions.filter((e) => e.price).map((e) => ({
      price: e.price!,
      currency: e.currency || 'CNY',
      purchaseDate: e.purchaseDate || '',
      type: e.itemType === 'accessory' ? 'accessory' : 'expansion',
    })),
  ];

  if (games.length === 0) {
    return (
      <div>
        <Title level={3}>Statistics</Title>
        <Empty description="No games yet. Add some games to see statistics!" />
      </div>
    );
  }

  const sym = (c: string) => CURRENCY_SYMBOLS[c as Currency] || c + ' ';

  // Category distribution
  const categoryCount: Record<string, number> = {};
  games.forEach((g) => {
    const cat = g.category || 'Unknown';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  const categoryData = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Monthly spending - grouped by currency (games + expansions)
  const monthlySpend: Record<string, Record<string, number>> = {};
  allSpendingItems.forEach((item) => {
    if (item.purchaseDate) {
      const month = dayjs(item.purchaseDate).format('YYYY-MM');
      if (!monthlySpend[month]) monthlySpend[month] = {};
      monthlySpend[month][item.currency] = (monthlySpend[month][item.currency] || 0) + item.price;
    }
  });
  const monthlyData = Object.entries(monthlySpend)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, currencies]) => ({ month, currencies }));

  // Price distribution - CNY equivalent (games + expansions)
  const priceRanges = [
    { label: '0-50', min: 0, max: 50 },
    { label: '50-100', min: 50, max: 100 },
    { label: '100-200', min: 100, max: 200 },
    { label: '200-500', min: 200, max: 500 },
    { label: '500+', min: 500, max: Infinity },
  ];
  const priceDistribution = priceRanges.map((r) => ({
    range: r.label,
    count: allSpendingItems.filter((item) => {
      const cny = toCNY(item.price, item.currency);
      return cny >= r.min && cny < r.max;
    }).length,
  }));

  // Top rated
  const topRated = [...games]
    .filter((g) => g.rating)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  // Most expensive - per base game, total = base + exp + acc (all in CNY)
  const mostExpensive = games.map((g) => {
    const baseCny = toCNY(g.price, g.currency || 'CNY');
    const related = ownedExpansions.filter((e) => e.baseGameId === g.id && e.price);
    const expCny = related
      .filter((e) => e.itemType !== 'accessory')
      .reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    const accCny = related
      .filter((e) => e.itemType === 'accessory')
      .reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    return { name: g.name, totalCny: baseCny + expCny + accCny, baseCny, expCny, accCny };
  })
    .sort((a, b) => b.totalCny - a.totalCny)
    .slice(0, 10);

  return (
    <div>
      <Title level={3}>Statistics</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Category Distribution">
            {categoryData.map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 13 }}>{item.name}</span>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: '#f0f0f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(item.count / games.length) * 100}%`,
                      height: '100%',
                      background: '#1677ff',
                      borderRadius: 4,
                      minWidth: 20,
                    }}
                  />
                </div>
                <span style={{ width: 40, textAlign: 'right' }}>{item.count}</span>
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Price Distribution (CNY)">
            {priceDistribution.map((item) => (
              <div key={item.range} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ width: 60 }}>{item.range}</span>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: '#f0f0f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${allSpendingItems.length > 0 ? (item.count / allSpendingItems.length) * 100 : 0}%`,
                      height: '100%',
                      background: '#52c41a',
                      borderRadius: 4,
                      minWidth: item.count > 0 ? 20 : 0,
                    }}
                  />
                </div>
                <span style={{ width: 40, textAlign: 'right' }}>{item.count}</span>
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Monthly Spending (incl. Exp & Acc)">
            {monthlyData.length === 0 ? (
              <Empty description="No purchase date data" />
            ) : (
              monthlyData.map((item) => (
                <div key={item.month} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{item.month}</div>
                  {Object.entries(item.currencies).map(([currency, amount]) => (
                    <div key={currency} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ width: 50, fontSize: 12, color: '#666' }}>{currency}</span>
                      <div
                        style={{
                          flex: 1,
                          height: 16,
                          background: '#f0f0f0',
                          borderRadius: 4,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${(amount / Math.max(...Object.values(monthlySpend).flatMap((m) => Object.values(m)))) * 100}%`,
                            height: '100%',
                            background: '#fa8c16',
                            borderRadius: 4,
                            minWidth: 20,
                          }}
                        />
                      </div>
                      <span style={{ width: 80, textAlign: 'right', fontSize: 13 }}>
                        {sym(currency)}{Math.round(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Top Rated (My Ratings)">
            {topRated.length === 0 ? (
              <Empty description="No ratings yet" />
            ) : (
              topRated.map((g, i) => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>
                    {i + 1}. {g.name}
                  </span>
                  <span style={{ fontWeight: 600 }}>{g.rating}/10</span>
                </div>
              ))
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="Most Expensive (CNY, incl. Exp & Acc)">
            {mostExpensive.map((item, i) => {
              const parts = [
                `base ¥${Math.round(item.baseCny)}`,
                item.expCny > 0 ? `exp ¥${Math.round(item.expCny)}` : '',
                item.accCny > 0 ? `acc ¥${Math.round(item.accCny)}` : '',
              ].filter(Boolean);
              const hasExtra = item.expCny > 0 || item.accCny > 0;
              return (
                <div key={`${item.name}-${i}`} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{i + 1}. {item.name}</span>
                    <span style={{ fontWeight: 600 }}>¥{Math.round(item.totalCny)}</span>
                  </div>
                  {hasExtra && (
                    <div style={{ fontSize: 11, color: '#999', textAlign: 'right' }}>
                      {parts.join(' + ')}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
