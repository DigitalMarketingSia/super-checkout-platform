import React, { useEffect, useState } from 'react';
import { storage } from '../../services/storageService';
import { Order, OrderStatus } from '../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingCart, TrendingUp, Users, ShoppingBag, CreditCard, ArrowRight, Barcode, QrCode, Crown, Zap } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFeatures } from '../../hooks/useFeatures';
import { Layout } from '../../components/Layout';
import Aurora from '../../components/ui/Aurora';
import { UpsellModal } from '../../components/ui/UpsellModal';
import { useTranslation } from 'react-i18next';
import { SystemManager } from '../../services/systemManager';
import { SystemInfo } from '../../types';
import { Settings } from 'lucide-react';
import { UpdateBanner } from '../../components/admin/UpdateBanner';
import { APP_VERSION } from '../../config/version';

type Period = 'today' | '7d' | '15d' | '30d';

export const Dashboard = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { theme } = useTheme();
  const { profile, isWhiteLabel } = useAuth();
  const { hasFeature, plan, isOwner } = useFeatures();
  const [period, setPeriod] = useState<Period>('today');
  const [upsellSlug, setUpsellSlug] = useState<'unlimited_domains' | 'partner_rights' | 'whitelabel' | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    successfulOrders: 0,
    abandonedCarts: 0,
    conversionRate: 0,
    avgTicket: 0,
    customers: 0,
    paymentMethods: { pix: 0, card: 0, boleto: 0 }
  });
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([]);

  // Filter orders by period
  const filterOrdersByPeriod = (orders: Order[], selectedPeriod: Period): Order[] => {
    const now = new Date();
    let cutoffDate: Date;

    switch (selectedPeriod) {
      case 'today':
        cutoffDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '15d':
        cutoffDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(now.setHours(0, 0, 0, 0));
    }

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= cutoffDate;
    });
  };

  // Generate chart data based on period
  const generateChartData = (orders: Order[], selectedPeriod: Period) => {
    const paidOrders = orders.filter(o => o.status === OrderStatus.PAID);

    if (selectedPeriod === 'today') {
      // Group by hour (0-23)
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        name: `${i}h`,
        value: 0
      }));

      paidOrders.forEach(order => {
        const hour = new Date(order.created_at).getHours();
        hourlyData[hour].value += order.amount;
      });

      return hourlyData;
    } else {
      // Group by day
      const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '15d' ? 15 : 30;
      const dailyData = Array.from({ length: days }, (_, i) => ({
        name: `${t('day', { defaultValue: 'Dia' })} ${i + 1}`,
        value: 0
      }));

      const now = Date.now();
      paidOrders.forEach(order => {
        const dayIndex = Math.floor(
          (now - new Date(order.created_at).getTime()) / (24 * 60 * 60 * 1000)
        );
        if (dayIndex >= 0 && dayIndex < days) {
          dailyData[days - 1 - dayIndex].value += order.amount;
        }
      });

      return dailyData;
    }
  };

  useEffect(() => {
    const load = async () => {
      const allOrders = await storage.getOrders();
      const filteredOrders = filterOrdersByPeriod(allOrders, period);

      // Calculate metrics
      const paidOrders = filteredOrders.filter(o => o.status === OrderStatus.PAID);
      const revenue = paidOrders.reduce((acc, curr) => acc + curr.amount, 0);
      const success = paidOrders.length;
      const total = filteredOrders.length;

      // Payment methods
      const pixCount = paidOrders.filter(o => o.payment_method === 'pix').length;
      const cardCount = paidOrders.filter(o => o.payment_method === 'credit_card').length;
      const boletoCount = paidOrders.filter(o => o.payment_method === 'boleto').length;

      // Unique customers
      const uniqueCustomers = new Set(filteredOrders.map(o => o.customer_email)).size;

      setStats({
        totalRevenue: revenue,
        totalOrders: total,
        successfulOrders: success,
        abandonedCarts: total - success,
        conversionRate: total > 0 ? (success / total) * 100 : 0,
        avgTicket: success > 0 ? revenue / success : 0,
        customers: uniqueCustomers,
        paymentMethods: { pix: pixCount, card: cardCount, boleto: boletoCount }
      });

      // Generate chart data
      setChartData(generateChartData(filteredOrders, period));
      
      // Load system info
      const info = await SystemManager.getSystemInfo();
      setSystemInfo(info);
    };

    load();
  }, [period]);

  const FilterButton = ({ label, value }: { label: string; value: Period }) => (
    <button
      onClick={() => setPeriod(value)}
      className={`px-8 py-2.5 rounded-full text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${period === value
        ? 'bg-primary text-white shadow-[0_0_20px_rgba(138,43,226,0.4)] border border-white/20'
        : 'bg-white/5 border border-white/5 text-gray-500 hover:text-white hover:border-white/10'
        }`}
    >
      {label}
    </button>
  );

  return (
    <Layout>
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 leading-none">
            {t('dashboard')}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('dashboard_desc')}</p>
            <div className="h-1 w-1 rounded-full bg-gray-800"></div>
            <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Live Control</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 lg:pb-0 bg-black/20 p-1.5 rounded-full border border-white/5">
          <FilterButton label={t('today')} value="today" />
          <FilterButton label={t('period_7d')} value="7d" />
          <FilterButton label={t('period_15d')} value="15d" />
          <FilterButton label={t('period_30d')} value="30d" />
        </div>
      </div>

      {/* Proactive Update Check */}
      <UpdateBanner />

      {/* Upgrade Banner for Free Users */}
      {!isWhiteLabel && (isOwner || plan !== 'free') === false && (
        <div className="mb-12 relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 p-[1px] shadow-2xl shadow-orange-500/20 group">
          <div className="relative bg-[#0A0A0F] rounded-[2.4rem] overflow-hidden p-8 md:p-10">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px] -mr-48 -mt-48 transition-transform duration-1000 group-hover:scale-110"></div>
            
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                <div className="w-20 h-20 rounded-[1.8rem] bg-gradient-to-br from-orange-400 to-yellow-600 flex items-center justify-center shadow-2xl shadow-orange-500/40 shrink-0 transform rotate-3 group-hover:rotate-0 transition-transform duration-500">
                  <Crown className="w-10 h-10 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-portal-display text-white leading-tight">
                    {t('upgrade_title')} <span className="text-orange-400">UNLIMITED</span>
                  </h3>
                  <p className="text-gray-500 text-sm md:text-base mt-2 max-w-xl font-medium">
                    {t('upgrade_desc')}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 w-full lg:w-auto">
                <Button
                  onClick={() => setUpsellSlug('unlimited_domains')}
                  className="w-full sm:w-auto px-10 py-5 bg-orange-500 hover:bg-orange-600 text-white font-black text-lg rounded-[1.5rem] border-none shadow-2xl shadow-orange-500/30 flex items-center justify-center gap-3 transform transition-all active:scale-95"
                >
                  <Zap className="w-6 h-6 fill-current" />
                  {t('upgrade_btn')}
                </Button>
                <button
                  onClick={() => setUpsellSlug('partner_rights')}
                  className="text-gray-500 hover:text-white font-black text-xs uppercase tracking-[0.2em] transition-colors flex items-center gap-2 group/btn"
                >
                  {t('view_partner_plans')}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN GRID LAYOUT - Optimized for First Fold */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">

        {/* COLUMN 1 & 2 (Wide Area) */}
        <div className="lg:col-span-3 flex flex-col gap-8">

          {/* Top Row: Sales & Count */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Card 1: Revenue with Aurora Background */}
            <Card className="relative overflow-hidden group min-h-[220px] flex flex-col justify-end">
              {/* Aurora Animated Background */}
              <div className="absolute inset-0 opacity-40">
                <Aurora
                  colorStops={['#8A2BE2', '#4B0082', '#0000FF']}
                  amplitude={1}
                  blend={0.5}
                  speed={0.3}
                />
              </div>

              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <DollarSign className="w-32 h-32 text-white" />
              </div>
              
              <div className="relative z-10 p-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/20 backdrop-blur-md">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <span className="text-white/60 font-black uppercase tracking-[0.2em] text-[10px]">{t('sales_made')}</span>
                </div>
                <h3 className="text-4xl lg:text-5xl font-portal-display text-white leading-none">
                  {new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : i18n.language === 'es' ? 'EUR' : 'USD' }).format(stats.totalRevenue)}
                </h3>
              </div>
            </Card>

            {/* Card 2: Volume with Aurora Background */}
            <Card className="relative overflow-hidden group min-h-[220px] flex flex-col justify-end">
              <div className="absolute inset-0 bg-blue-600/5"></div>
              
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShoppingBag className="w-32 h-32 text-white" />
              </div>

              <div className="relative z-10 p-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/20 backdrop-blur-md">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <span className="text-white/60 font-black uppercase tracking-[0.2em] text-[10px]">{t('sales_count')}</span>
                </div>
                <h3 className="text-4xl lg:text-5xl font-portal-display text-white leading-none">
                  {stats.successfulOrders}
                </h3>
              </div>
            </Card>
          </div>

          {/* Row 2: Payment Methods (Wide) with Aurora Background */}
          <Card className="relative overflow-hidden flex-1 min-h-[200px] flex flex-col justify-center">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                   <span className="text-white opacity-40 font-black uppercase tracking-[0.2em] text-[10px]">{t('payment_methods_title')}</span>
                </div>
                <div className="text-[10px] uppercase font-black tracking-widest text-gray-700">{t('conversion')}</div>
              </div>

              {stats.successfulOrders > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Pix */}
                  <div className="bg-white/5 rounded-[1.5rem] p-6 border border-white/5 flex items-center justify-between group hover:bg-white/10 hover:border-white/10 transition-all duration-300">
                     <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#10B981]/10 flex items-center justify-center border border-[#10B981]/20 group-hover:scale-110 transition-transform">
                        <QrCode className="w-6 h-6 text-[#10B981]" />
                      </div>
                      <span className="text-white font-bold tracking-tight">{t('pix')}</span>
                    </div>
                    <span className="text-2xl font-portal-display text-white opacity-80">{stats.paymentMethods.pix}</span>
                  </div>
                  {/* Card */}
                  <div className="bg-white/5 rounded-[1.5rem] p-6 border border-white/5 flex items-center justify-between group hover:bg-white/10 hover:border-white/10 transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
                        <CreditCard className="w-6 h-6 text-primary" />
                      </div>
                      <span className="text-white font-bold tracking-tight">{t('card')}</span>
                    </div>
                    <span className="text-2xl font-portal-display text-white opacity-80">{stats.paymentMethods.card}</span>
                  </div>
                  {/* Boleto */}
                  <div className="bg-white/5 rounded-[1.5rem] p-6 border border-white/5 flex items-center justify-between group hover:bg-white/10 hover:border-white/10 transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:scale-110 transition-transform">
                        <Barcode className="w-6 h-6 text-orange-400" />
                      </div>
                      <span className="text-white font-bold tracking-tight">{t('boleto')}</span>
                    </div>
                    <span className="text-2xl font-portal-display text-white opacity-80">{stats.paymentMethods.boleto}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                  <p className="uppercase font-black tracking-widest text-xs opacity-50">{t('no_sales_found')}</p>
                </div>
              )}
            </div>
          </Card>

        </div>

        {/* COLUMN 3 (Vertical Stats Stack) */}
        <div className="lg:col-span-1">
          <Card className="relative overflow-hidden h-full flex flex-col justify-between">
            <div className="relative z-10 p-2">
              <h3 className="text-white/40 font-black uppercase tracking-[0.2em] text-[10px] mb-8">{t('performance')}</h3>

              <div className="flex-1 flex flex-col justify-between gap-10">
                <div className="group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-tight">{t('abandoned_carts')}</span>
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]"></div>
                  </div>
                  <div className="text-4xl font-portal-display text-white">{stats.abandonedCarts}</div>
                </div>

                 <div className="group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-tight">{t('conversion_rate')}</span>
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-4xl font-portal-display text-white">{stats.conversionRate.toFixed(1)}%</div>
                </div>

                <div className="group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-tight">{t('avg_ticket')}</span>
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-3xl font-portal-display text-white truncate">
                    {new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : i18n.language === 'es' ? 'EUR' : 'USD' }).format(stats.avgTicket)}
                  </div>
                </div>

                <div className="group">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 font-bold text-xs uppercase tracking-tight">{t('customers_label')}</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-4xl font-portal-display text-white">{stats.customers}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* CHART SECTION (Bottom of first fold) */}
      <div className="w-full h-80 lg:h-96">
        <Card className="relative overflow-hidden h-full flex flex-col" noPadding>
          <div className="relative z-10 p-8 pb-0 flex justify-between items-end">
            <div>
               <h3 className="font-portal-display text-2xl text-white">{t('sales_volume')}</h3>
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700 mt-1">Market Activity</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-gray-600">
               <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-primary"></div>
                  <span>VOLUME</span>
               </div>
            </div>
          </div>
          
          <div className="relative z-10 w-full flex-1 px-4 mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8A2BE2" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8A2BE2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="10 10" vertical={false} stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: '900' }}
                  dy={20}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#4B5563', fontSize: 10, fontWeight: '900' }}
                  tickFormatter={(value) => `${i18n.language === 'pt' ? 'R$' : i18n.language === 'es' ? '€' : '$'}${(value / 1000).toFixed(1)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A0A0F',
                    borderRadius: '1.5rem',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.8)',
                    padding: '16px'
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#6B7280', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.1em' }}
                  cursor={{ stroke: 'rgba(138, 43, 226, 0.3)', strokeWidth: 2 }}
                  formatter={(value: number) => [`${new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : 'USD' }).format(value)} `, t('vendas')]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#8A2BE2"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  animationDuration={2000}
                  activeDot={{ r: 8, strokeWidth: 4, stroke: '#05050A', fill: '#8A2BE2' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <UpsellModal
        isOpen={!!upsellSlug}
        onClose={() => setUpsellSlug(null)}
        offerSlug={upsellSlug}
      />
    </Layout>
  );
};
