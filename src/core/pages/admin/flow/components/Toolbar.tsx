import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, 
  Share2, 
  LayoutGrid, 
  LayoutTemplate,
  Link2, 
  FileText, 
  Play, 
  Radio, 
  Mail, 
  Users, 
  CreditCard, 
  ArrowUpCircle, 
  ArrowDownCircle,
  CheckCircle, 
  StickyNote,
  Globe,
  Smartphone,
  Plus,
  X,
  Zap,
  Percent,
  ShoppingCart,
  Repeat,
  Lock,
  PhoneCall,
  Clock,
  Package,
  ChevronLeft,
  ChevronRight,
  Rocket
} from 'lucide-react';
import { useFunnelStore } from '../store/useFunnelStore';
import { type FunnelNode } from '../types';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NODE_TYPES = [
  { 
    category: 'Rede Social', 
    id: 'social',
    icon: Smartphone,
    color: 'text-[#27CBEF]',
    items: [
      { type: 'instagram', label: 'Instagram', icon: 'https://cdn.simpleicons.org/instagram/E4405F', isLogo: true, color: 'bg-pink-500/10 text-pink-500' },
      { type: 'tiktok', label: 'TikTok', icon: 'https://cdn.simpleicons.org/tiktok/FFFFFF', isLogo: true, color: 'bg-slate-500/10 text-white' },
      { type: 'youtube', label: 'YouTube', icon: 'https://cdn.simpleicons.org/youtube/FF0000', isLogo: true, color: 'bg-red-500/10 text-red-500' },
      { type: 'youtube_short', label: 'YT Shorts', icon: 'https://cdn.simpleicons.org/youtubeshorts/FF0000', isLogo: true, color: 'bg-red-600/10 text-red-600' },
      { type: 'facebook', label: 'Facebook', icon: 'https://cdn.simpleicons.org/facebook/1877F2', isLogo: true, color: 'bg-blue-600/10 text-blue-500' },
      { type: 'kwai', label: 'Kwai', icon: 'https://cdn.simpleicons.org/kuaishou/FF5001', isLogo: true, color: 'bg-orange-500/10 text-orange-500' },
      { type: 'linkedin', label: 'LinkedIn', icon: 'https://cdn.simpleicons.org/linkedin/0A66C2', isLogo: true, color: 'bg-blue-700/10 text-blue-600' },
      { type: 'x', label: 'X (Twitter)', icon: 'https://cdn.simpleicons.org/x/FFFFFF', isLogo: true, color: 'bg-slate-800/10 text-white' },
      { type: 'pinterest', label: 'Pinterest', icon: 'https://cdn.simpleicons.org/pinterest/BD081C', isLogo: true, color: 'bg-red-500/10 text-red-600' },
      { type: 'twitch', label: 'Twitch', icon: 'https://cdn.simpleicons.org/twitch/9146FF', isLogo: true, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'discord', label: 'Discord', icon: 'https://cdn.simpleicons.org/discord/5865F2', isLogo: true, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'threads', label: 'Threads', icon: 'https://cdn.simpleicons.org/threads/FFFFFF', isLogo: true, color: 'bg-slate-900/10 text-white' },
    ]
  },
  { 
    category: 'Página', 
    id: 'page',
    icon: Globe,
    color: 'text-blue-500',
    items: [
      { type: 'landing', label: 'Landing Page', icon: FileText, color: 'bg-blue-500/10 text-blue-500' },
      { type: 'vsl', label: 'Página VSL', icon: Play, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'webinar', label: 'Webinar', icon: Radio, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'bio', label: 'Link Bio', icon: Link2, color: 'bg-green-500/10 text-green-500' },
    ]
  },
  { 
    category: 'Canal', 
    id: 'channel',
    icon: Users,
    color: 'text-emerald-500',
    items: [
      { type: 'whatsapp', label: 'WhatsApp', icon: 'https://cdn.simpleicons.org/whatsapp/25D366', isLogo: true, color: 'bg-emerald-500/10 text-emerald-500' },
      { type: 'telegram', label: 'Telegram', icon: 'https://cdn.simpleicons.org/telegram/26A6E2', isLogo: true, color: 'bg-sky-500/10 text-sky-500' },
      { type: 'email', label: 'Email', icon: Mail, color: 'bg-orange-500/10 text-orange-500' },
      { type: 'grupo', label: 'Grupo', icon: Users, color: 'bg-teal-500/10 text-teal-500' },
    ]
  },
  { 
    category: 'Conversão', 
    id: 'conversion',
    icon: CreditCard,
    color: 'text-amber-500',
    items: [
      { type: 'checkout', label: 'Checkout', icon: CreditCard, color: 'bg-green-500/10 text-green-400' },
      { type: 'orderbump', label: 'Order Bump', icon: Zap, color: 'bg-yellow-500/10 text-yellow-500' },
      { type: 'upsell', label: 'Upsell', icon: ArrowUpCircle, color: 'bg-amber-500/10 text-amber-500' },
      { type: 'downsell', label: 'Downsell', icon: ArrowDownCircle, color: 'bg-orange-500/10 text-orange-500' },
      { type: 'discount', label: 'Desconto', icon: Percent, color: 'bg-rose-500/10 text-rose-500' },
      { type: 'abandonment', label: 'Recuperação', icon: ShoppingCart, color: 'bg-slate-500/10 text-slate-400' },
      { type: 'subscription', label: 'Assinatura', icon: Repeat, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'membership', label: 'Membros', icon: Lock, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'trial', label: 'Teste Grátis', icon: Clock, color: 'bg-sky-500/10 text-sky-400' },
      { type: 'bundle', label: 'Combo/Bundle', icon: Package, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
      { type: 'sales_call', label: 'Call Vendas', icon: PhoneCall, color: 'bg-blue-500/10 text-blue-400' },
      { type: 'thankyou', label: 'Obrigado', icon: CheckCircle, color: 'bg-emerald-500/10 text-emerald-400' },
    ]
  },
];

const QUICK_ADD_ITEMS = [
  { type: 'product', label: 'Produto', icon: Package, color: 'bg-[#27CBEF]/10 text-[#27CBEF]' },
  { type: 'note', label: 'Nota', icon: StickyNote, color: 'bg-amber-500/10 text-amber-500' },
];

export const Toolbar = ({ onAutoLayout, onExportImage, onExportJson, onSave }: { 
  onAutoLayout: () => void; 
  onExportImage: () => void;
  onExportJson: () => void;
  onSave: () => void;
}) => {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { addNode, viewport, activeCategory, setActiveCategory } = useFunnelStore();
  const shelfRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const updateScrollState = () => {
    if (shelfRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = shelfRef.current;
      const progress = (scrollLeft / (scrollWidth - clientWidth)) * 100;
      setScrollProgress(isNaN(progress) ? 0 : progress);
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const shelf = shelfRef.current;
    if (shelf && activeCategory) {
      shelf.addEventListener('scroll', updateScrollState);
      // Initial check
      setTimeout(updateScrollState, 100);
      return () => shelf.removeEventListener('scroll', updateScrollState);
    }
  }, [activeCategory]);

  const scroll = (direction: 'left' | 'right') => {
    if (shelfRef.current) {
      // Card width (w-36 = 144px) + Gap (gap-8 = 32px) = 176px
      const scrollAmount = 176 * 2; 
      shelfRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (shelfRef.current) {
      if (e.deltaY !== 0) {
        shelfRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const handleAddNode = (item: any, category: string) => {
    const id = `${item.type}-${Date.now()}`;
    const categoryToSet = item.type === 'product' ? t('flow.toolbar.categories.product') : (item.type === 'note' ? t('flow.toolbar.categories.note') : category);
    const newNode: FunnelNode = {
      id,
      type: 'funnelNode',
      position: { 
        x: -viewport.x / viewport.zoom + 100, 
        y: -viewport.y / viewport.zoom + 100 
      },
      data: {
        label: item.label,
        type: item.type,
        icon: item.isLogo ? item.icon : item.type,
        color: item.color,
        category: categoryToSet,
        notes: '',
        status: 'ativo',
        productType: item.type === 'product' ? 'principal' : undefined,
        isNote: item.type === 'note',
      },
    };
    addNode(newNode);
    setActiveCategory(null); // Close shelf after adding
  };

  const categoryLabels: Record<string, string> = {
    social: t('flow.toolbar.categories.social'),
    page: t('flow.toolbar.categories.page'),
    channel: t('flow.toolbar.categories.channel'),
    conversion: t('flow.toolbar.categories.conversion'),
  };

  const itemLabels: Record<string, string> = {
    vsl: t('flow.toolbar.items.vsl_page'),
    discount: t('flow.toolbar.items.discount'),
    abandonment: t('flow.toolbar.items.recovery'),
    subscription: t('flow.toolbar.items.subscription'),
    membership: t('flow.toolbar.items.members'),
    trial: t('flow.toolbar.items.free_trial'),
    sales_call: t('flow.toolbar.items.sales_call'),
    thankyou: t('flow.toolbar.items.thank_you'),
    product: t('flow.toolbar.items.product'),
    note: t('flow.toolbar.items.note'),
    grupo: t('flow.toolbar.items.group'),
  };

  const localizeItem = (item: any) => ({ ...item, label: itemLabels[item.type] || item.label });

  const activeGroup = activeCategory === 'quick-add' 
    ? { category: t('flow.toolbar.quick_add'), icon: Plus, color: 'text-white', items: QUICK_ADD_ITEMS.map(localizeItem) }
    : (() => {
      const group = NODE_TYPES.find(g => g.id === activeCategory);
      return group ? { ...group, category: categoryLabels[group.id] || group.category, items: group.items.map(localizeItem) } : undefined;
    })();

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-4xl px-6">
      
      {/* The Shelf (Asset Library) */}
      <AnimatePresence>
        {activeCategory && activeGroup && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-full glass rounded-[32px] p-6 border border-white/10 shadow-2xl mb-2"
          >
            <div className="flex items-center justify-between mb-6 px-2">
              <div className="flex items-center gap-3">
                <activeGroup.icon size={18} className={activeGroup.color} />
                <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">{activeGroup.category}</h3>
              </div>
              <button 
                onClick={() => setActiveCategory(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative flex items-center gap-4">
              {/* Navigation Arrows - Outside */}
              <div className="w-12 shrink-0 flex justify-center">
                <AnimatePresence>
                  {showLeftArrow && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.5, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.5, x: 10 }}
                      onClick={() => scroll('left')}
                      className="w-11 h-11 bg-[#27CBEF]/20 hover:bg-[#27CBEF]/40 border border-[#27CBEF]/30 rounded-full flex items-center justify-center text-[#27CBEF] shadow-[0_0_20px_rgba(39,203,239,0.2)] hover:shadow-[0_0_30px_rgba(39,203,239,0.4)] transition-all active:scale-90"
                    >
                      <ChevronLeft size={22} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div 
                ref={shelfRef}
                onWheel={handleWheel}
                style={{
                  maskImage: 'linear-gradient(to right, transparent, black 64px, black calc(100% - 64px), transparent)',
                  WebkitMaskImage: 'linear-gradient(to right, transparent, black 64px, black calc(100% - 64px), transparent)'
                }}
                className="flex-1 flex items-center gap-8 overflow-x-auto pt-8 pb-8 no-scrollbar scroll-smooth px-20 snap-x snap-mandatory"
              >
                {activeGroup.items.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleAddNode(item, activeGroup.category)}
                    className="group flex flex-col items-center gap-3 shrink-0 snap-start"
                  >
                    {/* Preview Card */}
                    <div className={cn(
                      "w-36 h-28 glass rounded-[28px] border border-white/10 flex items-center justify-center transition-all duration-500 group-hover:border-[#27CBEF]/50 group-hover:scale-105 group-active:scale-95 shadow-2xl relative overflow-hidden group/card",
                      "after:absolute after:inset-0 after:bg-gradient-to-br after:from-[#27CBEF]/10 after:to-transparent after:opacity-0 group-hover:after:opacity-100 transition-opacity",
                      "ring-1 ring-white/5 group-hover:ring-[#27CBEF]/30"
                    )}>
                      <div className={cn(
                        "w-16 h-16 rounded-[20px] flex items-center justify-center glass shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] border border-white/5 transition-all duration-500 group-hover:scale-110 group-hover:shadow-[#27CBEF]/20", 
                        item.color
                      )}>
                        {item.isLogo ? (
                          <img src={item.icon as string} alt={item.label} className="w-10 h-10 object-contain drop-shadow-lg" referrerPolicy="no-referrer" />
                        ) : (
                          <item.icon size={32} className="drop-shadow-lg" />
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] group-hover:text-[#27CBEF] transition-all duration-300">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="w-12 shrink-0 flex justify-center">
                <AnimatePresence>
                  {showRightArrow && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.5, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.5, x: -10 }}
                      onClick={() => scroll('right')}
                      className="w-11 h-11 bg-[#27CBEF]/20 hover:bg-[#27CBEF]/40 border border-[#27CBEF]/30 rounded-full flex items-center justify-center text-[#27CBEF] shadow-[0_0_20px_rgba(39,203,239,0.2)] hover:shadow-[0_0_30px_rgba(39,203,239,0.4)] transition-all active:scale-90"
                    >
                      <ChevronRight size={22} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
            
            {/* Custom Scrollbar Indicator */}
            <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
              <motion.div 
                className="h-full bg-[#27CBEF] w-1/3 rounded-full"
                animate={{ x: `${scrollProgress * 2}%` }} // Adjusted for 1/3 width
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Dock */}
      <div className="glass rounded-[32px] p-2 flex items-center gap-1 border-white/10 shadow-2xl">
        <div className="flex items-center gap-1 px-2 border-r border-white/5">
          <button
            onClick={() => setActiveCategory(activeCategory === 'quick-add' ? null : 'quick-add')}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-all border border-white/10 group",
              activeCategory === 'quick-add' ? "bg-white/20 text-white border-white/30" : "bg-white/5 text-slate-500 hover:text-white"
            )}
          >
            <Plus size={20} className={cn("transition-transform duration-300", activeCategory === 'quick-add' && "rotate-45")} />
          </button>

          {NODE_TYPES.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveCategory(activeCategory === group.id ? null : group.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-2xl transition-all hover:bg-white/5 group",
                activeCategory === group.id ? "bg-white/10 text-white" : "text-slate-500"
              )}
            >
              <group.icon size={18} className={cn("transition-colors", activeCategory === group.id ? group.color : "group-hover:text-slate-300")} />
              <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">{categoryLabels[group.id] || group.category}</span>
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-1 px-2">
          <button
            onClick={onAutoLayout}
            title={t('flow.toolbar.auto_layout')}
            className="w-10 h-10 flex items-center justify-center glass rounded-xl hover:bg-white/10 text-slate-400 transition-all"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => navigate('/admin/flow')}
            title={t('flow.toolbar.my_funnels')}
            className="w-10 h-10 flex items-center justify-center glass rounded-xl hover:bg-white/10 text-[#27CBEF] transition-all shadow-lg shadow-[#27CBEF]/10"
          >
            <LayoutTemplate size={18} />
          </button>
          <button
            onClick={onSave}
            title={t('flow.toolbar.save')}
            className="w-10 h-10 flex items-center justify-center bg-[#27CBEF] text-black rounded-xl hover:bg-[#27CBEF]/80 transition-all shadow-lg shadow-[#27CBEF]/20"
          >
            <Save size={18} />
          </button>
        </div>

        <div className="h-8 w-px bg-white/5 mx-1" />

        <div className="flex items-center gap-1 pr-2">
          <button
            onClick={onExportImage}
            title={t('flow.toolbar.export_png')}
            className="w-10 h-10 flex items-center justify-center glass rounded-xl hover:bg-white/10 text-[#27CBEF] transition-all shadow-lg shadow-[#27CBEF]/10 group"
          >
            <Rocket size={18} className="group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={onExportJson}
            title={t('flow.toolbar.export_json')}
            className="w-10 h-10 flex items-center justify-center glass rounded-xl hover:bg-white/10 text-slate-400 transition-all"
          >
            <Share2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
