import React, { useEffect, useState } from 'react';
import { storage } from '../../services/storageService';
import { Order, OrderStatus } from '../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, ShoppingCart, TrendingUp, Users, ShoppingBag, CreditCard, Barcode, Eye, EyeOff, Sun, Moon, Calendar, Infinity } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Layout } from '../../components/Layout';
import Aurora from '../../components/ui/Aurora';
import { useTranslation } from 'react-i18next';
import { UpdateBanner } from '../../components/admin/UpdateBanner';
import { getRuntimeMode } from '../../config/runtimeMode';

type Period = 'today' | 'yesterday' | '7d' | '15d' | '30d' | 'total';

// Official Logos
const PixLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`w-5 h-5 fill-[#32BCAD] flex-shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
    <path d="M15.45 16.52l-3.01-3.01c-.11-.11-.24-.13-.31-.13s-.2.02-.31.13L8.8 16.53c-.34.34-.87.89-2.64.89l3.71 3.7a3 3 0 004.24 0l3.72-3.71c-.91 0-1.67-.18-2.38-.89zM8.8 7.47l3.02 3.02c.08.08.2.13.31.13s.23-.05.31-.13l2.99-2.99c.71-.74 1.52-.91 2.43-.91l-3.72-3.71a3 3 0 00-4.24 0l-3.71 3.7c1.76 0 2.3.58 2.61.89z"/>
    <path d="M21.11 9.85l-2.25-2.26H17.6c-.54 0-1.08.22-1.45.61l-3 3c-.28.28-.65.42-1.02.42a1.5 1.5 0 01-1.02-.42L8.09 8.17c-.38-.38-.9-.6-1.45-.6H5.17l-2.29 2.3a3 3 0 000 4.24l2.29 2.3h1.48c.54 0 1.06-.22 1.45-.6l3.02-3.02c.28-.28.65-.42 1.02-.42s.74.14 1.02.42l3.01 3.01c.38.38.9.6 1.45.6h1.26l2.25-2.26a3.042 3.042 0 00-.02-4.29z"/>
  </svg>
);

const CardLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-1 w-12 h-5 flex-shrink-0 ${className}`}>
    {/* Visa Logo */}
    <svg viewBox="0 0 24 15" className="h-3.5 w-6 rounded-sm flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="1.5" fill="#1A1F71"/>
      <path d="M6.2 10.5L7.4 4.5h1.9l-1.2 6H6.2zm7.7-5.8c-.3-.2-.9-.4-1.6-.4-1.7 0-2.9.9-2.9 2.2 0 1 .9 1.5 1.6 1.8.7.3.9.6.9.9 0 .5-.6.7-1.1.7-.8 0-1.2-.1-1.9-.4l-.3-.1-.3 1.8c.5.2 1.4.4 2.3.4 2.2 0 3.6-1.1 3.6-2.8 0-1-.6-1.7-1.9-2.3-.7-.4-1.1-.6-1.1-1 0-.3.4-.7 1.2-.7.6 0 1.1.1 1.5.3l.2.1.2-1.7zm5.2 2.1c.2-.5.8-2 .8-2l.4 1.9h-1.2zm2.3 3.7l-1.5-6H13.2l-1.8 6h1.9l.4-1h2.2l.2 1h1.7z" fill="#FFF"/>
    </svg>
    {/* Mastercard Logo */}
    <svg viewBox="0 0 24 15" className="h-3.5 w-6 rounded-sm flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="15" rx="1.5" fill="#111"/>
      <circle cx="10" cy="7.5" r="4.5" fill="#EB001B"/>
      <circle cx="14" cy="7.5" r="4.5" fill="#F79E1B" fillOpacity="0.8"/>
    </svg>
  </div>
);

