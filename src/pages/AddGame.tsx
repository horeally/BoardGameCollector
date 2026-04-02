import {
  Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, List,
  Row, Select, Spin, Typography, message,
} from 'antd';
import { CopyOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useGameStore } from '../store/gameStore';
import { insertGame, updateGame } from '../utils/db';
import { CATEGORIES } from '../types';
import type { BGGSearchResult, BoardGame } from '../types';
import { searchBGG, getBGGDetail } from '../utils/bgg';

const { Title } = Typography;

export default function AddGame() {
  const { state, dispatch } = useGameStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const editGame = editId ? state.games.find((g) => g.id === editId) : null;

  const [form] = Form.useForm();
  const [bggQuery, setBggQuery] = useState('');
  const [bggResults, setBggResults] = useState<BGGSearchResult[]>([]);
  const [bggLoading, setBggLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (editGame) {
      form.setFieldsValue({
        ...editGame,
        purchaseDate: editGame.purchaseDate ? dayjs(editGame.purchaseDate) : undefined,
      });
    }
  }, [editGame, form]);

  const handleBGGSearch = (query: string) => {
    setBggQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setBggResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBggLoading(true);
      try {
        const results = await searchBGG(query);
        setBggResults(results);
      } catch {
        message.error('BGG search failed');
      } finally {
        setBggLoading(false);
      }
    }, 500);
  };

  const handleBGGSelect = async (item: BGGSearchResult) => {
    setBggLoading(true);
    try {
      const detail = await getBGGDetail(item.id);
      if (detail) {
        form.setFieldsValue({
          nameEn: detail.name,
          players: detail.minPlayers && detail.maxPlayers
            ? `${detail.minPlayers}-${detail.maxPlayers}`
            : undefined,
          playTime: detail.playTime,
          yearPublished: detail.yearPublished,
          designer: detail.designer,
          artist: detail.artist,
          publisher: detail.publisher,
          image: detail.image,
          bggRating: detail.bggRating,
          bggBayesRating: detail.bggBayesRating,
          bggRank: detail.bggRank,
          bggId: detail.id,
          weight: detail.weight,
          relatedGames: detail.relatedGames,
          expansionBggIds: detail.expansionIds,
          category: detail.category,
          gameType: detail.gameType,
        });
        message.success('Game info loaded from BGG');
      }
    } catch {
      message.error('Failed to load BGG details');
    } finally {
      setBggLoading(false);
      setBggResults([]);
      setBggQuery('');
    }
  };

  const handleRefreshBGG = async () => {
    const bggId = form.getFieldValue('bggId');
    if (!bggId) {
      message.warning('No BGG ID found. Search BGG first.');
      return;
    }
    setBggLoading(true);
    try {
      const detail = await getBGGDetail(Number(bggId));
      if (detail) {
        form.setFieldsValue({
          nameEn: detail.name,
          players: detail.minPlayers && detail.maxPlayers
            ? `${detail.minPlayers}-${detail.maxPlayers}`
            : undefined,
          playTime: detail.playTime,
          yearPublished: detail.yearPublished,
          designer: detail.designer,
          artist: detail.artist,
          publisher: detail.publisher,
          image: detail.image,
          bggRating: detail.bggRating,
          bggBayesRating: detail.bggBayesRating,
          bggRank: detail.bggRank,
          weight: detail.weight,
          relatedGames: detail.relatedGames,
          expansionBggIds: detail.expansionIds,
          category: detail.category,
          gameType: detail.gameType,
        });
        message.success('BGG data refreshed');
      }
    } catch {
      message.error('Failed to refresh BGG data');
    } finally {
      setBggLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    const game: BoardGame = {
      id: editGame?.id || crypto.randomUUID(),
      name: values.name,
      nameEn: values.nameEn,
      price: values.price || 0,
      currency: values.currency || 'CNY',
      purchaseDate: values.purchaseDate ? values.purchaseDate.format('YYYY-MM-DD') : '',
      category: values.category || 'Other',
      gameType: values.gameType || 'base',
      kickstarter: values.kickstarter || false,
      players: values.players || '',
      playTime: values.playTime,
      yearPublished: values.yearPublished,
      designer: values.designer,
      artist: values.artist,
      publisher: values.publisher,
      rating: values.rating,
      bggRating: values.bggRating,
      bggBayesRating: values.bggBayesRating,
      bggRank: values.bggRank,
      bggId: values.bggId,
      weight: values.weight,
      relatedGames: values.relatedGames,
      expansionBggIds: values.expansionBggIds,
      linkedGameIds: editGame?.linkedGameIds,
      image: values.image,
      notes: values.notes,
      createdAt: editGame?.createdAt || new Date().toISOString(),
    };

    try {
      if (editGame) {
        await updateGame(game, state.userId!);
        dispatch({ type: 'UPDATE_GAME', payload: game });
        message.success('Game updated');
      } else {
        await insertGame(game, state.userId!);
        dispatch({ type: 'ADD_GAME', payload: game });
        message.success('Game added');
      }
      navigate('/collection');
    } catch {
      message.error('Failed to save game');
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Title level={3}>{editGame ? 'Edit Game' : 'Add Game'}</Title>

      <Card size="small" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Title level={5} style={{ margin: 0 }}>Search on BGG</Title>
          {editGame && (
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={bggLoading}
              onClick={handleRefreshBGG}
            >
              Refresh BGG Data
            </Button>
          )}
        </div>
        <Input
          placeholder="Search BoardGameGeek..."
          prefix={<SearchOutlined />}
          value={bggQuery}
          onChange={(e) => handleBGGSearch(e.target.value)}
          allowClear
        />
        {bggLoading && <Spin style={{ marginTop: 8 }} />}
        {bggResults.length > 0 && (
          <List
            size="small"
            style={{ maxHeight: 200, overflow: 'auto', marginTop: 8 }}
            dataSource={bggResults}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => handleBGGSelect(item)}
              >
                {item.name} {item.yearPublished && `(${item.yearPublished})`}
              </List.Item>
            )}
          />
        )}
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ currency: 'CNY', gameType: 'base' }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Name{' '}
                  <Button
                    type="link"
                    size="small"
                    icon={<CopyOutlined />}
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    onClick={() => {
                      const en = form.getFieldValue('nameEn');
                      if (en) {
                        form.setFieldsValue({ name: en });
                      } else {
                        message.info('No English Name to copy');
                      }
                    }}
                  >
                    Copy English Name
                  </Button>
                </span>
              }
              name="name"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="nameEn" label="English Name">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="price" label="Price" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="currency" label="Currency">
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
          </Col>
          <Col span={6}>
            <Form.Item name="purchaseDate" label="Purchase Date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="category" label="Category">
              <Select options={CATEGORIES.map((c) => ({ label: c, value: c }))} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="gameType" label="Type">
              <Select
                options={[
                  { label: 'Base Game', value: 'base' },
                  { label: 'Expansion', value: 'expansion' },
                  { label: 'Accessory', value: 'accessory' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="kickstarter" valuePropName="checked" label="Kickstarter">
              <Checkbox>KS Edition</Checkbox>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="players" label="Players">
              <Input placeholder="e.g. 2-4" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="playTime" label="Play Time">
              <Input placeholder="e.g. 60 min" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="yearPublished" label="Year Published">
              <Input disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="designer" label="Designer">
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="artist" label="Artist">
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="publisher" label="Publisher">
              <Input disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="rating" label="My Rating (1-10)">
              <InputNumber style={{ width: '100%' }} min={1} max={10} precision={0} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="bggRating" label="BGG Avg Rating">
              <InputNumber style={{ width: '100%' }} min={0} max={10} step={0.1} disabled />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="bggBayesRating" label="BGG Bayes Rating">
              <InputNumber style={{ width: '100%' }} min={0} max={10} step={0.1} disabled />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="bggRank" label="BGG Rank">
              <InputNumber style={{ width: '100%' }} min={0} disabled />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="weight" label="Weight (1-5)">
              <InputNumber style={{ width: '100%' }} min={0} max={5} step={0.1} disabled />
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item name="image" label="Image URL">
              <Input placeholder="URL or leave empty" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="relatedGames" label="Related Expansions / Base Game">
          <Input.TextArea rows={2} disabled />
        </Form.Item>

        <Form.Item name="bggId" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="expansionBggIds" hidden>
          <Input />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" size="large">
            {editGame ? 'Update' : 'Add to Collection'}
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/collection')}>
            Cancel
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
