import { Button, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useGameStore } from '../store/gameStore';
import { CURRENCY_SYMBOLS } from '../types';
import type { BoardGame, Currency } from '../types';
import { updateGame } from '../utils/db';
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

  const soldGames = state.games.filter((g) => g.sold);

  const boughtByCurrency: Record<string, number> = {};
  const soldByCurrency: Record<string, number> = {};
  for (const g of soldGames) {
    const bc = g.currency || 'CNY';
    boughtByCurrency[bc] = (boughtByCurrency[bc] || 0) + g.price;
    const sc = g.soldCurrency || bc;
    soldByCurrency[sc] = (soldByCurrency[sc] || 0) + (g.soldPrice || 0);
  }

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
      width: 110,
      render: (_: any, r: BoardGame) =>
        `${CURRENCY_SYMBOLS[r.currency as Currency] || ''}${r.price}`,
    },
    {
      title: 'Sell Price',
      key: 'sellPrice',
      width: 110,
      render: (_: any, r: BoardGame) =>
        `${CURRENCY_SYMBOLS[(r.soldCurrency || r.currency) as Currency] || ''}${r.soldPrice || 0}`,
    },
    {
      title: 'Profit/Loss',
      key: 'profit',
      width: 120,
      sorter: (a: BoardGame, b: BoardGame) =>
        ((a.soldPrice || 0) - a.price) - ((b.soldPrice || 0) - b.price),
      render: (_: any, r: BoardGame) => {
        const diff = (r.soldPrice || 0) - r.price;
        const color = diff > 0 ? '#52c41a' : diff < 0 ? '#ff4d4f' : '#999';
        const prefix = diff > 0 ? '+' : '';
        return (
          <span style={{ color, fontWeight: 600 }}>
            {prefix}{CURRENCY_SYMBOLS[r.currency as Currency] || ''}{diff}
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
