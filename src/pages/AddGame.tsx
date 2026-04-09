import {
  Button, Checkbox, Col, DatePicker, Form, Input, InputNumber, List,
  Row, Select, Space, Spin, message,
} from 'antd';
import { CopyOutlined, NumberOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useGameStore } from '../store/gameStore';
import { insertGame, updateGame } from '../utils/db';
import { CATEGORIES } from '../types';
import type { BGGSearchResult, BoardGame } from '../types';
import { searchBGG, getBGGDetail } from '../utils/bgg';

const sfDisplay = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';
const sfText = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif';

export default function AddGame() {
  const { state, dispatch } = useGameStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const editGame = editId ? state.games.find((g) => g.id === editId) : null;

  // Build return URL preserving Collection search/filter state
  const returnUrl = (() => {
    const p = new URLSearchParams();
    const q = searchParams.get('q');
    const cat = searchParams.get('cat');
    if (q) p.set('q', q);
    if (cat) p.set('cat', cat);
    const qs = p.toString();
    return '/collection' + (qs ? '?' + qs : '');
  })();

  const [form] = Form.useForm();
  const [bggQuery, setBggQuery] = useState('');
  const [bggIdInput, setBggIdInput] = useState('');
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

  const handleBGGIdLoad = async () => {
    const id = Number(bggIdInput.trim());
    if (!id || isNaN(id)) {
      message.warning('Please enter a valid BGG ID number');
      return;
    }
    setBggLoading(true);
    try {
      const detail = await getBGGDetail(id);
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
          accessoryBggIds: detail.accessoryIds,
          category: detail.category,
          gameType: detail.gameType,
        });
        message.success(`Loaded: ${detail.name}`);
        setBggIdInput('');
      } else {
        message.error('Game not found on BGG');
      }
    } catch {
      message.error('Failed to load BGG details');
    } finally {
      setBggLoading(false);
    }
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
          accessoryBggIds: detail.accessoryIds,
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
          accessoryBggIds: detail.accessoryIds,
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
      price: values.price ?? null,
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
      accessoryBggIds: values.accessoryBggIds,
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
      navigate(returnUrl);
    } catch {
      message.error('Failed to save game');
    }
  };

  const sectionStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 21,
    fontWeight: 600,
    fontFamily: sfDisplay,
    lineHeight: 1.19,
    letterSpacing: '0.011em',
    color: '#1d1d1f',
    margin: '0 0 16px 0',
  };

  return (
    <div style={{ maxWidth: 800, fontFamily: sfText }}>
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
        {editGame ? 'Edit Game' : 'Add Game'}
      </h1>

      {/* BGG Search Section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Search on BGG</h2>
          {editGame && (
            <Button
              icon={<ReloadOutlined />}
              size="small"
              loading={bggLoading}
              onClick={handleRefreshBGG}
              style={{ borderRadius: 8 }}
            >
              Refresh BGG Data
            </Button>
          )}
        </div>
        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Input
            placeholder="Search BoardGameGeek..."
            prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.32)' }} />}
            value={bggQuery}
            onChange={(e) => handleBGGSearch(e.target.value)}
            allowClear
            style={{ flex: 1, borderRadius: '8px 0 0 8px', fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}
          />
        </Space.Compact>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Or enter BGG ID (e.g. 12 for Ra)"
            prefix={<NumberOutlined style={{ color: 'rgba(0,0,0,0.32)' }} />}
            value={bggIdInput}
            onChange={(e) => setBggIdInput(e.target.value)}
            onPressEnter={handleBGGIdLoad}
            style={{ flex: 1, fontFamily: sfText, fontSize: 14, letterSpacing: '-0.224px' }}
          />
          <Button onClick={handleBGGIdLoad} loading={bggLoading} style={{ borderRadius: '0 8px 8px 0' }}>Load</Button>
        </Space.Compact>
        {bggLoading && <Spin style={{ marginTop: 8 }} />}
        {bggResults.length > 0 && (
          <List
            size="small"
            style={{ maxHeight: 200, overflow: 'auto', marginTop: 12, borderRadius: 8 }}
            dataSource={bggResults}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  fontFamily: sfText,
                  fontSize: 14,
                  letterSpacing: '-0.224px',
                  color: '#1d1d1f',
                  padding: '8px 12px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                }}
                onClick={() => handleBGGSelect(item)}
              >
                {item.name} {item.yearPublished && <span style={{ color: 'rgba(0,0,0,0.48)' }}>({item.yearPublished})</span>}
              </List.Item>
            )}
          />
        )}
      </div>

      {/* Game Form */}
      <div style={sectionStyle}>
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
                  <span style={{ fontFamily: sfText, letterSpacing: '-0.224px' }}>
                    Name{' '}
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      style={{ padding: 0, height: 'auto', fontSize: 12, color: '#0071e3' }}
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
                <Input style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nameEn" label="English Name">
                <Input style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="price" label="Price">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} />
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
                <Input placeholder="e.g. 2-4" style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="playTime" label="Play Time">
                <Input placeholder="e.g. 60 min" style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="yearPublished" label="Year Published">
                <Input disabled style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="designer" label="Designer">
                <Input disabled style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="artist" label="Artist">
                <Input disabled style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="publisher" label="Publisher">
                <Input disabled style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="rating" label="My Rating (1-10)">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={1} max={10} precision={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="bggRating" label="BGG Avg Rating">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} max={10} step={0.1} disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="bggBayesRating" label="BGG Bayes Rating">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} max={10} step={0.1} disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="bggRank" label="BGG Rank">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} disabled />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="weight" label="Weight (1-5)">
                <InputNumber style={{ width: '100%', borderRadius: 8 }} min={0} max={5} step={0.1} disabled />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item name="image" label="Image URL">
                <Input placeholder="URL or leave empty" style={{ borderRadius: 8 }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="relatedGames" label="Related Expansions / Base Game">
            <Input.TextArea rows={2} disabled style={{ borderRadius: 8 }} />
          </Form.Item>

          <Form.Item name="bggId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="expansionBggIds" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="accessoryBggIds" hidden>
            <Input />
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} style={{ borderRadius: 8 }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              style={{
                borderRadius: 980,
                padding: '8px 32px',
                fontFamily: sfText,
                fontSize: 17,
                fontWeight: 400,
                letterSpacing: '-0.374px',
                height: 'auto',
              }}
            >
              {editGame ? 'Update' : 'Add to Collection'}
            </Button>
            <Button
              onClick={() => navigate('/collection')}
              style={{
                marginLeft: 12,
                borderRadius: 980,
                padding: '8px 24px',
                fontFamily: sfText,
                fontSize: 17,
                fontWeight: 400,
                letterSpacing: '-0.374px',
                height: 'auto',
                color: '#0071e3',
                borderColor: '#0071e3',
              }}
            >
              Cancel
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
