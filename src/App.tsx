import { useEffect, useReducer, useState } from 'react';
import { createBrowserRouter, RouterProvider, Link, Navigate, useLocation, Outlet } from 'react-router-dom';
import { Button, ConfigProvider, Form, Input, Layout, Menu, Modal, Spin, message } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
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
import Statistics from './pages/Statistics';
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
    { key: '/statistics', icon: <BarChartOutlined />, label: <Link to="/statistics">Statistics</Link> },
  ];

  const selectedKey = menuItems.find((item) =>
    item.key === '/' ? location.pathname === '/' : location.pathname.startsWith(item.key)
  )?.key || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="60" theme="dark">
        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
          BGC
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Content style={{ margin: 24 }}>
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
      { path: 'statistics', element: <Statistics /> },
      { path: '*', element: <Navigate to="/" /> },
    ],
  },
]);

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [authReady, setAuthReady] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);

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
    if (gamesWithBgg.length === 0) {
      message.info('No games with BGG ID to refresh');
      return;
    }
    setRefreshingAll(true);
    let updated = 0;
    for (const game of gamesWithBgg) {
      try {
        const detail = await getBGGDetail(game.bggId!);
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
          };
          await updateGame(updatedGame, state.userId!);
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
    message.success(`Refreshed ${updated} / ${gamesWithBgg.length} games`);
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
      <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
        <Login onSuccess={loadUserGames} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
      <GameContext.Provider value={{ state, dispatch }}>
        <div style={{ position: 'fixed', top: 12, right: 24, zIndex: 1000, display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} size="small" loading={refreshingAll} onClick={handleRefreshAll}>Refresh BGG</Button>
          <Button icon={<ExportOutlined />} size="small" onClick={handleExport}>Export</Button>
          <Button icon={<LockOutlined />} size="small" onClick={() => setPwModalOpen(true)}>Password</Button>
          <Button icon={<LogoutOutlined />} size="small" onClick={handleLogout}>Logout</Button>
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
        <RouterProvider router={router} />
      </GameContext.Provider>
    </ConfigProvider>
  );
}
