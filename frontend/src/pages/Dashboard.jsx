import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import api from '../api';

function StatCard({ title, value, icon, color }) {
  return (
    <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '200px' }}>
      <div style={{ padding: '16px', borderRadius: '50%', backgroundColor: `${color}20`, color: color }}>
        {icon}
      </div>
      <div>
        <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>{title}</h3>
        <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{value}</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('dashboard-stats/');
      return res.data;
    }
  });

  const COLORS = ['#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#2ecc71', '#f39c12'];

  if (isLoading) {
    return <div style={{ padding: '32px' }}>Loading dashboard...</div>;
  }

  const { kpi, chartData, productPerformance, categoryPerformance, paymentPerformance, recentSales } = statsData || { 
    kpi: { total_revenue: 0, total_profit: 0, total_sales: 0, total_sales_debt: 0, total_external_debt_given: 0, total_external_debt_taken: 0 }, 
    chartData: [], productPerformance: [], categoryPerformance: [], paymentPerformance: [], recentSales: [] 
  };

  const totalDebt = kpi.total_sales_debt + kpi.total_external_debt_taken; // or just show them separately

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '8px' }}>Boshqaruv paneli</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Avto xizmat ko'rsatkichlari.</p>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <StatCard 
          title="Umumiy tushum" 
          value={`${kpi.total_revenue.toLocaleString()} so'm`} 
          icon={<DollarSign size={20} />} 
          color="#4361ee" 
        />
        <StatCard 
          title="Umumiy foyda" 
          value={`${kpi.total_profit.toLocaleString()} so'm`} 
          icon={<TrendingUp size={20} />} 
          color="#2ecc71" 
        />
        <StatCard 
          title="Umumiy sotuvlar" 
          value={kpi.total_sales} 
          icon={<ShoppingBag size={20} />} 
          color="#9b59b6" 
        />
        <StatCard 
          title="Mijoz qarzlari (To'lanmagan)" 
          value={`${kpi.total_sales_debt.toLocaleString()} so'm`} 
          icon={<Users size={20} />} 
          color="#e74c3c" 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Revenue Chart */}
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', color: 'var(--text-main)' }}>Tushum tendensiyasi (Oxirgi 10 faol kun)</h2>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `${val / 1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--primary)' }}
                />
                <Bar dataKey="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Sales List */}
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', color: 'var(--text-main)' }}>So'nggi sotuvlar</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recentSales.map(sale => (
              <div key={sale.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>{sale.client}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(sale.datetime).toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{sale.total_amount.toLocaleString()} so'm</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{sale.items_count} mahsulot</p>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>So'nggi sotuvlar yo'q</p>}
          </div>
        </div>

        {/* Top Products */}
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', color: 'var(--text-main)' }}>Eng ko'p sotilgan mahsulotlar</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {productPerformance.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>{item.name}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.qty} dona sotildi</p>
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                  {item.value.toLocaleString()} so'm
                </div>
              </div>
            ))}
            {productPerformance.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Mahsulot ma'lumotlari yo'q</p>}
          </div>
        </div>

        {/* Sales By Category */}
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', color: 'var(--text-main)' }}>Toifalar bo'yicha sotuvlar</h2>
          <div style={{ height: '250px', width: '100%' }}>
            {categoryPerformance.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={categoryPerformance} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {categoryPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toLocaleString()} so'm`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '100px' }}>Toifa ma'lumotlari yo'q</p>}
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', color: 'var(--text-main)' }}>To'lov usuli bo'yicha tushum</h2>
          <div style={{ height: '250px', width: '100%' }}>
            {paymentPerformance.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={paymentPerformance} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {paymentPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index+2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toLocaleString()} so'm`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '100px' }}>To'lov ma'lumotlari yo'q</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
