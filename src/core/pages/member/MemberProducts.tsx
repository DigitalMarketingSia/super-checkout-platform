import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { MemberArea, Product, AccessGrant } from '../../types';
import { storage } from '../../services/storageService';
import { ShoppingBag, ExternalLink, Loader2, Lock } from 'lucide-react';
import { ProductSalesModal } from '../../components/member/ProductSalesModal';
import { useAccessControl } from '../../hooks/useAccessControl';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const MemberProducts: React.FC = () => {
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();

    const [products, setProducts] = useState<Product[]>([]);
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const { handleAccess } = useAccessControl(accessGrants);

    useEffect(() => {
        loadProducts();
    }, [memberArea]);

    const loadProducts = async () => {
        try {
            if (memberArea?.id) {
                // Load products and access grants in parallel
                const [productsData, grants] = await Promise.all([
                    storage.getMemberAreaProducts(memberArea.id),
                    storage.getAccessGrants()
                ]);

                setAccessGrants(grants);

                // Filter out products user already owns
                const activeProductIds = grants
                    .filter(g => g.product_id && g.status === 'active')
                    .map(g => g.product_id);

                const availableProducts = productsData.filter(
                    product => !activeProductIds.includes(product.id)
                );

                setProducts(availableProducts);
            }
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProductClick = async (product: Product) => {
        // Use access control to determine action
        handleAccess(product, {
            onAccess: async () => {
                // User has access - navigate to content
                try {
                    const productContents = await storage.getProductContents(product.id);
                    if (productContents.length > 0) {
                        const firstContent = productContents[0];
                        const path = slug
                            ? `/app/${slug}/course/${firstContent.content_id}`
                            : `/course/${firstContent.content_id}`;
                        navigate(path);
                    }
                } catch (error) {
                    console.error('Erro ao navegar:', error);
                }
            },
            onSalesModal: (prod) => {
                // User doesn't have access - show sales modal
                const productToShow = prod || product;

                // Check member_area_action
                if (product.member_area_action === 'sales_page') {
                    setSelectedProduct(productToShow);
                    setIsModalOpen(true);
                } else if (product.redirect_link) {
                    // Redirect to external checkout
                    window.open(product.redirect_link, '_blank');
                } else {
                    // Fallback to modal
                    setSelectedProduct(productToShow);
                    setIsModalOpen(true);
                }
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 md:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Produtos à Venda</h1>
                <p className="text-gray-400">Confira outros produtos disponíveis para você.</p>
            </div>

            {products.length === 0 ? (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                    <ShoppingBag className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Nenhum produto disponível</h3>
                    <p className="text-gray-400">Você já possui acesso a todos os produtos ou não há produtos à venda no momento.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map(product => (
                        <div
                            key={product.id}
                            className="bg-[#1A1D21] rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all hover:transform hover:scale-[1.02] group cursor-pointer"
                            onClick={() => handleProductClick(product)}
                        >
                            <div className="aspect-video relative overflow-hidden bg-black/40">
                                {product.imageUrl ? (
                                    <>
                                        {/* Blurred Background */}
                                        <img
                                            src={product.imageUrl}
                                            alt=""
                                            className="absolute inset-0 w-full h-full object-cover opacity-50 blur-xl scale-110 group-hover:scale-125 transition-transform duration-500"
                                        />
                                        <div className="absolute inset-0 bg-black/20" />

                                        {/* Main Contained Image */}
                                        <img
                                            src={product.imageUrl}
                                            alt={product.name}
                                            className="relative w-full h-full object-contain p-2 z-10 transition-transform duration-500 group-hover:scale-105"
                                        />
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                        <ShoppingBag className="w-12 h-12 opacity-20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20" />

                                {/* Lock indicator */}
                                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full p-2 z-30">
                                    <Lock className="w-4 h-4 text-white" />
                                </div>
                            </div>

                            <div className="p-5">
                                <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{product.name}</h3>
                                <p className="text-sm text-gray-400 mb-4 line-clamp-2 min-h-[2.5rem]">
                                    {product.description || 'Sem descrição.'}
                                </p>

                                <div className="flex items-center justify-between mt-auto">
                                    <div className="text-white font-bold text-lg">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price_real || 0)}
                                    </div>
                                    <button
                                        className="px-4 py-2 bg-white text-black font-bold rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
                                    >
                                        Comprar <ExternalLink className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ProductSalesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                product={selectedProduct}
            />
        </div>
    );
};

