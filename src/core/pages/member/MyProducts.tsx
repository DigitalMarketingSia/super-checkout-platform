import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { MemberArea, Product, AccessGrant } from '../../types';
import { storage } from '../../services/storageService';
import { Package, Loader2, Play } from 'lucide-react';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const MyProducts: React.FC = () => {
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();

    const [ownedProducts, setOwnedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOwnedProducts();
    }, [memberArea]);

    const loadOwnedProducts = async () => {
        try {
            // Get user's access grants
            const grants = await storage.getAccessGrants();
            const productIds = grants
                .filter(g => g.product_id && g.status === 'active')
                .map(g => g.product_id as string);

            if (productIds.length === 0) {
                setOwnedProducts([]);
                setLoading(false);
                return;
            }

            // Get specific products details
            const owned = await storage.getProductsByIds(productIds);
            setOwnedProducts(owned);
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProductClick = async (product: Product) => {
        try {
            // Get contents linked to this product
            const productContents = await storage.getProductContents(product.id);

            if (productContents.length > 0) {
                const firstContentId = productContents[0];
                // Navigate to course player
                const path = slug
                    ? `/app/${slug}/course/${firstContentId}`
                    : `/course/${firstContentId}`;
                navigate(path);
            } else {
                console.warn('Nenhum conteúdo encontrado para o produto:', product.name);
            }
        } catch (error) {
            console.error('Erro ao navegar para conteúdo:', error);
        }
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
                <h1 className="text-3xl font-bold text-white mb-2">Meus Produtos</h1>
                <p className="text-gray-400">Produtos que você já adquiriu e tem acesso.</p>
            </div>

            {ownedProducts.length === 0 ? (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                    <Package className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Nenhum produto adquirido</h3>
                    <p className="text-gray-400 mb-6">Você ainda não possui nenhum produto.</p>
                    <button
                        onClick={() => navigate(slug ? `/app/${slug}/products` : '/products')}
                        className="px-6 py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Ver Produtos à Venda
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {ownedProducts.map(product => (
                        <div
                            key={product.id}
                            className="bg-[#1A1D21] rounded-xl overflow-hidden border border-white/10 hover:border-white/20 transition-all hover:transform hover:scale-[1.02] group cursor-pointer relative"
                            onClick={() => handleProductClick(product)}
                        >
                            {/* Owned Badge */}
                            <div className="absolute top-3 left-3 z-10 bg-orange-500/20 text-orange-500 border border-orange-500/20 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide shadow-sm flex items-center gap-1 backdrop-blur-sm">
                                <Package className="w-3 h-3" strokeWidth={3} />
                                Adquirido
                            </div>

                            <div className="aspect-video relative overflow-hidden bg-black/40">
                                {product.imageUrl ? (
                                    <img
                                        src={product.imageUrl}
                                        alt={product.name}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                        <Package className="w-12 h-12 opacity-20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                    <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                                        <Play className="w-8 h-8 text-white fill-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5">
                                <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{product.name}</h3>
                                <p className="text-sm text-gray-400 mb-4 line-clamp-2 min-h-[2.5rem]">
                                    {product.description || 'Sem descrição.'}
                                </p>

                                <button
                                    className="w-full px-4 py-2 bg-white text-black font-bold rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Play className="w-4 h-4" /> Acessar Conteúdo
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