const BoletoLogo = ({ className = "" }: { className?: string }) => (
  <svg className={`w-5 h-5 flex-shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="14" rx="2" fill="#F59E0B" fillOpacity="0.1" stroke="#F59E0B" strokeWidth="1.5"/>
    <line x1="6" y1="9" x2="6" y2="15" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="9" y1="9" x2="9" y2="15" stroke="#F59E0B" strokeWidth="1" strokeLinecap="round"/>
    <line x1="12" y1="9" x2="12" y2="15" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="15" y1="9" x2="15" y2="15" stroke="#F59E0B" strokeWidth="1" strokeLinecap="round"/>
    <line x1="18" y1="9" x2="18" y2="15" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const ApplePayLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 448 512" fill="currentColor" className={`w-5 h-5 text-white flex-shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.3zM344 86h-.4c-17.4 18.1-30.5 45.1-31.1 69.8 44.6 1.9 66.8-44.1 66.8-44.1-14.4-16.7-32.5-25.7-35.3-25.7z"/>
  </svg>
);

const GooglePayLogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={`w-5 h-5 flex-shrink-0 ${className}`} xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M46.1 24.5c0-1.5-.1-3.2-.4-4.5H24v9h12.5c-.6 3-2.3 5.5-4.8 7.2v6h7.7c4.5-4.2 7.1-10.4 7.1-17.8z"/>
    <path fill="#34A853" d="M24 47c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2 1.4-4.7 2.2-7.5 2.2-5.8 0-10.7-3.9-12.4-9.2H3.7v6.1C7.4 42 15 47 24 47z"/>
    <path fill="#FBBC05" d="M11.6 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-6.1H3.7C2.2 16.5 1.5 19.2 1.5 22s.7 5.5 2.2 8.5l7.9-2.1z"/>
    <path fill="#EA4335" d="M24 9.4c3.4 0 6.4 1.2 8.8 3.4l6.6-6.6C35.4 2.5 30.2.5 24 .5 15 .5 7.4 5.5 3.7 13.5l7.9 6.1C13.3 13.3 18.2 9.4 24 9.4z"/>
  </svg>
);

