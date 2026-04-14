import { Col, Empty, Row, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS, toCNY } from '../types';
import type { Currency, OwnedExpansion } from '../types';
import { fetchAllOwnedExpansions } from '../utils/db';
import dayjs from 'dayjs';

// Apple font stacks
const sfDisplay = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
const sfText = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

// Apple system colors for currency distinction in charts
const CURRENCY_COLORS: Record<string, string> = {
  CNY: '#ff3b30',
  USD: '#0071e3',
  EUR: '#34c759',
  GBP: '#af52de',
  JPY: '#ff9500',
  SGD: '#5ac8fa',
};

const CURRENCY_FLAGS: Record<string, string> = {
  CNY: 'https://flagcdn.com/cn.svg',
  USD: 'https://flagcdn.com/us.svg',
  EUR: 'https://flagcdn.com/eu.svg',
  GBP: 'https://flagcdn.com/gb.svg',
  JPY: 'https://flagcdn.com/jp.svg',
  SGD: 'https://flagcdn.com/sg.svg',
};

function groupByCurrency(items: { price: number; currency: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const c = item.currency || 'CNY';
    map[c] = (map[c] || 0) + item.price;
  }
  return map;
}

function AppleCard({ children, dark, style }: { children: React.ReactNode; dark?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: dark ? '#000' : '#fff',
      borderRadius: 12,
      padding: 24,
      height: '100%',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 21,
      fontWeight: 600,
      fontFamily: sfDisplay,
      lineHeight: 1.19,
      letterSpacing: '0.011em',
      color: '#1d1d1f',
      marginBottom: 20,
    }}>
      {children}
    </div>
  );
}

