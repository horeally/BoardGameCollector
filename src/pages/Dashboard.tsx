import { Card, Col, Empty, Row, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { Currency, OwnedExpansion } from '../types';
import { supabase } from '../utils/supabase';
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

const CURRENCY_FLAGS: Record<string, string> = {
  CNY: 'https://flagcdn.com/cn.svg',
  USD: 'https://flagcdn.com/us.svg',
  EUR: 'https://flagcdn.com/eu.svg',
  GBP: 'https://flagcdn.com/gb.svg',
  JPY: 'https://flagcdn.com/jp.svg',
  SGD: 'https://flagcdn.com/sg.svg',
};

function CurrencyBreakdown({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) return <span style={{ fontSize: 24, fontWeight: 600 }}>0</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {entries.map(([currency, amount]) => {
        const text = `${CURRENCY_SYMBOLS[currency as Currency] || ''}${Math.round(amount)}`;
        // 7位数(含符号约8字符)保持正常字体，超过才缩小
        const fontSize = text.length > 10 ? 14 : text.length > 8 ? 16 : 22;
        return (
          <div key={currency} style={{
            position: 'relative',
            width: 130,
            height: 68,
            padding: '8px 12px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.15)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            {CURRENCY_FLAGS[currency] && (
              <img
                src={CURRENCY_FLAGS[currency]}
                alt=""
                style={{
                  position: 'absolute',
                  right: -20,
                  top: 0,
                  width: 120,
                  height: 68,
                  objectFit: 'cover',
                  opacity: 0.15,
                  pointerEvents: 'none',
                }}
              />
            )}
            <div style={{ position: 'relative', fontSize, fontWeight: 700, lineHeight: 1.3 }}>
              {text}
            </div>
            <div style={{ position: 'relative', fontSize: 11, opacity: 0.7 }}>{currency}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { state } = useGameStore();
  const { games } = state;
  const ownedGames = games.filter((g) => !g.sold);
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

  const totalGames = ownedGames.filter((g) => g.price != null).length;
  const gameSpentByCurrency = groupByCurrency(ownedGames.filter((g) => g.price != null).map((g) => ({ price: g.price!, currency: g.currency })));

  const totalSpentByCurrency: Record<string, number> = { ...gameSpentByCurrency };
  for (const [c, amount] of Object.entries(state.expansionSpentByCurrency)) {
    totalSpentByCurrency[c] = (totalSpentByCurrency[c] || 0) + amount;
  }

  const sym = (c: string) => CURRENCY_SYMBOLS[c as Currency] || c + ' ';

  // Spending items
  const allSpendingItems = [
    ...ownedGames.filter((g) => g.price != null).map((g) => ({ price: g.price!, currency: g.currency || 'CNY', purchaseDate: g.purchaseDate })),
    ...ownedExpansions.filter((e) => e.price).map((e) => ({ price: e.price!, currency: e.currency || 'CNY', purchaseDate: e.purchaseDate || '' })),
  ];

  // Category distribution
  const categoryCount: Record<string, number> = {};
  ownedGames.forEach((g) => {
    const cat = g.category || 'Unknown';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  const categoryData = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  // Monthly spending - grouped by currency, with CNY total for bar width
  const CURRENCY_COLORS: Record<string, string> = {
    CNY: '#f5222d', USD: '#1677ff', EUR: '#52c41a', GBP: '#722ed1', JPY: '#fa8c16', SGD: '#13c2c2',
  };
  const monthlySpend: Record<string, Record<string, number>> = {};
  allSpendingItems.forEach((item) => {
    if (item.purchaseDate) {
      const month = dayjs(item.purchaseDate).format('YYYY-MM');
      if (!monthlySpend[month]) monthlySpend[month] = {};
      monthlySpend[month][item.currency] = (monthlySpend[month][item.currency] || 0) + item.price;
    }
  });
  const monthlyDataRaw = Object.entries(monthlySpend).sort((a, b) => a[0].localeCompare(b[0]));
  const monthlyTotalCny = monthlyDataRaw.map(([, currencies]) =>
    Object.entries(currencies).reduce((sum, [c, a]) => sum + toCNY(a, c), 0)
  );
  const maxMonthlyCny = Math.max(...monthlyTotalCny, 1);
  const monthlyData = monthlyDataRaw.map(([month, currencies], i) => ({
    month,
    currencies,
    totalCny: monthlyTotalCny[i],
  }));

  // Price distribution
  const priceRanges = [
    { label: '0-100', min: 0, max: 100 },
    { label: '100-200', min: 100, max: 200 },
    { label: '200-500', min: 200, max: 500 },
    { label: '500-1000', min: 500, max: 1000 },
    { label: '1000-2000', min: 1000, max: 2000 },
    { label: '2000+', min: 2000, max: Infinity },
  ];
  const priceDistribution = priceRanges.map((r) => ({
    range: r.label,
    count: allSpendingItems.filter((item) => {
      const cny = toCNY(item.price, item.currency);
      return cny >= r.min && cny < r.max;
    }).length,
  }));

  // Most expensive
  const mostExpensive = ownedGames.filter((g) => g.price != null).map((g) => {
    const baseCny = toCNY(g.price!, g.currency || 'CNY');
    const related = ownedExpansions.filter((e) => e.baseGameId === g.id && e.price);
    const expCny = related.filter((e) => e.itemType !== 'accessory').reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    const accCny = related.filter((e) => e.itemType === 'accessory').reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    return { name: g.name, image: g.image, totalCny: baseCny + expCny + accCny, baseCny, expCny, accCny };
  }).sort((a, b) => b.totalCny - a.totalCny).slice(0, 20);

  // Most expansions owned
  const mostExpansions = ownedGames.filter((g) => g.gameType === 'base').map((g) => {
    const owned = ownedExpansions.filter((e) => e.baseGameId === g.id && e.itemType !== 'accessory');
    return { name: g.name, image: g.image, ownedCount: owned.length, totalCount: g.expansionBggIds?.length || owned.length };
  }).filter((g) => g.ownedCount > 0).sort((a, b) => b.ownedCount - a.ownedCount).slice(0, 20);


  return (
    <div>
      <Title level={3}>Dashboard</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card variant="borderless" style={{ height: '100%', borderRadius: 16, background: 'linear-gradient(to right, #1677ff 0%, #69b1ff 100%)' }} styles={{ body: { paddingTop: 12 } }}>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Total Games</div>
            <div style={{ color: '#fff', fontSize: 36, fontWeight: 700 }}>{totalGames}</div>
          </Card>
        </Col>
        <Col xs={24} sm={16}>
          <Card variant="borderless" style={{ height: '100%', borderRadius: 16, background: 'linear-gradient(to right, #1677ff 0%, #69b1ff 100%)' }} styles={{ body: { paddingTop: 12 } }}>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Total Spent</div>
            <div style={{ color: '#fff' }}>
              <CurrencyBreakdown totals={totalSpentByCurrency} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 1: Category + Price Distribution + Monthly Spending */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="Category Distribution" style={{ height: '100%' }}>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {categoryData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ width: 130, flexShrink: 0, fontSize: 14 }}>{item.name}</span>
                  <div style={{ flex: 1, height: 20, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(item.count / ownedGames.length) * 100}%`, height: '100%', background: '#1677ff', borderRadius: 4, minWidth: 20 }} />
                  </div>
                  <span style={{ width: 30, textAlign: 'right', fontSize: 14 }}>{item.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Price Distribution (CNY)" style={{ height: '100%' }}>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {priceDistribution.map((item) => (
                <div key={item.range} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ width: 75, fontSize: 14 }}>{item.range}</span>
                  <div style={{ flex: 1, height: 20, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${allSpendingItems.length > 0 ? (item.count / allSpendingItems.length) * 100 : 0}%`, height: '100%', background: '#52c41a', borderRadius: 4, minWidth: item.count > 0 ? 20 : 0 }} />
                  </div>
                  <span style={{ width: 30, textAlign: 'right', fontSize: 14 }}>{item.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Monthly Spending" style={{ height: '100%' }}>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {monthlyData.length === 0 ? (
                <Empty description="No data" />
              ) : (
                monthlyData.map((item) => {
                  const CURRENCY_ORDER = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'SGD'];
                  const entries = Object.entries(item.currencies).sort(([a], [b]) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b));
                  const amounts = entries.map(([c, a]) => `${sym(c)}${Math.round(a)}`).join(' + ');
                  return (
                    <div key={item.month} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{item.month}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>{amounts}</span>
                      </div>
                      <div style={{ height: 16, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        {entries.map(([currency, amount]) => {
                          const cny = toCNY(amount, currency);
                          const pct = (cny / maxMonthlyCny) * 100;
                          return (
                            <div
                              key={currency}
                              title={`${currency}: ${sym(currency)}${Math.round(amount)}`}
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: CURRENCY_COLORS[currency] || '#8c8c8c',
                                minWidth: pct > 0 ? 4 : 0,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 2: Most Expensive + Most Expansions */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Most Expensive" style={{ height: '100%' }}>
            <div className="scroll-hide" style={{ maxHeight: 500, overflowY: 'auto' }}>
              {mostExpensive.map((item, i) => {
                const parts = [
                  `base ¥${Math.round(item.baseCny)}`,
                  item.expCny > 0 ? `exp ¥${Math.round(item.expCny)}` : '',
                  item.accCny > 0 ? `acc ¥${Math.round(item.accCny)}` : '',
                ].filter(Boolean);
                const hasExtra = item.expCny > 0 || item.accCny > 0;
                return (
                  <div key={`${item.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ width: 20, flexShrink: 0, fontSize: 13, color: '#999', textAlign: 'right' }}>{i + 1}</span>
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: 6, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      {hasExtra && (
                        <div style={{ fontSize: 11, color: '#999' }}>{parts.join(' + ')}</div>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>¥{Math.round(item.totalCny)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Most Expansions" style={{ height: '100%' }}>
            <div className="scroll-hide" style={{ maxHeight: 500, overflowY: 'auto' }}>
              {mostExpansions.length === 0 ? (
                <Empty description="No expansions owned" />
              ) : (
                mostExpansions.map((item, i) => {
                  const allOwned = item.ownedCount >= item.totalCount;
                  return (
                    <div key={`${item.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ width: 20, flexShrink: 0, fontSize: 13, color: '#999', textAlign: 'right' }}>{i + 1}</span>
                      {item.image ? (
                        <img src={item.image} alt="" loading="lazy" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: 6, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0, color: allOwned ? '#52c41a' : undefined }}>
                        {item.ownedCount}/{item.totalCount}{allOwned && ' 🏅'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
