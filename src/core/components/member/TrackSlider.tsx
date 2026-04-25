import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Lock, PlayCircle, Package, FileText, BookOpen, CheckCircle, Play } from 'lucide-react';
import { Track, TrackItem, AccessGrant } from '../../types';
import { ProductSalesModal } from './ProductSalesModal';
import { useAccessControl } from '../../hooks/useAccessControl';

interface TrackSliderProps {
    track: Track;
    onItemClick: (item: TrackItem) => void;
    accessGrants?: AccessGrant[];
    primaryColor?: string;
}

export const TrackSlider: React.FC<TrackSliderProps> = ({ track, onItemClick, accessGrants = [], primaryColor }) => {
    const { handleAccess } = useAccessControl(accessGrants);
    const [selectedProduct, setSelectedProduct] = React.useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [canScrollLeft, setCanScrollLeft] = React.useState(false);
    const [canScrollRight, setCanScrollRight] = React.useState(false);
    const [hasOverflow, setHasOverflow] = React.useState(false);

    const checkScroll = () => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
            setHasOverflow(scrollWidth > clientWidth);
        }
    };

    React.useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [track.items]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 300;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    return (
        <div className="mb-8">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                    margin: 0 16px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: ${primaryColor || '#D4143C'};
                    border-radius: 4px;
                    transition: background 0.2s;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: ${primaryColor ? `color-mix(in srgb, ${primaryColor} 80%, white)` : '#E91E63'};
                }
            `}</style>

            {/* Header with Title and Navigation Arrows */}
            <div className="flex items-center justify-between mb-4 px-4 md:px-0">
                <h3 className="text-xl font-semibold text-white">{track.title}</h3>

                {/* Navigation Arrows - Only show if there's overflow */}
                {hasOverflow && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => scroll('left')}
                            disabled={!canScrollLeft}
                            className={`p-1 transition-opacity ${canScrollLeft ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
                                }`}
                            style={{ color: primaryColor || '#D4143C' }}
                        >
                            <ChevronLeft size={24} strokeWidth={2.5} />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            disabled={!canScrollRight}
                            className={`p-1 transition-opacity ${canScrollRight ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
                                }`}
                            style={{ color: primaryColor || '#D4143C' }}
                        >
                            <ChevronRight size={24} strokeWidth={2.5} />
                        </button>
                    </div>
                )}
            </div>

            <div className="relative">
                {/* Fade-out gradient on the right when there's more content */}
                {canScrollRight && (
                    <div
                        className="absolute right-0 top-0 bottom-4 w-40 md:w-64 pointer-events-none z-10"
                        style={{
                            background: `linear-gradient(to right, transparent, #0E1012 100%)`
                        }}
                    />
                )}

                <div
                    ref={scrollContainerRef}
                    onScroll={checkScroll}
                    className="flex overflow-x-auto gap-4 pb-4 px-4 md:px-0 snap-x custom-scrollbar"
                >
                    {track.items?.map((item) => (
                        <TrackItemCard
                            key={item.id}
                            item={item}
                            onClick={() => {
                                handleAccess(item, {
                                    onAccess: () => onItemClick(item),
                                    onSalesModal: (product) => {
                                        const productToSell = product || item.product;
                                        if (productToSell) {
                                            setSelectedProduct(productToSell);
                                            setIsModalOpen(true);
                                        } else {
                                            alert('Este conteúdo é exclusivo para assinantes e não possui um produto direto associado para compra.');
                                        }
                                    }
                                });
                            }}
                            accessGrants={accessGrants}
                            cardStyle={track.card_style || 'vertical'}
                            primaryColor={primaryColor}
                        />
                    ))}
                </div>
            </div>

            <ProductSalesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                product={selectedProduct}
            />
        </div>
    );
};

interface TrackItemCardProps {
    item: TrackItem;
    onClick: () => void;
    accessGrants: AccessGrant[];
    cardStyle: 'vertical' | 'horizontal';
    primaryColor?: string;
}

