import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { Content, MemberArea, Module, AccessGrant, Lesson } from '../../types';
import { Play, ArrowLeft, FileText, Lock, CheckCircle, ChevronRight } from 'lucide-react';
import { useAccessControl } from '../../hooks/useAccessControl';
import { ProductSalesModal } from '../../components/member/ProductSalesModal';
import { useTranslation } from 'react-i18next';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const ContentModules = () => {
    const { t } = useTranslation('member');
    const navigate = useNavigate();
    const { id } = useParams<{ slug: string; id: string }>();
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const [content, setContent] = useState<Content | null>(null);
    const [modules, setModules] = useState<Module[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const { handleAccess, checkAccess } = useAccessControl(accessGrants);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, [id, memberArea?.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (id) {
                const contents = await storage.getContents(memberArea?.id);
                const contentData = contents.find((entry) => entry.id === id) || null;
                setContent(contentData);

                const modulesData = await storage.getModules(id);
                setModules(modulesData);

                const grants = await storage.getAccessGrants();
                setAccessGrants(grants);
            }
        } catch (error) {
            console.error('Error loading content modules:', error);
        } finally {
            setLoading(false);
        }
    };

    const isCustomDomain = typeof window !== 'undefined'
        && !window.location.hostname.includes('vercel.app')
        && !window.location.hostname.includes('localhost')
        && !window.location.pathname.startsWith('/app/');
    const appLink = isCustomDomain ? '' : (memberArea ? "/app/" + memberArea.slug : '/app');
    const isVertical = content?.modules_layout === 'vertical';
    const totalLessons = modules.reduce((total, module) => total + (module.lessons?.length || 0), 0);

    const openSalesModal = (product?: any | null) => {
        setSelectedProduct(product || null);
        setIsModalOpen(Boolean(product));
    };

    const handleModuleAccess = (module: Module) => {
        if (!content) return;

        handleAccess(module, {
            onAccess: () => navigate(appLink + '/course/' + content.id + '?module_id=' + module.id),
            onSalesModal: (product) => openSalesModal(product),
        }, { content, module });
    };

    const handleLessonAccess = (lesson: Lesson, module: Module) => {
        if (!content) return;

        handleAccess(lesson, {
            onAccess: () => navigate(appLink + '/course/' + content.id + '?lesson_id=' + lesson.id),
            onSalesModal: (product) => openSalesModal(product),
        }, { content, module });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!content) return null;

    return (
        <div className="container mx-auto px-4 md:px-8 py-8">
            <button
                onClick={() => navigate(appLink || '/')}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> {t('content_modules.back', 'Voltar')}
            </button>

            <div className="flex flex-col md:flex-row gap-8 mb-12">
                <div className="w-full md:w-1/3 lg:w-1/4">
                    <div className={
                        'rounded-xl overflow-hidden shadow-2xl ' + (isVertical ? 'aspect-[2/3]' : 'aspect-video')
                    }>
                        <img
                            src={(isVertical ? content.image_vertical_url : content.image_horizontal_url) || content.thumbnail_url || '/logo.png'}
                            alt={content.title}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
                <div className="flex-1">
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{content.title}</h1>
                    <p className="text-gray-400 text-lg leading-relaxed mb-6">{content.description}</p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            {t('content_modules.module_count', { count: modules.length })}
                        </div>
                        <div className="flex items-center gap-2">
                            <Play className="w-4 h-4" />
                            {t('content_modules.lesson_count', '{{count}} aulas', { count: totalLessons })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white">{t('content_modules.modules_title', 'Modulos')}</h2>
                <div className="grid gap-4">
                    {modules.map((module, index) => (
                        <div
                            key={module.id}
                            className="bg-[#1A1D21] p-5 rounded-2xl border border-white/5 transition-all"
                        >
                            <button
                                type="button"
                                onClick={() => handleModuleAccess(module)}
                                className="w-full text-left group flex items-center gap-4"
                            >
                                <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-red-600 transition-colors flex-shrink-0">
                                    <span className="font-bold text-lg">{index + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white group-hover:text-red-500 transition-colors">{module.title}</h3>
                                    <p className="text-sm text-gray-500 line-clamp-2">{module.description}</p>
                                    <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                        {t('content_modules.lesson_count', '{{count}} aulas', { count: module.lessons?.length || 0 })}
                                    </div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/80 group-hover:bg-white group-hover:text-black transition-colors flex-shrink-0">
                                    <Play className="w-4 h-4 fill-current" />
                                </div>
                            </button>

                            {module.lessons && module.lessons.length > 0 && (
                                <div className="mt-4 border-t border-white/5 pt-4 space-y-2">
                                    {module.lessons.map((lesson, lessonIndex) => {
                                        const accessAction = checkAccess(lesson, { content, module });
                                        const isLocked = accessAction === 'SALES_MODAL';
                                        const isLessonFree = lesson.is_free || module.is_free || content.is_free;

                                        return (
                                            <button
                                                type="button"
                                                key={lesson.id}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleLessonAccess(lesson, module);
                                                }}
                                                className={
                                                    'w-full rounded-xl border px-4 py-3 text-left transition-all flex items-center gap-3 ' +
                                                    (isLocked
                                                        ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                                                        : 'border-white/5 bg-black/20 hover:bg-black/30 hover:border-white/15')
                                                }
                                            >
                                                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black text-white/80 flex-shrink-0">
                                                    {String(lessonIndex + 1).padStart(2, '0')}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate">{lesson.title}</p>
                                                    <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mt-1">
                                                        {isLocked
                                                            ? t('content_modules.lesson_locked', 'Bloqueado - clique para desbloquear')
                                                            : t('content_modules.lesson_open', 'Abrir aula')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {isLessonFree && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-black">
                                                            <CheckCircle className="w-3 h-3" />
                                                            {t('track.free', 'Gratuito')}
                                                        </span>
                                                    )}
                                                    {isLocked ? (
                                                        <Lock className="w-4 h-4 text-white/70" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-white/60" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
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