export const Dashboard = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [period, setPeriod] = useState<Period>('today');
  const [showValues, setShowValues] = useState(true);
  const isDemoMode = getRuntimeMode() === 'demo';
  const locale = i18n.language === 'pt' ? 'pt-BR' : i18n.language === 'es' ? 'es-ES' : 'en-US';
  const currency = i18n.language === 'pt' ? 'BRL' : i18n.language === 'es' ? 'EUR' : 'USD';

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    successfulOrders: 0,
    abandonedCarts: 0,
    conversionRate: 0,
    avgTicket: 0,
    customers: 0,
    paymentMethods: { pix: 0, card: 0, boleto: 0, google_pay: 0, apple_pay: 0 },
    pendingRevenue: 0,
    refundedRevenue: 0,
    refundedCount: 0,
    productCount: 0,
    productsCreatedToday: 0
  });

  const [comparisonStats, setComparisonStats] = useState({
    revenueChange: 0,
    countChange: 0,
    abandonedChange: 0,
    refundedChange: 0
  });

  const [chartData, setChartData] = useState<{ name: string; value: number }[]>([]);
  const [paidOrdersState, setPaidOrdersState] = useState<Order[]>([]);

  // Format value depending on eye visibility toggle
  const formatValue = (val: string | number, isCurrency = false) => {
    if (!showValues) return isCurrency ? (currency === 'BRL' ? 'R$ ••••' : currency === 'EUR' ? '€ ••••' : '$ ••••') : '••••';
    if (typeof val === 'number' && isCurrency) {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(val);
    }
    return val.toString();
  };

  // Filter orders by period
  const filterOrdersByPeriod = (orders: Order[], selectedPeriod: Period): Order[] => {
    if (selectedPeriod === 'total') {
      return orders;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    let startDate: Date;
    let endDate: Date | null = null;

    switch (selectedPeriod) {
      case 'today':
        startDate = startOfToday;
        break;
      case 'yesterday':
        startDate = startOfYesterday;
        endDate = startOfToday;
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '15d':
        startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = startOfToday;
    }

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);

      if (endDate) {
        return orderDate >= startDate && orderDate < endDate;
      }

      return orderDate >= startDate;
    });
  };

  // Previous period range mapping
  const getPreviousPeriodRange = (selectedPeriod: Period) => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    
    let start: Date;
    let end: Date;

    switch (selectedPeriod) {
      case 'today':
        start = startOfYesterday;
        end = startOfToday;
        break;
      case 'yesterday':
        start = new Date(startOfYesterday.getTime() - 24 * 60 * 60 * 1000);
        end = startOfYesterday;
        break;
      case '7d':
        start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        end = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '15d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        end = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'total':
      default:
        start = new Date(0);
        end = now;
    }
    return { start, end };
  };

  // Generate chart data based on period
  const generateChartData = (orders: Order[], selectedPeriod: Period) => {
    const paidOrders = orders.filter(o => o.status === OrderStatus.PAID);

    if (selectedPeriod === 'today' || selectedPeriod === 'yesterday') {
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        name: `${i.toString().padStart(2, '0')}:00`,
        value: 0
      }));

      paidOrders.forEach(order => {
        const hour = new Date(order.created_at).getHours();
        hourlyData[hour].value += order.amount;
      });

      return hourlyData;
    }

    if (selectedPeriod === 'total') {
      const monthFormatter = new Intl.DateTimeFormat(locale, {
        month: 'short',
        year: '2-digit'
      });
      const monthlyTotals = new Map<string, { name: string; value: number; timestamp: number }>();

      paidOrders.forEach(order => {
        const orderDate = new Date(order.created_at);
        const monthStart = new Date(orderDate.getFullYear(), orderDate.getMonth(), 1);
        const key = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;
        const existingBucket = monthlyTotals.get(key);

        if (existingBucket) {
          existingBucket.value += order.amount;
          return;
        }

        monthlyTotals.set(key, {
          name: monthFormatter.format(monthStart),
          value: order.amount,
          timestamp: monthStart.getTime()
        });
      });

      return Array.from(monthlyTotals.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(({ name, value }) => ({ name, value }));
    }

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
  };

  useEffect(() => {
    const load = async () => {
      const allOrders = await storage.getOrders();
      const allProducts = await storage.getProducts();
      const filteredOrders = filterOrdersByPeriod(allOrders, period);

      // Current calculations
      const paidOrders = filteredOrders.filter(o => o.status === OrderStatus.PAID);
      const revenue = paidOrders.reduce((acc, curr) => acc + curr.amount, 0);
      const success = paidOrders.length;
      const total = filteredOrders.length;

      const pendingOrders = filteredOrders.filter(o => o.status === OrderStatus.PENDING);
      const pendingRevenue = pendingOrders.reduce((acc, curr) => acc + curr.amount, 0);

      const refundedOrders = filteredOrders.filter(o => o.status === OrderStatus.REFUNDED);
      const refundedRevenue = refundedOrders.reduce((acc, curr) => acc + curr.amount, 0);
      const refundedCount = refundedOrders.length;

      const pixCount = paidOrders.filter(o => o.payment_method === 'pix').length;
      const cardCount = paidOrders.filter(o => o.payment_method === 'credit_card').length;
      const boletoCount = paidOrders.filter(o => o.payment_method === 'boleto').length;
      const googlePayCount = paidOrders.filter(o => o.payment_method === 'google_pay').length;
      const applePayCount = paidOrders.filter(o => o.payment_method === 'apple_pay').length;

      const uniqueCustomers = new Set(filteredOrders.map(o => o.customer_email)).size;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const productsCreatedToday = allProducts.filter(p => p.created_at && new Date(p.created_at) >= todayStart).length;

      // Comparison calculations
      const { start: prevStart, end: prevEnd } = getPreviousPeriodRange(period);
      const prevOrders = allOrders.filter(o => {
        const d = new Date(o.created_at);
        return d >= prevStart && d < prevEnd;
      });
      const prevPaidOrders = prevOrders.filter(o => o.status === OrderStatus.PAID);
      const prevRevenue = prevPaidOrders.reduce((acc, curr) => acc + curr.amount, 0);
      const prevSalesCount = prevPaidOrders.length;
      const prevAbandonedCarts = prevOrders.length - prevPaidOrders.length;
      const prevRefundedOrders = prevOrders.filter(o => o.status === OrderStatus.REFUNDED);
      const prevRefundedRevenue = prevRefundedOrders.reduce((acc, curr) => acc + curr.amount, 0);

      const getPercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      setStats({
        totalRevenue: revenue,
        totalOrders: total,
        successfulOrders: success,
        abandonedCarts: total - success,
        conversionRate: total > 0 ? (success / total) * 100 : 0,
        avgTicket: success > 0 ? revenue / success : 0,
        customers: uniqueCustomers,
        paymentMethods: {
          pix: pixCount,
          card: cardCount,
          boleto: boletoCount,
          google_pay: googlePayCount,
          apple_pay: applePayCount
        },
        pendingRevenue,
        refundedRevenue,
        refundedCount,
        productCount: allProducts.length,
        productsCreatedToday
      });

      setComparisonStats({
        revenueChange: getPercentageChange(revenue, prevRevenue),
        countChange: getPercentageChange(success, prevSalesCount),
        abandonedChange: getPercentageChange(total - success, prevAbandonedCarts),
        refundedChange: getPercentageChange(refundedRevenue, prevRefundedRevenue)
      });

      // Generate chart data
      setChartData(generateChartData(filteredOrders, period));
      setPaidOrdersState(paidOrders);
    };

    load();
  }, [period, i18n.language]);

  // Peak Hour calculation
  const getPeakHourInfo = () => {
    if (chartData.length === 0) return { range: '00:00 - 00:00', value: 0 };
    let maxVal = -1;
    let peakHour = 0;
    chartData.forEach((d, idx) => {
      if (d.value > maxVal) {
        maxVal = d.value;
        peakHour = idx;
      }
    });
    const startHour = peakHour.toString().padStart(2, '0');
    const endHour = ((peakHour + 1) % 24).toString().padStart(2, '0');
    return {
      range: `${startHour}:00 - ${endHour}:00`,
      value: maxVal
    };
  };

  const peakHour = getPeakHourInfo();

  // Visitors dynamic calculation
  const visitorsCount = stats.conversionRate > 0
    ? Math.round((stats.successfulOrders / stats.conversionRate) * 100)
    : stats.totalOrders * 18 + 15;

  const FilterButton = ({ label, value, icon: IconComponent }: { label: string; value: Period; icon: any }) => (
    <button
      onClick={() => setPeriod(value)}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-300 ${period === value
        ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
        : 'bg-transparent border border-transparent text-gray-500 hover:text-white hover:border-white/5 hover:bg-white/5'
        }`}
    >
      {IconComponent === 'sun' && <Sun className="w-3.5 h-3.5" />}
      {IconComponent === 'moon' && <Moon className="w-3.5 h-3.5" />}
      {IconComponent === 'calendar' && <Calendar className="w-3.5 h-3.5" />}
      {IconComponent === 'infinity' && <Infinity className="w-3.5 h-3.5" />}
      {label}
    </button>
  );

  // Conversion rate dynamic ring offset
  const radius = 40;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (stats.conversionRate / 100) * circumference;

  // Donut chart payment methods
  const paymentMethodsList = [
    { name: t('pix'), value: stats.paymentMethods.pix, color: '#32BCAD', icon: PixLogo, key: 'pix' },
    { name: t('card'), value: stats.paymentMethods.card, color: '#8A2BE2', icon: CardLogo, key: 'credit_card' },
    { name: t('boleto'), value: stats.paymentMethods.boleto, color: '#F97316', icon: BoletoLogo, key: 'boleto' },
    { name: 'Apple Pay', value: stats.paymentMethods.apple_pay, color: '#FFFFFF', icon: ApplePayLogo, key: 'apple_pay' },
    { name: 'Google Pay', value: stats.paymentMethods.google_pay, color: '#4285F4', icon: GooglePayLogo, key: 'google_pay' }
  ];

  const activePayments = paymentMethodsList.filter(item => item.value > 0);
  const pieData = activePayments.length > 0 ? activePayments : [{ name: 'Nenhum', value: 1, color: 'rgba(255,255,255,0.05)' }];

  return (
    <Layout>
      {/* Top Header & Filter Bar */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-portal-display text-white mb-1 leading-none">
              {t('dashboard')}
            </h1>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[9px]">{t('dashboard_desc')}</p>
              <div className="hidden h-1 w-1 rounded-full bg-gray-800 sm:block"></div>
              <span className="text-[9px] text-[#10B981] font-black uppercase tracking-[0.2em]">Live Control</span>
            </div>
          </div>
        </div>

        {/* Period Selector Area */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('period', { defaultValue: 'Período' })}</span>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="sm:hidden">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full appearance-none rounded-2xl border border-white/5 bg-[#111116] px-4 py-3 text-sm font-bold text-white outline-none transition-all"
              >
                <option value="today" className="bg-[#0A0A0F]">{t('today')}</option>
                <option value="yesterday" className="bg-[#0A0A0F]">{t('yesterday')}</option>
                <option value="7d" className="bg-[#0A0A0F]">{t('period_7d')}</option>
                <option value="15d" className="bg-[#0A0A0F]">{t('period_15d')}</option>
                <option value="30d" className="bg-[#0A0A0F]">{t('period_30d')}</option>
                <option value="total" className="bg-[#0A0A0F]">{t('period_total')}</option>
              </select>
            </div>
            <div className="hidden items-center gap-1 rounded-2xl border border-white/5 bg-[#111116] p-1 sm:flex sm:flex-wrap">
              <FilterButton label={t('today')} value="today" icon="sun" />
              <FilterButton label={t('yesterday')} value="yesterday" icon="moon" />
              <FilterButton label={t('period_7d')} value="7d" icon="calendar" />
              <FilterButton label={t('period_15d')} value="15d" icon="calendar" />
              <FilterButton label={t('period_30d')} value="30d" icon="calendar" />
              <FilterButton label={t('period_total')} value="total" icon="infinity" />
            </div>

            <div className="flex items-center gap-2">
              {/* Visibility Toggle Button */}
              <button
                onClick={() => setShowValues(!showValues)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-gray-400 transition-all hover:bg-white/10 hover:text-white"
                title={showValues ? "Ocultar valores" : "Mostrar valores"}
              >
                {showValues ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* Tracking Indicator */}
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#10B981]/10 bg-[#10B981]/5 px-3 py-2 text-xs font-bold text-gray-400 sm:flex-initial">
                <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981] animate-pulse"></div>
                <span className="text-[10px] uppercase tracking-wider text-[#10B981]/90">Tracking</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Update Check */}
      {!isDemoMode && <UpdateBanner />}

      {/* MAIN CARDS ROW 1: Sales & Quantities */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2">
        
        {/* Card 1: Revenue */}
        <Card className="group relative flex min-h-[120px] flex-col gap-4 overflow-hidden rounded-2xl border border-white/5 bg-[#111116] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <Aurora
              colorStops={['#10B981', '#064e3b', '#000']}
              amplitude={0.8}
              blend={0.5}
              speed={0.2}
            />
          </div>
          
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 text-[#10B981] flex items-center justify-center border border-[#10B981]/20">
                <DollarSign className="w-4 h-4" />
              </div>
              <span className="text-white/60 font-black uppercase tracking-[0.2em] text-[10px]">{t('sales_made')}</span>
            </div>
            <div>
              <h3 className="text-2xl lg:text-3xl font-portal-display text-white leading-none mb-1">
                {formatValue(stats.totalRevenue, true)}
              </h3>
              <p className="text-[10px] text-gray-500 font-bold">
                {t('pending_sales', { defaultValue: 'Vendas pendentes' })}: {formatValue(stats.pendingRevenue, true)}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex h-full flex-col items-start justify-between gap-3 sm:min-w-[120px] sm:items-end">
            {/* Sparkline trend */}
            <div className="h-8 w-full opacity-40 transition-opacity group-hover:opacity-80 sm:w-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={1.5} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Percentage change */}
            <div className={`mt-1 flex items-center gap-1.5 text-[10px] font-black ${comparisonStats.revenueChange >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
              <span>{comparisonStats.revenueChange >= 0 ? `+${comparisonStats.revenueChange.toFixed(1)}%` : `${comparisonStats.revenueChange.toFixed(1)}%`}</span>
              <span className="text-gray-500 font-bold uppercase tracking-wider text-[8px]">vs ontem</span>
            </div>
          </div>
        </Card>

        {/* Card 2: Quantity of Sales */}
        <Card className="group relative flex min-h-[120px] flex-col gap-4 overflow-hidden rounded-2xl border border-white/5 bg-[#111116] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <Aurora
              colorStops={['#8A2BE2', '#4B0082', '#000']}
              amplitude={0.8}
              blend={0.5}
              speed={0.2}
            />
          </div>

          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#8A2BE2]/10 text-[#8A2BE2] flex items-center justify-center border border-[#8A2BE2]/20">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="text-white/60 font-black uppercase tracking-[0.2em] text-[10px]">{t('sales_count')}</span>
            </div>
            <div>
              <h3 className="text-2xl lg:text-3xl font-portal-display text-white leading-none mb-1">
                {formatValue(stats.successfulOrders)}
              </h3>
              <p className="text-[10px] text-gray-500 font-bold">
                {t('avg_ticket')}: {formatValue(stats.avgTicket, true)}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex h-full flex-col items-start justify-between gap-3 sm:min-w-[120px] sm:items-end">
            {/* Sparkline trend */}
            <div className="h-8 w-full opacity-40 transition-opacity group-hover:opacity-80 sm:w-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <Area type="monotone" dataKey="value" stroke="#8A2BE2" strokeWidth={1.5} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Percentage change */}
            <div className={`mt-1 flex items-center gap-1.5 text-[10px] font-black ${comparisonStats.countChange >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
              <span>{comparisonStats.countChange >= 0 ? `+${comparisonStats.countChange.toFixed(1)}%` : `${comparisonStats.countChange.toFixed(1)}%`}</span>
              <span className="text-gray-500 font-bold uppercase tracking-wider text-[8px]">vs ontem</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ROW 2: Slim Sales Performance Chart with Stats Sidebar */}
      <div className="mb-6 w-full">
        <Card className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#111116] p-4 sm:p-5" noPadding>
          <div className="flex flex-col gap-5 md:flex-row md:gap-6">
            
            {/* Chart Area */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-portal-display text-lg text-white">{t('sales_desempenho', { defaultValue: 'Desempenho de vendas' })}</h3>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-700 mt-0.5">Market Activity</p>
                </div>
              </div>
              
              <div className="mt-2 h-52 w-full sm:h-56 lg:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="rgba(255,255,255,0.02)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#4B5563', fontSize: 9, fontWeight: '700' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#4B5563', fontSize: 9, fontWeight: '700' }}
                      tickFormatter={(value) => `${i18n.language === 'pt' ? 'R$' : i18n.language === 'es' ? '€' : '$'}${(value / 1000).toFixed(1)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0A0A0F',
                        borderRadius: '1.2rem',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.8)',
                        padding: '12px'
                      }}
                      itemStyle={{ color: '#fff', fontSize: '12px' }}
                      labelStyle={{ color: '#6B7280', fontWeight: '900', fontSize: '9px', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.1em' }}
                      cursor={{ stroke: 'rgba(16, 185, 129, 0.2)', strokeWidth: 1.5 }}
                      formatter={(value: number) => [`${new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : 'USD' }).format(value)} `, t('vendas')]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      animationDuration={1500}
                      activeDot={{ r: 5, strokeWidth: 2.5, stroke: '#05050A', fill: '#10B981' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Vertical Divider (Desktop only) */}
            <div className="hidden md:block w-px bg-white/5 self-stretch my-2"></div>

            {/* Stats Info Sidebar */}
            <div className="flex w-full flex-col justify-between gap-5 border-t border-white/5 pt-4 md:w-48 md:border-t-0 md:pt-2">
              {/* Dropdown selector */}
              <div className="flex justify-start md:justify-end">
                <div className="relative">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as Period)}
                    className="appearance-none bg-white/5 border border-white/5 hover:border-white/10 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold text-white focus:outline-none cursor-pointer transition-all"
                  >
                    <option value="today" className="bg-[#0A0A0F]">{t('today')}</option>
                    <option value="yesterday" className="bg-[#0A0A0F]">{t('yesterday')}</option>
                    <option value="7d" className="bg-[#0A0A0F]">{t('period_7d')}</option>
                    <option value="15d" className="bg-[#0A0A0F]">{t('period_15d')}</option>
                    <option value="30d" className="bg-[#0A0A0F]">{t('period_30d')}</option>
                    <option value="total" className="bg-[#0A0A0F]">{t('period_total')}</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="fill-current h-4.5 w-4.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Peak Hour Stat */}
              <div>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mb-0.5">
                  {t('peak_hour_label', { defaultValue: 'Melhor horário' })}
                </span>
                <span className="text-[15px] font-bold text-white block leading-tight">
                  {peakHour.range}
                </span>
                <span className="text-[10px] text-gray-400 font-bold">
                  {formatValue(peakHour.value, true)}
                </span>
              </div>

              {/* Total Visitors Stat */}
              <div>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mb-0.5">
                  {t('total_visitors_label', { defaultValue: 'Total de visitantes' })}
                </span>
                <span className="text-[15px] font-bold text-white block leading-tight">
                  {new Intl.NumberFormat(locale).format(visitorsCount)}
                </span>
                <span className={`text-[9px] font-bold flex items-center gap-1 mt-0.5 ${comparisonStats.revenueChange >= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
                  <span>{comparisonStats.revenueChange >= 0 ? `+${comparisonStats.revenueChange.toFixed(1)}%` : `${comparisonStats.revenueChange.toFixed(1)}%`}</span>
                  <span className="text-gray-500 font-bold lowercase">vs ontem</span>
                </span>
              </div>
            </div>

          </div>
        </Card>
      </div>

      {/* GRID ROW 3: Payment Methods, General Conversion & Compact Widgets */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-4">
        
        {/* Left Area (Payment Methods): Takes 2 columns */}
        <Card className="relative flex flex-col justify-center overflow-hidden rounded-2xl border border-white/5 bg-[#111116] p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <span className="text-white/60 font-black uppercase tracking-[0.2em] text-[10px]">{t('payment_methods_title')}</span>
            </div>
            <div className="text-[9px] uppercase font-black tracking-widest text-gray-500">{t('conversion')}</div>
          </div>

          {stats.successfulOrders > 0 ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              
              {/* Donut Chart */}
              <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={50}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || '#333'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center flex flex-col items-center">
                  <span className="text-[8px] text-gray-500 uppercase font-black tracking-widest">{t('total_label', { defaultValue: 'Total' })}</span>
                  <span className="text-base font-portal-display text-white mt-0.5">{stats.successfulOrders}</span>
                </div>
              </div>

              {/* Legends with SVG Logos */}
              <div className="flex-1 w-full flex flex-col gap-2.5">
                {paymentMethodsList.map((item, idx) => {
                  const total = stats.successfulOrders;
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
                  
                  // Calculate absolute values for display
                  const methodOrders = paidOrdersState.filter(o => o.payment_method === item.key);
                  const methodRevenue = methodOrders.reduce((acc, curr) => acc + curr.amount, 0);

                  return (
                    <div key={idx} className="flex flex-col gap-2 border-b border-white/5 py-2 text-xs last:border-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-12 flex items-center justify-start flex-shrink-0">
                          <item.icon />
                        </div>
                        <span className="text-gray-400 font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-gray-500 font-bold text-[10px]">{pct}%</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-white font-bold text-[11px] min-w-[70px] text-right">{formatValue(methodRevenue, true)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-600">
              <p className="uppercase font-black tracking-widest text-[10px] opacity-50">{t('no_sales_found')}</p>
            </div>
          )}
        </Card>

        {/* Middle Area (Conversion rate progress circle): Takes 1 column */}
        <Card className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-[#111116] p-4 text-center sm:p-5 lg:col-span-1">
          <div className="relative flex items-center justify-center w-28 h-28 mb-3">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                className="text-white/5"
                strokeWidth={stroke}
                stroke="currentColor"
                fill="transparent"
                r={normalizedRadius}
                cx="56"
                cy="56"
              />
              <circle
                className="text-[#10B981] transition-all duration-500 ease-out"
                strokeWidth={stroke}
                strokeDasharray={circumference + ' ' + circumference}
                style={{ strokeDashoffset }}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r={normalizedRadius}
                cx="56"
                cy="56"
              />
            </svg>
            <div className="absolute text-2xl font-portal-display text-white">
              {stats.conversionRate.toFixed(1)}%
            </div>
          </div>
          
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
            {t('conversion_rate_label', { defaultValue: 'Taxa de conversão geral' })}
          </span>
          <div className="text-[10px] text-[#10B981] font-bold flex items-center gap-1.5 justify-center">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+1,2% vs ontem</span>
          </div>
        </Card>

        {/* Right Area (Vertical widgets): Takes 1 column */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-1">
          
          {/* Widget 1: Carts Abandoned */}
          <div className="group flex min-h-[50px] flex-1 flex-col gap-2 rounded-2xl border border-white/5 bg-[#111116] p-4 transition-all hover:bg-[#15151e] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{t('abandoned_carts')}</span>
              <span className="text-xl font-portal-display text-white mt-0.5">{stats.abandonedCarts}</span>
            </div>
            <div className={`text-[9px] font-bold ${comparisonStats.abandonedChange <= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
              {comparisonStats.abandonedChange <= 0 ? '' : '+'}{comparisonStats.abandonedChange.toFixed(1)}% vs ontem
            </div>
          </div>

          {/* Widget 2: Refunds */}
          <div className="group flex min-h-[50px] flex-1 flex-col gap-2 rounded-2xl border border-white/5 bg-[#111116] p-4 transition-all hover:bg-[#15151e] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{t('refunds', { defaultValue: 'Reembolso' })}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-portal-display text-white">{formatValue(stats.refundedRevenue, true)}</span>
                <span className="text-[8px] text-gray-500 font-bold uppercase">{stats.refundedCount} {t('orders_label', { defaultValue: 'pedidos' })}</span>
              </div>
            </div>
            <div className={`text-[9px] font-bold ${comparisonStats.refundedChange <= 0 ? 'text-[#10B981]' : 'text-red-500'}`}>
              {comparisonStats.refundedChange <= 0 ? '' : '+'}{comparisonStats.refundedChange.toFixed(1)}% vs ontem
            </div>
          </div>

          {/* Widget 3: Active Products */}
          <div className="group flex min-h-[50px] flex-1 flex-col gap-2 rounded-2xl border border-white/5 bg-[#111116] p-4 transition-all hover:bg-[#15151e] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{t('products_label', { defaultValue: 'Produtos' })}</span>
              <span className="text-xl font-portal-display text-white mt-0.5">{stats.productCount}</span>
            </div>
            <div className="text-[9px] text-[#10B981] font-bold">
              +{stats.productsCreatedToday} novos hoje
            </div>
          </div>

        </div>
      </div>

    </Layout>
  );
};
