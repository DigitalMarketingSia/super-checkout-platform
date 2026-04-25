// ...
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AccessGrant, Content, Module, Lesson, Product, TrackItem } from '../types';

export type AccessAction = 'ACCESS' | 'LOGIN' | 'SALES_MODAL' | 'SUSPENDED';

interface UseAccessControlResult {
    checkAccess: (item: TrackItem | Content | Module | Lesson | Product, context?: { content?: Content; module?: Module }) => AccessAction;
    handleAccess: (
        item: TrackItem | Content | Module | Lesson | Product,
        callbacks: {
            onAccess: () => void;
            onSalesModal: (product?: Product) => void;
            onSuspended?: () => void;
        },
        context?: { content?: Content; module?: Module }
    ) => void;
}

export const useAccessControl = (accessGrants: AccessGrant[] = []): UseAccessControlResult => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { memberArea } = useOutletContext<{ memberArea: any }>() || {};

    const checkAccess = (
        item: TrackItem | Content | Module | Lesson | Product,
        context?: { content?: Content; module?: Module }
    ): AccessAction => {
        // 0. Global Suspension Check
        if (profile?.status === 'suspended') {
            return 'SUSPENDED';
        }

        // Normalize item to check properties
        let isFree = false;
        let productId: string | undefined;
        let contentId: string | undefined;
        let associatedProductId: string | undefined; // NEW: Track associated product
        let product: Product | undefined;

        if ('product' in item && item.product) {
            // It's a TrackItem with a product
            product = item.product;
            productId = item.product.id;
        } else if ('content' in item && item.content) {
            // It's a TrackItem with content
            isFree = item.content.is_free || false;
            contentId = item.content.id;
            associatedProductId = item.content.associated_product?.id;
        } else if ('module' in item && item.module) {
            // It's a TrackItem with module
            isFree = item.module.is_free || false;
            contentId = item.module.content_id;
            associatedProductId = item.module.associated_product?.id;
        } else if ('lesson' in item && item.lesson) {
            // It's a TrackItem with lesson
            const module = item.lesson.module;
            const content = module?.content;

            isFree = item.lesson.is_free || module?.is_free || content?.is_free || false;

            // Try to get associated product from any level
            associatedProductId = item.lesson.associated_product?.id || module?.associated_product?.id || content?.associated_product?.id;

            // Try to get contentId from context if available
            if (context?.content) {
                contentId = context.content.id;
                if (!associatedProductId) associatedProductId = context.content.associated_product?.id;
            } else if (module?.content_id) {
                // Fallback: Check if lesson has module populated with content_id
                contentId = module.content_id;
            }
        } else if ('is_free' in item) {
            // Direct Content/Module/Lesson object
            const directFree = (item as any).is_free || false;
            const contextContentFree = context?.content?.is_free || false;
            const contextModuleFree = context?.module?.is_free || false;

            isFree = directFree || contextContentFree || contextModuleFree;

            if ('content_id' in item) contentId = (item as any).content_id;
            if ('id' in item && !('content_id' in item) && !('video_url' in item)) contentId = (item as any).id; // Content object

            // Try to get associated product
            associatedProductId = (item as any).associated_product?.id;

            // If it's a Lesson (has video_url or content_text) and we have context
            if (('video_url' in item || 'content_text' in item)) {
                if (context?.content) {
                    contentId = context.content.id;
                    if (!associatedProductId) associatedProductId = context.content.associated_product?.id;
                } else if ((item as Lesson).module?.content_id) {
                    contentId = (item as Lesson).module?.content_id;
                }
            }
        } else if ('price_real' in item) {
            // Direct Product object
            product = item as Product;
            productId = item.id;
        }

        // 1. Free Content Logic
        if (isFree) {
            if (!user) return 'LOGIN';
            return 'ACCESS';
        }

        // 2. Paid Content Logic
        // If it's a product itself, check if we own it
        if (productId) {
            // Check if we have a grant for this product
            const hasAccess = accessGrants.some(g => g.product_id === productId && g.status === 'active');
            if (hasAccess) return 'ACCESS';
            return 'SALES_MODAL';
        }

        // If it's content/module, check if we have access via any product OR direct content grant
        if (contentId || associatedProductId) {
            // Check 1: Direct Content Grant
            if (contentId) {
                const hasDirectAccess = accessGrants.some(g =>
                    (g.content_id === contentId && g.status === 'active')
                );
                if (hasDirectAccess) return 'ACCESS';
            }

            // Check 2: Associated Product Grant (CRITICAL FIX)
            if (associatedProductId) {
                const hasProductAccess = accessGrants.some(g =>
                    g.product_id === associatedProductId && g.status === 'active'
                );
                if (hasProductAccess) return 'ACCESS';
            }

            // If user is logged in but doesn't have access -> Sales Modal
            // If user is NOT logged in -> Sales Modal (per requirement)
            return 'SALES_MODAL';
        }

        // Fallback
        return 'SALES_MODAL';
    };

    const handleAccess = (
        item: TrackItem | Content | Module | Lesson | Product,
        callbacks: {
            onAccess: () => void;
            onSalesModal: (product?: Product) => void;
            onSuspended?: () => void;
        },
        context?: { content?: Content; module?: Module }
    ) => {
        const action = checkAccess(item, context);

        if (action === 'LOGIN') {
            // Detect custom domain
            const isCustomDomain = typeof window !== 'undefined' &&
                !window.location.hostname.includes('vercel.app') &&
                !window.location.hostname.includes('localhost') &&
                !window.location.pathname.startsWith('/app/');

            const appLink = isCustomDomain ? '' : (memberArea ? `/app/${memberArea.slug}` : '/app');
            navigate(`${appLink}/signup`); // Redirect to signup for free content
        } else if (action === 'SUSPENDED') {
            if (callbacks.onSuspended) {
                callbacks.onSuspended();
            } else {
                alert('Sua conta está suspensa. Entre em contato com o suporte.');
            }
        } else if (action === 'SALES_MODAL') {
            // Determine which product to show in modal
            let productToSell: Product | undefined;

            if ('product' in item && item.product) {
                productToSell = item.product;
            } else if ('price_real' in item) {
                productToSell = item as Product;
            } else if ('content' in item && item.content?.associated_product) {
                // TrackItem with Content
                productToSell = item.content.associated_product;
            } else if ('module' in item && item.module?.associated_product) {
                // TrackItem with Module
                productToSell = item.module.associated_product;
            } else if ('lesson' in item && item.lesson?.associated_product) {
                // TrackItem with Lesson
                productToSell = item.lesson.associated_product;
            } else if ('associated_product' in item) {
                // Direct Content/Module/Lesson object
                productToSell = (item as any).associated_product;
            }

            // Fallback: If we have context content and it has a product, use that
            if (!productToSell && context?.content?.associated_product) {
                productToSell = context.content.associated_product;
            }

            callbacks.onSalesModal(productToSell);
        } else {
            callbacks.onAccess();
        }
    };

    return { checkAccess, handleAccess };
};
