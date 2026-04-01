import { Card, Statistic } from 'antd';

interface StatCardProps {
  title: string;
  value?: number | string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  children?: React.ReactNode;
}

export default function StatCard({ title, value, prefix, suffix, precision, children }: StatCardProps) {
  return (
    <Card bordered={false} style={{ textAlign: 'center' }}>
      {children ? (
        <div>
          <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, marginBottom: 4 }}>{title}</div>
          {children}
        </div>
      ) : (
        <Statistic title={title} value={value} prefix={prefix} suffix={suffix} precision={precision} />
      )}
    </Card>
  );
}
