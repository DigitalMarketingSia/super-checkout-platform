import React from 'react';
import { Product } from '../../types';
import { X, ShoppingBag, Check } from 'lucide-react';

interface ProductSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
}

export const ProductSalesModal: React.FC<ProductSalesModalProps> = ({ isOpen, onClose, product }) => {
    if (!isOpen || !product) return null;

    const handleBuy = async () => {
        // Get current user to pass to checkout (cross-domain support)
        const { paymentService } = await import('../../services/paymentService'); // Just to ensure services are loaded if needed, but we use storage
        const { storage } = await import('../../services/storageService');
        const user = await storage.getUser();

        const appendUserParam = (url: string) => {
            if (!user) return url;
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}u=${user.id}`;
        };

        if (product.redirect_link) {
            window.open(appendUserParam(product.redirect_link), '_blank');
        } else if (product.checkout_url) {
            window.open(appendUserParam(product.checkout_url), '_blank');
        } else if (product.checkout_slug) {
            // Fallback to relative URL
            const checkoutUrl = `/c/${product.checkout_slug}`;
            window.open(appendUserParam(checkoutUrl), '_blank');
        } else {
            alert('Não há link de compra configurado para este produto. Contate o administrador.');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-[95%] md:w-full max-w-2xl bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                {/* Purple glow effects */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-white/10 text-white transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2">
                    {/* Image Section */}
                    <div className="relative h-48 md:h-auto bg-black/40">
                        {product.imageUrl ? (
                            <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                                <ShoppingBag className="w-16 h-16 opacity-20" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1D21] via-transparent to-transparent md:bg-gradient-to-r" />
                    </div>

                    {/* Content Section */}
                    <div className="p-6 md:p-8 flex flex-col">
                        <div className="mb-6">
                            <span className="inline-block px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-bold mb-3 border border-red-500/20">
                                OFERTA ESPECIAL
                            </span>
                            <h2 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight line-clamp-1 md:line-clamp-none">
                                {product.name}
                            </h2>
                            <p className="text-gray-400 text-sm leading-relaxed line-clamp-1 md:line-clamp-4">
                                {product.description || 'Aproveite esta oportunidade exclusiva para adquirir este produto e desbloquear todo o seu potencial.'}
                            </p>
                        </div>

                        <div className="mt-auto space-y-6">
                            {/* Price */}
                            <div>
                                {product.price_fake && product.price_fake > 0 && (
                                    <div className="text-gray-500 text-sm line-through mb-1">
                                        de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price_fake)}
                                    </div>
                                )}
                                <div className="flex items-baseline gap-2">
                                    <span className="text-sm text-gray-400">por apenas</span>
                                    <span className="text-3xl font-bold text-white">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price_real || 0)}
                                    </span>
                                </div>
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={handleBuy}
                                className="w-full py-4 bg-[#D4143C] hover:bg-[#b00e30] text-white font-bold rounded-xl shadow-lg shadow-red-900/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <ShoppingBag className="w-5 h-5" />
                                COMPRAR AGORA
                            </button>

                            <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-500" /> Pagamento Seguro</span>
                                <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-500" /> Acesso Imediato</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
