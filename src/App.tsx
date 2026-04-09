import { useEffect, useReducer, useRef, useState } from 'react';
import { createBrowserRouter, RouterProvider, Link, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Button, ConfigProvider, Form, Input, Layout, Menu, Modal, Spin, message } from 'antd';
import {
  AppstoreOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  DollarOutlined,
  ExportOutlined,
  LockOutlined,
  LogoutOutlined,
  PieChartOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { GameContext, gameReducer, initialState } from './store/gameStore';
import { exportGames } from './utils/storage';
import { fetchGames, updateGame, fetchExpansionTotalSpent, fetchExpansionSpentByCurrency } from './utils/db';
import { getBGGDetail } from './utils/bgg';
import { supabase } from './utils/supabase';
import Dashboard from './pages/Dashboard';
import Collection from './pages/Collection';
import AddGame from './pages/AddGame';
import Sold from './pages/Sold';
import Login from './pages/Login';

const { Content, Sider } = Layout;

function AppLayout() {
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <AppstoreOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/collection', icon: <PieChartOutlined />, label: <Link to="/collection">Collection</Link> },
    { key: '/add', icon: <PlusOutlined />, label: <Link to="/add">Add Game</Link> },
    { key: '/sold', icon: <DollarOutlined />, label: <Link to="/sold">Sold</Link> },
  ];

  const selectedKey = menuItems.find((item) =>
    item.key === '/' ? location.pathname === '/' : location.pathname.startsWith(item.key)
  )?.key || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="dark" style={{ zIndex: 999 }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
          BGC
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Content style={{ margin: '16px 12px', maxWidth: '100%', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'collection', element: <Collection /> },
      { path: 'add', element: <AddGame /> },
      { path: 'sold', element: <Sold /> },
      { path: '*', element: <Navigate to="/" /> },
    ],
  },
]);

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [authReady, setAuthReady] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  const [rankChanges, setRankChanges] = useState<{ name: string; image?: string; oldRank: number | null; newRank: number | null }[]>([]);
  const [rankModalOpen, setRankModalOpen] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      dispatch({ type: 'SET_USER', payload: session?.user?.id || null });
      setAuthReady(true);
      if (session?.user) loadUserGames();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      dispatch({ type: 'SET_USER', payload: session?.user?.id || null });
      if (session?.user) loadUserGames();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserGames = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const [games, expSpent, expByCurrency] = await Promise.all([
        fetchGames(), fetchExpansionTotalSpent(), fetchExpansionSpentByCurrency(),
      ]);
      dispatch({ type: 'SET_GAMES', payload: games });
      dispatch({ type: 'SET_EXPANSION_SPENT', payload: expSpent });
      dispatch({ type: 'SET_EXPANSION_SPENT_BY_CURRENCY', payload: expByCurrency });
    } catch {
      message.error('Failed to load games');
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    dispatch({ type: 'SET_USER', payload: null });
    dispatch({ type: 'SET_GAMES', payload: [] });
  };

  const handleRefreshAll = async () => {
    const gamesWithBgg = state.games.filter((g) => !g.sold && g.bggId);
    const gameIds = gamesWithBgg.map((g) => g.id);
    if (gameIds.length === 0) {
      message.info('No games with BGG ID to refresh');
      return;
    }

    // Snapshot old ranks before refresh
    const oldRanks = new Map<string, { rank: number | null; name: string; image?: string }>();
    for (const g of gamesWithBgg) {
      oldRanks.set(g.id, { rank: g.bggRank ?? null, name: g.name, image: g.image });
    }

    setRefreshingAll(true);
    setRefreshProgress({ current: 0, total: gameIds.length });
    let updated = 0;
    for (let i = 0; i < gameIds.length; i++) {
      // Read latest game from ref each iteration to avoid stale closure
      const game = stateRef.current.games.find((g) => g.id === gameIds[i]);
      if (!game || !game.bggId) continue;
      setRefreshProgress({ current: i + 1, total: gameIds.length });
      try {
        const detail = await getBGGDetail(game.bggId);
        if (detail) {
          const updatedGame = {
            ...game,
            nameEn: detail.name || game.nameEn,
            category: detail.category || game.category,
            bggRating: detail.bggRating ?? game.bggRating,
            bggBayesRating: detail.bggBayesRating ?? game.bggBayesRating,
            bggRank: detail.bggRank ?? game.bggRank,
            weight: detail.weight ?? game.weight,
            designer: detail.designer ?? game.designer,
            artist: detail.artist ?? game.artist,
            publisher: detail.publisher ?? game.publisher,
            yearPublished: detail.yearPublished ?? game.yearPublished,
            image: detail.image ?? game.image,
            relatedGames: detail.relatedGames ?? game.relatedGames,
            expansionBggIds: detail.expansionIds?.length ? detail.expansionIds : game.expansionBggIds,
            accessoryBggIds: detail.accessoryIds?.length ? detail.accessoryIds : game.accessoryBggIds,
          };
          await updateGame(updatedGame, stateRef.current.userId!);
          dispatch({ type: 'UPDATE_GAME', payload: updatedGame });
          updated++;
        }
      } catch {
        console.error(`Failed to refresh ${game.name}`);
      }
    }
    // Reload all data from DB to ensure consistency
    await loadUserGames();
    setRefreshingAll(false);
    message.success(`Refreshed ${updated} / ${gameIds.length} games`);

    // Compare ranks and show changes
    const changes: typeof rankChanges = [];
    const freshGames = stateRef.current.games;
    for (const [id, old] of oldRanks) {
      const fresh = freshGames.find((g) => g.id === id);
      if (!fresh) continue;
      const newRank = fresh.bggRank ?? null;
      const oldRank = old.rank;
      if (oldRank === newRank) continue;
      // Both null → no change; one null → show as change
      if (oldRank == null && newRank == null) continue;
      changes.push({ name: fresh.name, image: fresh.image, oldRank, newRank });
    }
    if (changes.length > 0) {
      // Sort: biggest rank improvement first (oldRank - newRank descending)
      changes.sort((a, b) => {
        const da = (a.oldRank ?? 99999) - (a.newRank ?? 99999);
        const db = (b.oldRank ?? 99999) - (b.newRank ?? 99999);
        return db - da;
      });
      setRankChanges(changes);
      setRankModalOpen(true);
    }
  };

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwForm] = Form.useForm();

  const handleChangePassword = async () => {
    try {
      const values = await pwForm.validateFields();
      setPwLoading(true);
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) throw error;
      message.success('Password updated');
      setPwModalOpen(false);
      pwForm.resetFields();
    } catch (err: any) {
      message.error(err.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleExport = () => {
    exportGames(state.games);
    message.success('Exported successfully');
  };

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!state.userId) {
    return (
      <ConfigProvider theme={{ token: { colorPrimary: '#0071e3' } }}>
        <Login onSuccess={loadUserGames} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0071e3' } }}>
      <GameContext.Provider value={{ state, dispatch }}>
        <div className="top-actions" style={{ position: 'fixed', top: 12, right: 12, zIndex: 1000, display: 'flex', gap: 6 }}>
          <Button icon={<ReloadOutlined />} size="small" loading={refreshingAll} onClick={handleRefreshAll}>
            <span className="btn-text">
              {refreshingAll ? `${Math.round((refreshProgress.current / refreshProgress.total) * 100)}%` : 'Refresh BGG'}
            </span>
          </Button>
          <Button icon={<ExportOutlined />} size="small" onClick={handleExport}><span className="btn-text">Export</span></Button>
          <Button icon={<LockOutlined />} size="small" onClick={() => setPwModalOpen(true)}><span className="btn-text">Password</span></Button>
          <Button icon={<LogoutOutlined />} size="small" onClick={handleLogout}><span className="btn-text">Logout</span></Button>
        </div>
        <Modal
          title="Change Password"
          open={pwModalOpen}
          onOk={handleChangePassword}
          onCancel={() => { setPwModalOpen(false); pwForm.resetFields(); }}
          okText="Update"
          confirmLoading={pwLoading}
        >
          <Form form={pwForm} layout="vertical">
            <Form.Item name="newPassword" label="New Password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
              <Input.Password placeholder="New password" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="Confirm Password"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Confirm new password" />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title={null}
          open={rankModalOpen}
          onCancel={() => setRankModalOpen(false)}
          footer={null}
          width={520}
          centered
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ padding: '24px 24px 8px' }}>
            <div style={{
              fontSize: 21,
              fontWeight: 600,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
              letterSpacing: '0.011em',
              color: '#1d1d1f',
              lineHeight: 1.19,
            }}>
              Rank Changes
            </div>
            <div style={{
              fontSize: 14,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif',
              letterSpacing: '-0.224px',
              color: 'rgba(0,0,0,0.48)',
              marginTop: 4,
            }}>
              {rankChanges.length} game{rankChanges.length > 1 ? 's' : ''} with rank updates
            </div>
          </div>
          <div className="scroll-hide" style={{ maxHeight: '50vh', overflowY: 'auto', padding: '8px 24px 24px' }}>
            {rankChanges.map((item, i) => {
              const oldR = item.oldRank;
              const newR = item.newRank;
              // Lower rank number = better; diff > 0 means improvement
              const diff = oldR != null && newR != null ? oldR - newR : null;
              const isUp = diff != null && diff > 0;
              const isDown = diff != null && diff < 0;
              const isNew = oldR == null && newR != null;
              const isDropped = oldR != null && newR == null;
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: i < rankChanges.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                }}>
                  {item.image ? (
                    <img src={item.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 40, height: 40, background: '#f5f5f7', borderRadius: 8, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 400,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif',
                      letterSpacing: '-0.224px',
                      color: '#1d1d1f',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{item.name}</div>
                    <div style={{
                      fontSize: 12,
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif',
                      letterSpacing: '-0.12px',
                      color: 'rgba(0,0,0,0.48)',
                      marginTop: 2,
                    }}>
                      #{oldR ?? '—'} → #{newR ?? '—'}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
                    letterSpacing: '-0.224px',
                    color: isUp || isNew ? '#34c759' : isDown || isDropped ? '#ff3b30' : 'rgba(0,0,0,0.48)',
                  }}>
                    {isUp && <><CaretUpOutlined />{diff}</>}
                    {isDown && <><CaretDownOutlined />{Math.abs(diff!)}</>}
                    {isNew && <>NEW</>}
                    {isDropped && <>OUT</>}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
        <RouterProvider router={router} />
      </GameContext.Provider>
    </ConfigProvider>
  );
}