function CurrencyBreakdown({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (entries.length === 0) {
    return <span style={{ fontSize: 28, fontWeight: 600, fontFamily: sfDisplay, color: '#fff' }}>0</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {entries.map(([currency, amount]) => {
        const text = `${CURRENCY_SYMBOLS[currency as Currency] || ''}${Math.round(amount)}`;
        const fontSize = text.length > 10 ? 14 : text.length > 8 ? 17 : 22;
        return (
          <div key={currency} style={{
            position: 'relative',
            width: 130,
            height: 64,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.06)',
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
                  right: -10,
                  top: -4,
                  width: 100,
                  height: 72,
                  objectFit: 'cover',
                  opacity: 0.22,
                  pointerEvents: 'none',
                  filter: 'saturate(1.2)',
                }}
              />
            )}
            <div style={{
              position: 'relative',
              fontSize,
              fontWeight: 600,
              fontFamily: sfDisplay,
              lineHeight: 1.14,
              letterSpacing: '-0.28px',
              color: '#fff',
              textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>
              {text}
            </div>
            <div style={{
              position: 'relative',
              fontSize: 11,
              fontFamily: sfText,
              letterSpacing: '-0.08px',
              color: 'rgba(255, 255, 255, 0.48)',
              marginTop: 2,
            }}>{currency}</div>
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
      const data = await fetchAllOwnedExpansions('*');
      setOwnedExpansions(data.map((r: any) => ({
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

  const allSpendingItems = [
    ...ownedGames.filter((g) => g.price != null).map((g) => ({ price: g.price!, currency: g.currency || 'CNY', purchaseDate: g.purchaseDate })),
    ...ownedExpansions.filter((e) => e.price).map((e) => ({ price: e.price!, currency: e.currency || 'CNY', purchaseDate: e.purchaseDate || '' })),
  ];

  const categoryCount: Record<string, number> = {};
  ownedGames.forEach((g) => {
    const cat = g.category || 'Unknown';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  const categoryData = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

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

  const priceRanges = [
    { label: '0-100', min: 0, max: 100 },
    { label: '100-200', min: 100, max: 200 },
    { label: '200-500', min: 200, max: 500 },
    { label: '500-1000', min: 500, max: 1000 },
    { label: '1000-2000', min: 1000, max: 2000 },
    { label: '2000-3000', min: 2000, max: 3000 },
    { label: '3000+', min: 3000, max: Infinity },
  ];
  const priceDistribution = priceRanges.map((r) => ({
    range: r.label,
    count: allSpendingItems.filter((item) => {
      const cny = toCNY(item.price, item.currency);
      return cny >= r.min && cny < r.max;
    }).length,
  }));

  const mostExpensive = ownedGames.filter((g) => g.price != null).map((g) => {
    const baseCny = toCNY(g.price!, g.currency || 'CNY');
    const related = ownedExpansions.filter((e) => e.baseGameId === g.id && e.price);
    const expCny = related.filter((e) => e.itemType !== 'accessory').reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    const accCny = related.filter((e) => e.itemType === 'accessory').reduce((sum, e) => sum + toCNY(e.price!, e.currency || 'CNY'), 0);
    return { name: g.name, image: g.image, totalCny: baseCny + expCny + accCny, baseCny, expCny, accCny };
  }).sort((a, b) => b.totalCny - a.totalCny).slice(0, 20);

  const mostExpansions = ownedGames.filter((g) => g.gameType === 'base').map((g) => {
    const owned = ownedExpansions.filter((e) => e.baseGameId === g.id && e.itemType !== 'accessory');
    return { name: g.name, image: g.image, ownedCount: owned.length, totalCount: g.expansionBggIds?.length || owned.length };
  }).filter((g) => g.ownedCount > 0).sort((a, b) => b.ownedCount - a.ownedCount).slice(0, 20);

  return (
    <div style={{ fontFamily: sfText }}>
      {/* Page Title — SF Pro Display, tight line-height */}
      <h1 style={{
        fontSize: 40,
        fontWeight: 600,
        fontFamily: sfDisplay,
        lineHeight: 1.1,
        letterSpacing: '-0.5px',
        color: '#1d1d1f',
        margin: '0 0 24px 0',
      }}>
        Dashboard
      </h1>

      {/* Hero Stats — Black immersive section */}
      <AppleCard dark style={{ padding: '28px 32px', marginBottom: 16 }}>
        <Row gutter={[32, 20]}>
          <Col xs={24} sm={8}>
            <div style={{
              fontSize: 14,
              fontFamily: sfText,
              color: 'rgba(255,255,255,0.48)',
              letterSpacing: '-0.224px',
              marginBottom: 8,
            }}>Total Games</div>
            <div style={{
              fontSize: 56,
              fontWeight: 600,
              fontFamily: sfDisplay,
              lineHeight: 1.07,
              letterSpacing: '-0.28px',
              color: '#fff',
            }}>{totalGames}</div>
          </Col>
          <Col xs={24} sm={16}>
            <div style={{
              fontSize: 14,
              fontFamily: sfText,
              color: 'rgba(255,255,255,0.48)',
              letterSpacing: '-0.224px',
              marginBottom: 8,
            }}>Total Spent</div>
            <CurrencyBreakdown totals={totalSpentByCurrency} />
          </Col>
        </Row>
      </AppleCard>

      {/* Row 1: Category + Price + Monthly */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <AppleCard>
            <SectionTitle>Category Distribution</SectionTitle>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {categoryData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{
                    width: 130,
                    flexShrink: 0,
                    fontSize: 14,
                    fontFamily: sfText,
                    letterSpacing: '-0.224px',
                    color: '#1d1d1f',
                  }}>{item.name}</span>
                  <div style={{ flex: 1, height: 18, background: '#e8e8ed', borderRadius: 4, overflow: 'hidden', margin: '0 8px' }}>
                    <div style={{
                      width: `${(item.count / ownedGames.length) * 100}%`,
                      height: '100%',
                      background: '#0071e3',
                      borderRadius: 4,
                      minWidth: 18,
                    }} />
                  </div>
                  <span style={{
                    width: 28,
                    textAlign: 'right',
                    fontSize: 14,
                    fontFamily: sfText,
                    fontWeight: 600,
                    letterSpacing: '-0.224px',
                    color: '#1d1d1f',
                  }}>{item.count}</span>
                </div>
              ))}
            </div>
          </AppleCard>
        </Col>
        <Col xs={24} md={8}>
          <AppleCard>
            <SectionTitle>Price Distribution</SectionTitle>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {priceDistribution.map((item) => (
                <div key={item.range} style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{
                    width: 75,
                    fontSize: 14,
                    fontFamily: sfText,
                    letterSpacing: '-0.224px',
                    color: '#1d1d1f',
                  }}>{item.range}</span>
                  <div style={{ flex: 1, height: 18, background: '#e8e8ed', borderRadius: 4, overflow: 'hidden', margin: '0 8px' }}>
                    <div style={{
                      width: `${allSpendingItems.length > 0 ? (item.count / allSpendingItems.length) * 100 : 0}%`,
                      height: '100%',
                      background: '#0071e3',
                      borderRadius: 4,
                      minWidth: item.count > 0 ? 18 : 0,
                    }} />
                  </div>
                  <span style={{
                    width: 28,
                    textAlign: 'right',
                    fontSize: 14,
                    fontFamily: sfText,
                    fontWeight: 600,
                    letterSpacing: '-0.224px',
                    color: '#1d1d1f',
                  }}>{item.count}</span>
                </div>
              ))}
            </div>
          </AppleCard>
        </Col>
        <Col xs={24} md={8}>
          <AppleCard>
            <SectionTitle>Monthly Spending</SectionTitle>
            <div className="scroll-hide" style={{ maxHeight: 350, overflowY: 'auto' }}>
              {monthlyData.length === 0 ? (
                <Empty description="No data" />
              ) : (
                monthlyData.map((item) => {
                  const CURRENCY_ORDER = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'SGD'];
                  const entries = Object.entries(item.currencies).sort(([a], [b]) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b));
                  const amounts = entries.map(([c, a]) => `${sym(c)}${Math.round(a)}`).join(' + ');
                  return (
                    <div key={item.month} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: sfText,
                          letterSpacing: '-0.224px',
                          color: '#1d1d1f',
                        }}>{item.month}</span>
                        <span style={{
                          fontSize: 12,
                          fontFamily: sfText,
                          letterSpacing: '-0.12px',
                          color: 'rgba(0, 0, 0, 0.48)',
                        }}>{amounts}</span>
                      </div>
                      <div style={{ height: 14, background: '#e8e8ed', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
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
                                background: CURRENCY_COLORS[currency] || '#86868b',
                                minWidth: pct > 0 ? 3 : 0,
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
          </AppleCard>
        </Col>
      </Row>

      {/* Row 2: Rankings */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <AppleCard>
            <SectionTitle>Most Expensive</SectionTitle>
            <div className="scroll-hide" style={{ maxHeight: 500, overflowY: 'auto' }}>
              {mostExpensive.map((item, i) => {
                const parts = [
                  `base ¥${Math.round(item.baseCny)}`,
                  item.expCny > 0 ? `exp ¥${Math.round(item.expCny)}` : '',
                  item.accCny > 0 ? `acc ¥${Math.round(item.accCny)}` : '',
                ].filter(Boolean);
                const hasExtra = item.expCny > 0 || item.accCny > 0;
                return (
                  <div key={`${item.name}-${i}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                  }}>
                    <span style={{
                      width: 22,
                      flexShrink: 0,
                      fontSize: 12,
                      fontFamily: sfText,
                      fontWeight: 600,
                      letterSpacing: '-0.12px',
                      color: 'rgba(0, 0, 0, 0.32)',
                      textAlign: 'right',
                    }}>{i + 1}</span>
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 44, height: 44, background: '#f5f5f7', borderRadius: 8, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 400,
                        fontFamily: sfText,
                        letterSpacing: '-0.224px',
                        color: '#1d1d1f',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{item.name}</div>
                      {hasExtra && (
                        <div style={{
                          fontSize: 12,
                          fontFamily: sfText,
                          letterSpacing: '-0.12px',
                          color: 'rgba(0, 0, 0, 0.48)',
                          marginTop: 2,
                        }}>{parts.join(' + ')}</div>
                      )}
                    </div>
                    <span style={{
                      fontWeight: 600,
                      fontSize: 14,
                      fontFamily: sfDisplay,
                      letterSpacing: '-0.224px',
                      color: '#1d1d1f',
                      flexShrink: 0,
                    }}>¥{Math.round(item.totalCny)}</span>
                  </div>
                );
              })}
            </div>
          </AppleCard>
        </Col>
        <Col xs={24} md={12}>
          <AppleCard>
            <SectionTitle>Most Expansions</SectionTitle>
            <div className="scroll-hide" style={{ maxHeight: 500, overflowY: 'auto' }}>
              {mostExpansions.length === 0 ? (
                <Empty description="No expansions owned" />
              ) : (
                mostExpansions.map((item, i) => {
                  const allOwned = item.ownedCount >= item.totalCount;
                  return (
                    <div key={`${item.name}-${i}`} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                    }}>
                      <span style={{
                        width: 22,
                        flexShrink: 0,
                        fontSize: 12,
                        fontFamily: sfText,
                        fontWeight: 600,
                        letterSpacing: '-0.12px',
                        color: 'rgba(0, 0, 0, 0.32)',
                        textAlign: 'right',
                      }}>{i + 1}</span>
                      {item.image ? (
                        <img src={item.image} alt="" loading="lazy" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, background: '#f5f5f7', borderRadius: 8, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 400,
                          fontFamily: sfText,
                          letterSpacing: '-0.224px',
                          color: '#1d1d1f',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{item.name}</div>
                      </div>
                      <span style={{
                        fontWeight: 600,
                        fontSize: 14,
                        fontFamily: sfDisplay,
                        letterSpacing: '-0.224px',
                        flexShrink: 0,
                        color: allOwned ? '#34c759' : '#1d1d1f',
                      }}>
                        {item.ownedCount}/{item.totalCount}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </AppleCard>
        </Col>
      </Row>
    </div>
  );
}
