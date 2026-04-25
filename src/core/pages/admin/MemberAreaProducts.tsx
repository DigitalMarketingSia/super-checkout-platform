import React, { useState, useEffect } from 'react';
import { storage } from '../../services/storageService';
import { Product, Content, MemberArea } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Package, Plus, Check, X, AlertCircle, Link as LinkIcon, Activity, ExternalLink, Zap, Box, Database, Lock, RefreshCw, Layers, Trash2 } from 'lucide-react';
import { AlertModal } from '../../components/ui/Modal';
import { useTranslation } from 'react-i18next';

interface MemberAreaProductsProps {
    area: MemberArea;
}

export const MemberAreaProducts: React.FC<MemberAreaProductsProps> = ({ area }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [products, setProducts] = useState<Product[]>([]);
    const [contents, setContents] = useState<Content[]>([]);
    const [productLinks, setProductLinks] = useState<Record<string, string[]>>({}); // productId -> contentIds[]
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false, title: '', message: '', variant: 'info'
    });

    const primaryColor = area.primary_color || '#8A2BE2';

    useEffect(() => {
        loadData();
    }, [area.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const allProducts = await storage.getProducts();
            setProducts(allProducts);

            const areaContents = await storage.getContents(area.id);
            setContents(areaContents);

            const links: Record<string, string[]> = {};
            await Promise.all(allProducts.map(async (p) => {
                const contentIds = await storage.getProductContents(p.id);
                const areaContentIds = contentIds.filter(id => areaContents.some(c => c.id === id));
                links[p.id] = areaContentIds;
            }));
            setProductLinks(links);

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLinkAll = async (product: Product) => {
        setProcessingId(product.id);
        try {
            const allContentIds = contents.map(c => c.id);
            await storage.setProductContents(product.id, allContentIds);

            setProductLinks(prev => ({
                ...prev,
                [product.id]: allContentIds
            }));

            setAlertState({
                isOpen: true,
                title: t('common.success', 'Sucesso'),
                message: t('member_area_details.product_linked', 'Produto "{{name}}" agora dá acesso a TODOS os conteúdos desta área.', { name: product.name }),
                variant: 'success'
            });
        } catch (error) {
            console.error('Error linking product:', error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleUnlinkAll = async (product: Product) => {
        setProcessingId(product.id);
        try {
            const currentContentIds = await storage.getProductContents(product.id);
            const otherAreaContentIds = currentContentIds.filter(id => !contents.some(c => c.id === id));

            await storage.setProductContents(product.id, otherAreaContentIds);

            setProductLinks(prev => ({
                ...prev,
                [product.id]: []
            }));

            setAlertState({
                isOpen: true,
                title: t('common.success', 'Sucesso'),
                message: t('member_area_details.product_unlinked', 'Acesso removido. O produto "{{name}}" não dá mais acesso a esta área.', { name: product.name }),
                variant: 'success'
            });
        } catch (error) {
            console.error('Error unlinking product:', error);
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <div className="py-32 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest font-mono italic">Scanning Offer Database...</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto">
            {/* Asset Database Header */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl relative overflow-hidden transition-all shadow-2xl"
                style={{ 
                    background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${primaryColor}20 100%)`,
                }}
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                
                <div className="flex items-center gap-5 relative z-10">
                    <div>
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Value <span style={{ color: primaryColor }}>Assets</span></h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                                <Database className="w-3.5 h-3.5" />
                                Pricing Nodes
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2 text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">
                                <Box className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                                {products.length} Linked Offers
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="hidden lg:flex flex-col items-end relative z-10">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] leading-none mb-2">Content Coverage</span>
                    <div className="flex items-center gap-3">
                        <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div 
                                className="h-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                                style={{ 
                                    width: `${contents.length > 0 ? (Object.values(productLinks).flat().length / (products.length * contents.length)) * 100 : 0}%`,
                                    background: primaryColor 
                                }}
                            />
                        </div>
                        <span className="text-xs font-mono text-white/60">ACTIVE</span>
                    </div>
                </div>
            </div>

            {products.length === 0 ? (
                <div className="py-32 flex flex-col items-center gap-8 bg-black/20 border border-white/5 border-dashed rounded-[4rem]">
                    <div className="w-24 h-24 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-center flex-col gap-2 relative overflow-hidden group">
                        <Zap className="w-10 h-10 text-white/10 group-hover:text-yellow-500 transition-colors group-hover:scale-120 duration-500" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-sm font-black text-white italic uppercase tracking-[0.2em]">No Assets Detected</p>
                        <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Register new products in the Global Store to link them here</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(product => {
                        const linkedCount = productLinks[product.id]?.length || 0;
                        const totalContents = contents.length;
                        const isLinked = linkedCount > 0;
                        const coveragePercent = totalContents > 0 ? (linkedCount / totalContents) * 100 : 0;

                        return (
                            <div 
                                key={product.id} 
                                className="group relative bg-black/40 rounded-[2.5rem] border border-white/5 p-6 backdrop-blur-xl transition-all hover:bg-white/[0.04] hover:border-white/10 shadow-2xl overflow-hidden"
                            >
                                {/* Active Link Background Glow */}
                                {isLinked && (
                                    <div 
                                        className="absolute inset-0 opacity-[0.03] pointer-events-none transition-opacity group-hover:opacity-[0.05]" 
                                        style={{ background: `radial-gradient(circle at center, ${primaryColor}, transparent)` }}
                                    />
                                )}

                                <div className="flex items-center gap-6 mb-8 relative z-10">
                                    <div className="relative shrink-0">
                                        <div className="w-20 h-20 rounded-3xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shadow-inner group-hover:scale-110 transition-transform duration-700">
                                            {product.imageUrl ? (
                                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                            ) : (
                                                <Package className="w-8 h-8 text-white/10 group-hover:text-white/40 transition-colors" />
                                            )}
                                        </div>
                                        {isLinked && (
                                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center border-4 border-[#0F0F1A] shadow-[0_0_15px_rgba(34,197,94,0.4)] animate-in zoom-in">
                                                <Check className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-black text-white uppercase italic tracking-tighter truncate leading-none mb-2">
                                            {product.name}
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                                isLinked 
                                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                                : 'bg-white/5 text-white/20 border-white/5'
                                            }`}>
                                                {isLinked ? 'Neural Synced' : 'Link Offline'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 relative z-10">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Registry Coverage</span>
                                            <span className="text-[10px] font-mono text-white/40">{linkedCount}/{totalContents}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <div 
                                                className="h-full transition-all duration-700 shadow-[0_0_8px_rgba(168,85,247,0.3)]"
                                                style={{ width: `${coveragePercent}%`, background: isLinked ? primaryColor : '#333' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        {isLinked ? (
                                            <button
                                                onClick={() => handleUnlinkAll(product)}
                                                disabled={processingId === product.id}
                                                className="flex-1 px-4 py-4 bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-500 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all group/btn"
                                            >
                                                {processingId === product.id ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Trash2 className="w-4 h-4" />
                                                        <span>Revoke Access</span>
                                                    </div>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleLinkAll(product)}
                                                disabled={processingId === product.id}
                                                className="flex-1 px-4 py-4 bg-white/5 hover:bg-white/10 text-white hover:text-white rounded-2xl border border-white/5 hover:border-primary/20 transition-all group/btn"
                                            >
                                                {processingId === product.id ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Zap className="w-4 h-4 group-hover/btn:text-yellow-500 transition-colors" />
                                                        <span className="font-black uppercase italic tracking-widest">Sync All Assets</span>
                                                    </div>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AlertModal
                isOpen={alertState.isOpen}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
                title={alertState.title}
                message={alertState.message}
                variant={alertState.variant}
            />
        </div>
    );
};
