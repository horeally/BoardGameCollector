import { Button, Card, Form, Input, Tabs, Typography, message } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { supabase } from '../utils/supabase';
import { claimInviteCode, createProfile, validateInviteCode } from '../utils/db';

const { Title, Text } = Typography;

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      message.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: {
    email: string;
    password: string;
    username: string;
    inviteCode: string;
  }) => {
    setLoading(true);
    try {
      // Validate invite code first
      const valid = await validateInviteCode(values.inviteCode);
      if (!valid) {
        message.error('Invalid or already used invite code');
        return;
      }

      // Register
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      if (!data.user) throw new Error('Registration failed');

      // Claim invite code and create profile
      await claimInviteCode(values.inviteCode, data.user.id);
      await createProfile(data.user.id, values.username);

      message.success('Registration successful!');
      onSuccess();
    } catch (err: any) {
      message.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const items = [
    {
      key: 'login',
      label: 'Login',
      children: (
        <Form layout="vertical" onFinish={handleLogin}>
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Password required' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Login
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'register',
      label: 'Register',
      children: (
        <Form layout="vertical" onFinish={handleRegister}>
          <Form.Item name="inviteCode" rules={[{ required: true, message: 'Invite code required' }]}>
            <Input prefix={<KeyOutlined />} placeholder="Invite Code" size="large" />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true, message: 'Username required' }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Confirm Password" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Register
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 4 }}>Board Game Collector</Title>
          <Text type="secondary">Track your collection & spending</Text>
        </div>
        <Tabs items={items} centered />
      </Card>
    </div>
  );
}