const TrackItemCard: React.FC<TrackItemCardProps> = ({ item, onClick, accessGrants, cardStyle, primaryColor }) => {
    const { checkAccess } = useAccessControl(accessGrants);
    // Determine content based on item type (polymorphic)
    let title = '';
    let imageUrl = '';
    let Icon = Package;
    let isFree = false;
    let isOwned = false; // NEW: Track if product is owned
    const isVertical = cardStyle === 'vertical';

    if (item.product) {
        title = item.product.name;
        imageUrl = item.product.imageUrl || '';
        Icon = Package;
        // Check if user owns this product
        isOwned = accessGrants.some(g => g.product_id === item.product!.id && g.status === 'active');
    } else if (item.content) {
        title = item.content.title;
        isFree = item.content.is_free || false;
        // Choose image based on style
        if (isVertical) {
            imageUrl = item.content.image_vertical_url || item.content.image_horizontal_url || item.content.thumbnail_url || '';
        } else {
            imageUrl = item.content.image_horizontal_url || item.content.image_vertical_url || item.content.thumbnail_url || '';
        }
        Icon = BookOpen;
    } else if (item.module) {
        title = item.module.title;
        isFree = item.module.is_free || false;
        if (isVertical) {
            imageUrl = item.module.image_vertical_url || item.module.image_horizontal_url || '';
        } else {
            imageUrl = item.module.image_horizontal_url || item.module.image_vertical_url || '';
        }
        Icon = FileText;
    } else if (item.lesson) {
        title = item.lesson.title;
        isFree = item.lesson.is_free || false;
        // Lessons are usually horizontal (card style)
        imageUrl = item.lesson.image_url || (item.lesson.video_url ? `https://img.youtube.com/vi/${getYouTubeId(item.lesson.video_url)}/mqdefault.jpg` : '');
        Icon = PlayCircle;
    }

    // Access Check Logic
    const isLocked = React.useMemo(() => {
        if (!item) return false;
        const action = checkAccess(item);
        return action === 'SALES_MODAL';
    }, [item, accessGrants, checkAccess]);


    return (
        <div
            onClick={onClick}
            className={`flex-none ${isVertical ? 'w-52 md:w-60' : 'w-72 md:w-80'} snap-start cursor-pointer group/card relative transition-transform hover:scale-105 duration-300`}
        >
            <div className={`${isVertical ? 'aspect-[2/3]' : 'aspect-video'} rounded-xl overflow-hidden bg-gray-800 relative ${isLocked ? 'grayscale' : ''} shadow-lg ring-1 ring-white/5`}>
                {imageUrl ? (
                    <>
                        {item.product ? (
                            // Product Card: Blurred Background + Contained Image
                            <>
                                <img
                                    src={imageUrl}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover opacity-50 blur-2xl scale-125"
                                />
                                <div className="absolute inset-0 bg-black/20" /> {/* Dim overlay */}
                                <img
                                    src={imageUrl}
                                    alt={title}
                                    className="relative w-full h-full object-contain p-4 z-10 drop-shadow-xl"
                                />
                            </>
                        ) : (
                            // Content/Lesson Card: Standard Cover
                            <>
                                <img
                                    src={imageUrl}
                                    alt={title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                                />

                                {/* Hover Overlay with Play Button - ONLY for non-products (lessons/content) */}
                                {!isLocked && (
                                    <div
                                        className="absolute inset-0 z-30 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px]"
                                        style={{
                                            background: `linear-gradient(to top right, ${primaryColor || '#D4143C'}4D 0%, transparent 100%)`
                                        }}
                                    >
                                        <div className="bg-white/20 p-5 rounded-full backdrop-blur-md border border-white/30 transform scale-75 group-hover/card:scale-100 transition-transform duration-300 shadow-2xl flex items-center justify-center group/btn">
                                            <Play size={32} className="text-white fill-white ml-1 transition-transform duration-300 group-hover/btn:scale-110" strokeWidth={0} />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900">
                        <Icon size={48} strokeWidth={1.5} />
                    </div>
                )}

                {isLocked && (
                    <div className="absolute top-3 right-3 bg-black/60 p-2 rounded-full text-white z-20 backdrop-blur-md">
                        <Lock size={16} />
                    </div>
                )}

                {isFree && (
                    <div className="absolute top-3 left-3 bg-green-500 text-black text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1 z-20">
                        <CheckCircle size={10} strokeWidth={3} />
                        Gratuito
                    </div>
                )}

                {/* Owned Product Badge */}
                {isOwned && (
                    <div className="absolute top-3 left-3 bg-white text-black text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center gap-1 z-20">
                        <Package size={10} strokeWidth={3} />
                        Seu
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover/card:opacity-40 transition-opacity z-20" />
            </div>

            <div className="mt-4 px-1">
                <h4 className="text-base font-semibold text-gray-100 group-hover/card:text-white truncate transition-colors">{title}</h4>
                {item.content && (
                    <p className="text-xs text-gray-400 mt-1">{item.content.modules_count || 0} Módulos</p>
                )}
            </div>
        </div>
    );
};

// Helper to extract YT ID (simplified)
function getYouTubeId(url: string) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}
