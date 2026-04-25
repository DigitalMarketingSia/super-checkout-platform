import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Order, OrderStatus, Product } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  Search, Filter, MessageCircle, ShoppingBag,
  DollarSign, Users, Download, ArrowDownRight, Package, X,
  Calendar, CreditCard, ChevronRight, QrCode, Barcode, TrendingUp,
  Zap, Box, Database, Layers, Activity
} from 'lucide-react';
import { OrderDetailsModal } from '../../components/admin/orders/OrderDetailsModal';
import { CustomerDetailsModal } from '../../components/admin/orders/CustomerDetailsModal';
import { useTranslation } from 'react-i18next';
import Aurora from '../../components/ui/Aurora';

interface CustomerProfile {
  email: string;
  name: string;
  phone?: string;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: string;
  products: string[];
}

export const Orders = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [activeTab, setActiveTab] = useState<'orders' | 'customers'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8; // Adjust for card layout

  // Filters State
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    method: 'all',
    productId: 'all',
  });

  const [messageTemplate, setMessageTemplate] = useState(() =>
    t('orders.whatsapp_modal.default_template', 'Olá {{nome}}, vi que você adquiriu o produto {{produto}}. Precisa de ajuda em algo?')
  );
  const [isMsgModalOpen, setIsMsgModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const allOrders = await storage.getOrders();
    const allProducts = await storage.getProducts();
    setProducts(allProducts);

    const sortedOrders = allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setOrders(sortedOrders);

    // Process Customers
    const customerMap = new Map<string, CustomerProfile>();
    sortedOrders.forEach(order => {
      const email = order.customer_email;
      if (!email) return;

      const existing = customerMap.get(email);
      const productName = order.items?.[0]?.name || t('orders.table.product_undefined');

      if (existing) {
        existing.totalSpent += order.amount;
        existing.orderCount += 1;
        if (!existing.products.includes(productName)) existing.products.push(productName);
      } else {
        customerMap.set(email, {
          email,
          name: order.customer_name,
          phone: order.customer_phone,
          totalSpent: order.amount,
          orderCount: 1,
          lastOrderDate: order.created_at,
          products: [productName]
        });
      }
    });
    setCustomers(Array.from(customerMap.values()));
  };

  // Helpers
  const formatCurrency = (val: number) => new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : 'USD' }).format(val);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: OrderStatus) => {
    const map = {
      [OrderStatus.PAID]: { label: t('orders.status.paid'), cls: 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' },
      [OrderStatus.PENDING]: { label: t('orders.status.pending'), cls: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]' },
      [OrderStatus.FAILED]: { label: t('orders.status.failed'), cls: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' },
      [OrderStatus.CANCELED]: { label: t('orders.status.canceled'), cls: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
      [OrderStatus.REFUNDED]: { label: t('orders.status.refunded'), cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    };
    const s = map[status] || map[OrderStatus.PENDING];
    return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${s.cls}`}>{s.label}</span>;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'pix': return <QrCode className="w-3.5 h-3.5 text-emerald-400" />;
      case 'credit_card': return <CreditCard className="w-3.5 h-3.5 text-primary" />;
      case 'boleto': return <Barcode className="w-3.5 h-3.5 text-orange-400" />;
      default: return <DollarSign className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  // Filter Logic
  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.customer_name.toLowerCase().includes(filters.search.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(filters.search.toLowerCase()) ||
      order.id.includes(filters.search);

    const matchesStatus = filters.status === 'all' || order.status === filters.status;
    const matchesMethod = filters.method === 'all' || order.payment_method === filters.method;

    // Check if ANY item in the order matches the selected product ID
    const matchesProduct = filters.productId === 'all' ||
      (order.items && order.items.some(i => i.name === products.find(p => p.id === filters.productId)?.name));

    return matchesSearch && matchesStatus && matchesMethod && matchesProduct;
  });

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      c.email.toLowerCase().includes(filters.search.toLowerCase());

    const selectedProductName = filters.productId !== 'all' ? products.find(p => p.id === filters.productId)?.name : null;
    const matchesProduct = !selectedProductName || c.products.includes(selectedProductName);

    return matchesSearch && matchesProduct;
  });

  // Pagination Logic
  const totalPages = activeTab === 'orders'
    ? Math.ceil(filteredOrders.length / itemsPerPage)
    : Math.ceil(filteredCustomers.length / itemsPerPage);

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when switching tabs or changing filters
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filters.search, filters.status, filters.method, filters.productId]);

  // Dynamic Metrics
  const revenueData = filters.productId !== 'all' ? filteredOrders : orders.filter(o => o.status === OrderStatus.PAID);
  const totalRevenue = revenueData.reduce((acc, curr) => acc + (curr.status === OrderStatus.PAID ? curr.amount : 0), 0);
  const salesCount = filteredOrders.length;
  const customersCount = activeTab === 'customers' ? filteredCustomers.length : new Set(filteredOrders.map(o => o.customer_email)).size;

  const handleExportCustomers = () => {
    const csvContent = [
      [t('orders.table.name'), t('orders.table.contact'), 'Telefone', t('orders.table.total_spent'), t('orders.table.orders_count'), t('orders.table.acquired_products')].join(','),
      ...filteredCustomers.map(c => [
        `"${c.name}"`,
        c.email,
        c.phone || '',
        c.totalSpent.toFixed(2),
        c.orderCount,
        `"${c.products.join('; ')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'clientes_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const TabButton = ({ label, value, icon: Icon }: { label: string; value: 'orders' | 'customers'; icon: any }) => (
    <button
      onClick={() => setActiveTab(value)}
      className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 ${activeTab === value
        ? 'bg-primary text-white shadow-[0_0_20px_rgba(138,43,226,0.4)] border border-white/20'
        : 'text-gray-500 hover:text-white'
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <Layout>
      {/* Tactical Header Architecture */}
      <div 
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12 p-8 rounded-[2.5rem] border-2 border-dashed border-white/20 backdrop-blur-3xl relative overflow-hidden transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        style={{ 
          background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(138,43,226,0.1) 100%)',
        }}
      >
        {/* Background Decor */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
        
        <div className="flex flex-col gap-6 relative z-10">
          <div>
            <h1 className="text-3xl xl:text-5xl font-black text-white italic uppercase tracking-tighter leading-none mb-4">
              {activeTab === 'orders' ? 'Transaction' : 'Customer'} <span className="text-primary">Registry</span>
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                <Activity className="w-3.5 h-3.5" />
                Real-time Monitor
              </div>
              <div className="w-1 h-1 rounded-full bg-white/20" />
              <div className="flex items-center gap-2 text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">
                <Database className="w-3.5 h-3.5 text-primary" />
                {activeTab === 'orders' ? `${orders.length} Logged Entries` : `${customers.length} User Profiles`}
              </div>
            </div>
          </div>

          {/* Quick Metrics Integrated */}
          <div className="flex flex-row flex-nowrap overflow-x-auto gap-3 mt-4 pb-2 md:pb-0 scrollbar-hide">
            <div className="bg-black/40 px-4 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-emerald-500/30 transition-all shrink-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 mb-0.5 whitespace-nowrap">Total Revenue</p>
                <p className="text-lg font-portal-display text-white whitespace-nowrap">{formatCurrency(totalRevenue)}</p>
              </div>
            </div>
            <div className="bg-black/40 px-4 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-blue-500/30 transition-all shrink-0">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-blue-500/60 mb-0.5 whitespace-nowrap">Total Sales</p>
                <p className="text-lg font-portal-display text-white whitespace-nowrap">{salesCount}</p>
              </div>
            </div>
            <div className="bg-black/40 px-4 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-primary/30 transition-all shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-primary/60 mb-0.5 whitespace-nowrap">Unique Leads</p>
                <p className="text-lg font-portal-display text-white whitespace-nowrap">{customersCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Controls & Actions */}
        <div className="flex flex-col items-end gap-6 relative z-10 shrink-0">
          <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-2xl">
            <TabButton label="Log" value="orders" icon={ShoppingBag} />
            <TabButton label="Users" value="customers" icon={Users} />
            
            <div className="h-8 w-px bg-white/10 mx-2"></div>

            <div className="flex items-center gap-1">
              {activeTab === 'customers' && (
                <button 
                  onClick={handleExportCustomers} 
                  title={t('orders.export_btn')} 
                  className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => setIsMsgModalOpen(true)} 
                title={t('orders.whatsapp_btn')} 
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mb-2 leading-none">Security Protocol</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">Active Scan</span>
            </div>
          </div>
        </div>
      </div>

      {/* SLIM FILTER OVERLAY */}
      <div className="mb-0 flex flex-col lg:flex-row gap-4 items-center justify-between bg-black/40 p-4 rounded-t-[2.5rem] border-x border-t border-white/5 backdrop-blur-xl">
         <div className="w-full lg:w-96 relative group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder={activeTab === 'orders' ? "SCAN ORDERS..." : "SCAN CUSTOMERS..."}
              className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-all font-black italic tracking-tighter placeholder:text-white/5"
              value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })}
            />
         </div>

         <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64 group/s">
               <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within/s:text-primary transition-colors" />
               <select
                 className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-10 py-4 text-xs text-white/60 focus:outline-none focus:border-primary/50 appearance-none cursor-pointer font-black uppercase tracking-widest"
                 value={filters.productId} onChange={e => setFilters({ ...filters, productId: e.target.value })}
               >
                 <option value="all" className="bg-[#0F0F15]">ALL NODES</option>
                 {products.map(p => (
                   <option key={p.id} value={p.id} className="bg-[#0F0F15]">{p.name.toUpperCase()}</option>
                 ))}
               </select>
               <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 rotate-90 pointer-events-none group-hover/s:text-white/40 transition-colors" />
            </div>

            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`w-14 h-14 rounded-2xl border transition-all flex items-center justify-center ${showFilters ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-black/40 border-white/5 text-white/20 hover:text-white hover:border-white/10'}`}
            >
              <Filter className="w-5 h-5" />
            </button>
         </div>
      </div>

      {/* Extended Filters Drawer */}
      {showFilters && (
        <div className="p-8 bg-black/60 border-x border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 relative overflow-hidden group/drawer">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Layers className="w-24 h-24 text-primary" />
          </div>
          
          <div className="relative z-10">
            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mb-4 block ml-1 italic">// Registry Status</label>
            <div className="flex flex-wrap gap-2">
               {['all', OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.FAILED, OrderStatus.REFUNDED].map(s => (
                 <button
                   key={s}
                   onClick={() => setFilters({ ...filters, status: s })}
                   className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${filters.status === s ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white/5 text-white/20 border-white/5 hover:border-white/10'}`}
                 >
                   {s === 'all' ? "ALL_SYSTEMS" : s}
                 </button>
               ))}
            </div>
          </div>
          <div className="relative z-10">
            <label className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] mb-4 block ml-1 italic">// Protocol Method</label>
            <div className="flex flex-wrap gap-2">
               {['all', 'credit_card', 'pix', 'boleto'].map(m => (
                 <button
                   key={m}
                   onClick={() => setFilters({ ...filters, method: m })}
                   className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${filters.method === m ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 text-white/20 border-white/5 hover:border-white/10'}`}
                 >
                   {m === 'all' ? "ALL_PROTOCOLS" : m.toUpperCase()}
                 </button>
               ))}
            </div>
          </div>
        </div>
      )}      {/* Main Content Area: PREMIUM GLASS TABLE */}
      <div className="bg-black/40 border-x border-b border-white/5 rounded-b-[2.5rem] backdrop-blur-3xl overflow-hidden min-h-[400px]">
        {activeTab === 'orders' ? (
          <div className="flex flex-col">
            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-40 text-white/5">
                <ShoppingBag className="w-16 h-16 mb-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] italic">No transaction records detected</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {paginatedOrders.map(order => (
                  <div 
                    key={order.id} 
                    onClick={() => setSelectedOrder(order)}
                    className="group relative hover:bg-white/[0.02] flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-6 px-8 py-6 transition-all cursor-pointer overflow-hidden"
                  >
                    {/* Hover Glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-r from-primary/[0.03] via-transparent to-transparent"></div>
 
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:flex-1 gap-6 lg:gap-6">
                      {/* ID Nodes */}
                      <div className="flex items-center gap-4 lg:w-32 shrink-0">
                        <div 
                          className="w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center text-white font-mono text-[10px] font-black group-hover:scale-110 group-hover:border-primary/50 transition-all shadow-[0_5px_15px_rgba(0,0,0,0.3)] relative overflow-hidden"
                          style={{ 
                            background: 'linear-gradient(135deg, rgba(138,43,226,0.6) 0%, rgba(65,88,208,0.4) 100%)',
                          }}
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="relative z-10 drop-shadow-md">
                             #{order.id.slice(0, 4)}
                          </span>
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10 group-hover:text-white/20 mb-0.5 italic">Protocol</p>
                          <p className="text-xs font-mono font-bold text-white/40">{formatDate(order.created_at).split(',')[0]}</p>
                        </div>
                      </div>
 
                      {/* Entity Info */}
                      <div className="lg:w-52 shrink-0">
                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10 group-hover:text-white/20 mb-0.5 italic">Identity</p>
                        <p className="text-sm font-black text-white group-hover:text-primary transition-colors truncate uppercase tracking-tighter italic">{order.customer_name}</p>
                        <p className="text-[10px] font-mono text-white/20 group-hover:text-white/40 truncate">{order.customer_email}</p>
                      </div>
 
                      {/* Mapping Info */}
                      <div className="flex-1 min-w-0">
                         <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10 group-hover:text-white/20 mb-0.5 italic">Asset Node</p>
                         <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse ml-0.5" />
                             <span className="text-[10px] font-black text-white/40 group-hover:text-white/60 uppercase tracking-widest truncate max-w-[200px]">
                                {order.items?.[0]?.name || "UNKNOWN_ASSET"}
                             </span>
                         </div>
                      </div>
 
                      {/* Value Nodes */}
                      <div className="lg:w-32 shrink-0">
                         <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/10 group-hover:text-white/20 mb-0.5 italic">Integrity</p>
                         <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-black/40 border border-white/5 group-hover:border-primary/20 transition-colors">
                               {getMethodIcon(order.payment_method)}
                            </div>
                            <span className="text-lg font-portal-display text-white group-hover:scale-110 transition-transform origin-left">{formatCurrency(order.amount)}</span>
                         </div>
                      </div>
 
                      {/* Status Protocol */}
                      <div className="lg:w-40 flex items-center justify-between lg:justify-end gap-5 shrink-0">
                         {getStatusBadge(order.status)}
                         <div className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center text-white/10 group-hover:text-primary group-hover:bg-primary/10 group-hover:border-primary/20 transition-all active:scale-90">
                           <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* CUSTOMERS VIEW : SLIM GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-x divide-y divide-white/[0.03]">
            {paginatedCustomers.map((customer, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCustomer(customer)}
                className="group relative bg-transparent hover:bg-white/[0.02] p-8 transition-all duration-500 cursor-pointer overflow-hidden border-white/[0.03]"
              >
                {/* Glow Background */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-14 h-14 rounded-2xl border border-white/10 flex items-center justify-center text-xl font-portal-display text-white group-hover:scale-110 group-hover:border-primary/50 transition-all duration-700 shadow-[0_10px_30px_rgba(0,0,0,0.5)] relative overflow-hidden"
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(138,43,226,0.8) 0%, rgba(65,88,208,0.6) 100%)',
                      }}
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative z-10 drop-shadow-lg">
                        {customer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white group-hover:text-primary transition-colors uppercase tracking-tighter italic leading-none mb-1">{customer.name}</h4>
                      <p className="text-[9px] font-mono text-white/20 lowercase tracking-widest truncate max-w-[140px]">{customer.email}</p>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/10 group-hover:text-primary transition-all">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6 relative z-10">
                   <div className="bg-black/40 p-4 rounded-xl border border-white/5 group-hover:border-emerald-500/20 transition-all">
                      <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/10 mb-1.5 italic">Total LTV</p>
                      <p className="text-lg font-portal-display text-emerald-400 group-hover:scale-105 transition-transform origin-left">{formatCurrency(customer.totalSpent)}</p>
                   </div>
                   <div className="bg-black/40 p-4 rounded-xl border border-white/5 group-hover:border-primary/20 transition-all">
                      <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/10 mb-1.5 italic">Activity</p>
                      <p className="text-lg font-portal-display text-white">{customer.orderCount} <span className="text-[10px] text-white/20 font-sans">TX</span></p>
                   </div>
                </div>

                <div className="space-y-3 relative z-10">
                   <div className="flex flex-wrap gap-2">
                      {customer.products.slice(0, 2).map((p, idx) => (
                        <span key={idx} className="bg-white/[0.03] text-white/40 text-[7px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-white/5 group-hover:border-primary/20 transition-all">
                           {p.length > 20 ? p.slice(0, 18) + '...' : p}
                        </span>
                      ))}
                      {customer.products.length > 2 && (
                        <div className="h-6 px-2 flex items-center bg-black/40 border border-dashed border-white/10 rounded-lg text-[7px] font-black text-white/20 uppercase">
                          +{customer.products.length - 2} NODES
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-12 flex flex-col items-center gap-6">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-4 rounded-2xl border border-white/5 bg-black/40 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>

            <div className="flex items-center gap-2">
              {(() => {
                const range = [];
                const maxVisible = 5;

                if (totalPages <= maxVisible) {
                  for (let i = 1; i <= totalPages; i++) range.push(i);
                } else {
                  let start = Math.max(1, currentPage - 1);
                  let end = Math.min(totalPages, currentPage + 1);

                  if (currentPage <= 3) end = Math.min(totalPages, 4);
                  if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 3);

                  if (start > 1) {
                    range.push(1);
                    if (start > 2) range.push('...');
                  }

                  for (let i = start; i <= end; i++) range.push(i);

                  if (end < totalPages) {
                    if (end < totalPages - 1) range.push('...');
                    range.push(totalPages);
                  }
                }

                return range.map((page, idx) => (
                  page === '...' ? (
                    <span key={`dots-${idx}`} className="px-2 text-gray-700 font-black">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page as number)}
                      className={`w-12 h-12 rounded-2xl text-xs font-black uppercase transition-all border ${currentPage === page
                        ? 'bg-white text-black border-white shadow-xl'
                        : 'bg-black/40 text-gray-500 border-white/5 hover:text-white'
                        }`}
                    >
                      {page}
                    </button>
                  )
                ));
              })()}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-4 rounded-2xl border border-white/5 bg-black/40 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <p className="text-[10px] text-gray-700 font-black uppercase tracking-[0.2em]">
            Page {currentPage} of {totalPages} — {activeTab === 'orders' ? filteredOrders.length : filteredCustomers.length} total entries
          </p>
        </div>
      )}

      {/* Helper Modals */}
      {isMsgModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999]" style={{ zIndex: 9999 }}>
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            onClick={() => setIsMsgModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[#0F0F15] border border-white/5 rounded-[2.5rem] shadow-2xl overflow-hidden p-8">
             <div className="flex justify-between items-center mb-8">
               <h2 className="text-xl font-portal-display text-white uppercase tracking-tight">{t('orders.whatsapp_modal.title')}</h2>
               <button onClick={() => setIsMsgModalOpen(false)} className="text-gray-700 hover:text-white p-2">
                 <X className="w-6 h-6" />
               </button>
             </div>

             <textarea
               className="w-full h-40 bg-black/40 border border-white/5 rounded-2xl p-4 text-white text-sm mb-6 outline-none focus:border-primary/50 resize-none font-medium placeholder:text-gray-800"
               value={messageTemplate}
               onChange={e => setMessageTemplate(e.target.value)}
               placeholder={t('orders.whatsapp_modal.placeholder')}
             />

             <div className="flex justify-end gap-3">
               <Button variant="ghost" onClick={() => setIsMsgModalOpen(false)} className="text-gray-500 hover:text-white font-black uppercase text-xs tracking-widest">{t('common.cancel')}</Button>
               <Button onClick={() => setIsMsgModalOpen(false)} className="px-8 py-3 bg-primary text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-primary/20">{t('orders.whatsapp_modal.save_btn')}</Button>
             </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsModal
          isOpen={true}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {selectedCustomer && (
        <CustomerDetailsModal
          isOpen={true}
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </Layout>
  );
};
