import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { Content, Module, Lesson, MemberArea, AccessGrant } from '../../types';
import { ChevronLeft, CheckCircle, Circle, FileText, Download, ChevronDown, ChevronUp, PanelLeftClose, Search, Play, ChevronRight, Menu } from 'lucide-react';
import { useAccessControl } from '../../hooks/useAccessControl';
import { ProductSalesModal } from '../../components/member/ProductSalesModal';
import { IconSidebar } from '../../components/member/IconSidebar';

export const CoursePlayer = ({ forcedSlug }: { forcedSlug?: string } = {}) => {
    const { slug, id } = useParams<{ slug: string; id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Use forcedSlug (from custom domain) or slug (from URL)
    const effectiveSlug = forcedSlug || slug;

    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState<Content | null>(null);
    const [allContents, setAllContents] = useState<Content[]>([]);
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [modules, setModules] = useState<Module[]>([]);
    const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
    const [progressMap, setProgressMap] = useState<Record<string, boolean>>({});
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const { handleAccess } = useAccessControl(accessGrants);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isContentExpanded, setIsContentExpanded] = useState(true);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            loadData(id);
        }
    }, [id, effectiveSlug]);

    const loadData = async (contentId: string) => {
        setLoading(true);
        setError(null);
        try {
            // Detect custom domain
            const isCustomDomain = typeof window !== 'undefined' &&
                !window.location.hostname.includes('vercel.app') &&
                !window.location.hostname.includes('localhost') &&
                !window.location.pathname.startsWith('/app/');

            let currentMemberArea = memberArea;
            let areaId: string | undefined = memberArea?.id;

            // 1. Resolve Member Area
            if (effectiveSlug && !currentMemberArea) {
                // Scenario A: Standard URL with Slug OR Custom Domain with forcedSlug
                currentMemberArea = await storage.getMemberAreaBySlug(effectiveSlug);
                if (currentMemberArea) {
                    setMemberArea(currentMemberArea);
                    areaId = currentMemberArea.id;
                }
            } else if (isCustomDomain && !effectiveSlug && !currentMemberArea) {
                // Scenario B: Custom Domain fallback - fetch by hostname
                const hostname = window.location.hostname;
                currentMemberArea = await storage.getMemberAreaByDomain(hostname);
                if (currentMemberArea) {
                    setMemberArea(currentMemberArea);
                    areaId = currentMemberArea.id;
                }
            }

            if (!currentMemberArea && isCustomDomain) {
                throw new Error("Área de membros não encontrada para este domínio.");
            }

            // 2. Resolve Content & Area
            let fetchedContents: Content[] = [];

            if (areaId) {
                fetchedContents = await storage.getContents(areaId);
            } else {
                fetchedContents = await storage.getContents();
            }

            const targetContent = fetchedContents.find(c => c.id === contentId);

            if (!targetContent) {
                console.error(`Content not found: ${contentId}`);
                throw new Error("Conteúdo não encontrado.");
            }

            // If we just discovered the area from the content, filter the list properly
            if (!areaId && targetContent.member_area_id) {
                areaId = targetContent.member_area_id;
                fetchedContents = fetchedContents.filter(c => c.member_area_id === areaId);
            }

            setAllContents(fetchedContents);
            setContent(targetContent);

            // 3. Load Modules
            const modulesData = await storage.getModules(contentId);
            setModules(modulesData);

            // 4. Load Access Grants
            const grants = await storage.getAccessGrants();
            setAccessGrants(grants);

            // 5. Determine Lesson to Play
            let lessonToPlay: Lesson | null = null;
            const lessonIdParam = searchParams.get('lesson_id');
            const moduleIdParam = searchParams.get('module_id');

            if (lessonIdParam) {
                for (const m of modulesData) {
                    const l = m.lessons?.find(l => l.id === lessonIdParam);
                    if (l) {
                        lessonToPlay = l;
                        break;
                    }
                }
            } else if (moduleIdParam) {
                const m = modulesData.find(m => m.id === moduleIdParam);
                if (m && m.lessons && m.lessons.length > 0) {
                    lessonToPlay = m.lessons[0];
                }
            }

            // Fallback to first lesson
            if (!lessonToPlay && modulesData.length > 0 && modulesData[0].lessons && modulesData[0].lessons.length > 0) {
                lessonToPlay = modulesData[0].lessons[0];
            }

            if (lessonToPlay) {
                setCurrentLesson(lessonToPlay);
                setExpandedModuleId(lessonToPlay.module_id);
                checkProgress(lessonToPlay.id);
            } else if (modulesData.length > 0) {
                setExpandedModuleId(modulesData[0].id);
            }

        } catch (error) {
            console.error('Error loading course:', error);
            setError(error instanceof Error ? error.message : "Erro ao carregar curso.");
        } finally {
            setLoading(false);
        }
    };

    const checkProgress = async (lessonId: string) => {
        const progress = await storage.getLessonProgress(lessonId);
        if (progress?.completed) {
            setProgressMap(prev => ({ ...prev, [lessonId]: true }));
        }
    };

    // Check access when currentLesson changes
    useEffect(() => {
        if (!loading && currentLesson) {
            const currentModule = modules.find(m => m.lessons?.some(l => l.id === currentLesson.id));

            handleAccess(currentLesson, {
                onAccess: () => { },
                onSalesModal: (product) => {
                    setSelectedProduct(product);
                    setIsModalOpen(true);
                }
            }, { content: content || undefined, module: currentModule });
        }
    }, [currentLesson, loading, accessGrants, content, modules]);

    const handleLessonSelect = (lesson: Lesson) => {
        const currentModule = modules.find(m => m.lessons?.some(l => l.id === lesson.id));

        handleAccess(lesson, {
            onAccess: () => {
                setCurrentLesson(lesson);
                checkProgress(lesson.id);
                if (window.innerWidth < 768) {
                    setSidebarOpen(false);
                }
            },
            onSalesModal: (product) => {
                setSelectedProduct(product);
                setIsModalOpen(true);
            }
        }, { content: content || undefined, module: currentModule });
    };

    const handleContentSelect = (targetContent: Content) => {
        // 1. Same Content: Toggle Collapse
        if (targetContent.id === content?.id) {
            setIsContentExpanded(!isContentExpanded);
            return;
        }

        // 2. Different Content: Navigate
        handleAccess(targetContent, {
            onAccess: () => {
                setIsContentExpanded(true);
                setLoading(true);

                // CORRECT URL Construction
                // Standard: /app/:slug/course/:id
                // Custom Domain: /course/:id
                const newPath = slug
                    ? `/app/${slug}/course/${targetContent.id}`
                    : `/course/${targetContent.id}`;

                navigate(newPath);
            },
            onSalesModal: (product) => {
                const effectiveProduct = product || targetContent.associated_product;
                if (effectiveProduct) {
                    setSelectedProduct(effectiveProduct);
                    setIsModalOpen(true);
                } else {
                    console.warn('No product associated with this content to sell');
                }
            }
        });
    };

    const toggleModule = (moduleId: string) => {
        setExpandedModuleId(prev => prev === moduleId ? null : moduleId);
    };

    const handleMarkCompleted = async () => {
        if (!currentLesson) return;

        const newStatus = !progressMap[currentLesson.id];
        setProgressMap(prev => ({ ...prev, [currentLesson.id]: newStatus }));

        await storage.updateLessonProgress({
            lesson_id: currentLesson.id,
            completed: newStatus
        });
    };

    const handlePrevious = () => {
        if (!currentLesson) return;
        const allLessons = modules.flatMap(m => m.lessons || []);
        const currentIndex = allLessons.findIndex(l => l.id === currentLesson.id);
        if (currentIndex > 0) {
            handleLessonSelect(allLessons[currentIndex - 1]);
        }
    };

    const handleNext = () => {
        if (!currentLesson) return;
        const allLessons = modules.flatMap(m => m.lessons || []);
        const currentIndex = allLessons.findIndex(l => l.id === currentLesson.id);
        if (currentIndex < allLessons.length - 1) {
            handleLessonSelect(allLessons[currentIndex + 1]);
        }
    };

    const renderContent = () => {
        if (!currentLesson) return <div className="text-white">Selecione uma aula</div>;

        const allLessons = modules.flatMap(m => m.lessons || []);
        const currentIndex = allLessons.findIndex(l => l.id === currentLesson.id);
        const hasPrevious = currentIndex > 0;
        const hasNext = currentIndex < allLessons.length - 1;

        const renderSection = (type: string) => {
            switch (type) {
                case 'video':
                    return currentLesson.video_url ? (
                        <div key="video" className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 w-full">
                            <iframe
                                src={currentLesson.video_url.replace('watch?v=', 'embed/')}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    ) : null;

                case 'text':
                    return currentLesson.content_text ? (
                        <div key="text" className="bg-white/5 rounded-xl p-8 border border-white/5">
                            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                                {currentLesson.content_text}
                            </div>
                        </div>
                    ) : null;

                case 'file':
                    return currentLesson.file_url ? (
                        <div key="file" className="bg-white/5 rounded-xl p-6 border border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/5 rounded-lg">
                                    <FileText className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm">Material Complementar</h3>
                                    <p className="text-xs text-gray-400">Clique para acessar o arquivo ou link externo</p>
                                </div>
                            </div>
                            <a
                                href={currentLesson.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" /> Acessar Recurso
                            </a>
                        </div>
                    ) : null;

                case 'gallery':
                    return (currentLesson.gallery && currentLesson.gallery.length > 0) ? (
                        <div key="gallery" className="pt-8 border-t border-white/5">
                            <h3 className="text-xl font-bold text-white mb-6">Galeria de Recursos</h3>
                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {currentLesson.gallery.map((resource) => (
                                    <div key={resource.id} className="bg-[#1a1e26] rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-all group">
                                        <div className="aspect-video w-full bg-black/20 relative overflow-hidden">
                                            {resource.image_url ? (
                                                <img src={resource.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                    <FileText className="w-10 h-10 text-gray-600" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h4 className="font-bold text-white mb-2 text-sm line-clamp-2 leading-snug">{resource.title}</h4>
                                            <a
                                                href={resource.link_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block w-full text-center py-2 rounded-lg font-bold text-xs transition-colors bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white"
                                            >
                                                Acessar
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null;

                default:
                    return null;
            }
        };

        const contentOrder = currentLesson.content_order || ['video', 'text', 'file', 'gallery'];

        return (
            <div className="LESSON-CONTAINER w-full max-w-[1100px] mx-auto px-6 space-y-8 pb-20">
                <div className="space-y-8">
                    {contentOrder.map(type => renderSection(type))}
                </div>

                <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-white/10 pb-8">
                    <div className="w-full md:w-auto">
                        <h1 className="text-2xl font-bold text-white mb-1">{currentLesson.title}</h1>
                        <p className="text-gray-400 text-sm">Módulo: {modules.find(m => m.id === currentLesson.module_id)?.title}</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrevious}
                                disabled={!hasPrevious}
                                className={`p-3 rounded-full border transition-colors ${!hasPrevious ? 'border-white/5 text-gray-600 cursor-not-allowed' : 'border-white/10 text-white hover:bg-white/10 hover:border-white/20'}`}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={!hasNext}
                                className={`p-3 rounded-full border transition-colors ${hasNext ? 'border-white/10 text-white hover:bg-white/10 hover:border-white/20' : 'border-white/5 text-gray-600 cursor-not-allowed'}`}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        <button
                            onClick={handleMarkCompleted}
                            className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all ${progressMap[currentLesson.id]
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-white/10 text-white hover:bg-white/20'
                                }`}
                            style={progressMap[currentLesson.id] && memberArea?.primary_color ? { backgroundColor: memberArea.primary_color } : {}}
                        >
                            {progressMap[currentLesson.id] ? (
                                <>
                                    <CheckCircle className="w-5 h-5" /> Concluída
                                </>
                            ) : (
                                <>
                                    <Circle className="w-5 h-5" /> Marcar como Concluída
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div >
        );
    };

    const primaryColor = memberArea?.primary_color || '#dc2626';

    const filteredModules = React.useMemo(() => {
        if (!searchTerm) return modules;
        const lowerTerm = searchTerm.toLowerCase();
        return modules.map(m => {
            const moduleMatches = m.title.toLowerCase().includes(lowerTerm);
            const matchingLessons = m.lessons?.filter(l => l.title.toLowerCase().includes(lowerTerm));

            if (moduleMatches) return m;
            if (matchingLessons && matchingLessons.length > 0) {
                return { ...m, lessons: matchingLessons };
            }
            return null;
        }).filter(Boolean) as Module[];
    }, [modules, searchTerm]);

    const filteredContents = React.useMemo(() => {
        // Filter by member area if known
        let displayContents = allContents;
        if (memberArea?.id) {
            displayContents = allContents.filter(c => c.member_area_id === memberArea.id);
        } else if (allContents.length > 0 && content?.member_area_id) {
            // Fallback filtering if memberArea object is null but we inferred ID from content
            displayContents = allContents.filter(c => c.member_area_id === content.member_area_id);
        }

        if (!searchTerm) return displayContents;
        const lowerTerm = searchTerm.toLowerCase();
        return displayContents.filter(c => c.title.toLowerCase().includes(lowerTerm) || c.id === content?.id);
    }, [allContents, searchTerm, content, memberArea]);

    useEffect(() => {
        if (searchTerm && filteredModules.length > 0) {
            if (filteredModules.length > 0) {
                setExpandedModuleId(filteredModules[0].id);
            }
        }
    }, [searchTerm, filteredModules]);

    return (
        <div className="flex h-screen bg-[#0D1118] text-white overflow-hidden">
            <IconSidebar
                onToggleMenu={() => setSidebarOpen(!sidebarOpen)}
                isMenuOpen={sidebarOpen}
                memberAreaSlug={slug}
                primaryColor={primaryColor}
            />

            <aside
                className={`
              fixed md:static inset-x-0 bottom-0 z-40 md:z-50 bg-gradient-to-b from-[#0f131a] to-[#0b0f16] border-r border-white/5 flex flex-col transition-all duration-300 md:ml-16
              /* Mobile: Top-16 (header), Bottom-0 */
              top-16 w-full md:w-auto
              /* Desktop: Top-0, Bottom-0 */
              md:inset-y-0 md:top-0
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
              ${sidebarOpen ? 'md:w-80' : 'md:w-0'}
            `}
            >
                {sidebarOpen && (
                    <>
                        <div className="p-4 flex items-center justify-between gap-2 sticky top-0 bg-[#0f131a]/95 backdrop-blur-sm z-20 border-b border-white/5">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                                <input
                                    id="search-input"
                                    type="text"
                                    placeholder="Buscar conteúdo"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-[#1a1e26] border-none rounded-lg py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                                style={{ color: primaryColor }}
                            >
                                <PanelLeftClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {filteredContents.map((c) => {
                                const isCurrentContent = c.id === content?.id;
                                const imageUrl = c.image_url || c.associated_product?.imageUrl || c.associated_product?.image_url;
                                // Use product name if available, else content title
                                const displayTitle = c.associated_product?.name || c.title;

                                return (
                                    <div key={c.id} className="border-b border-white/5 last:mb-0">
                                        <div
                                            className={`p-4 cursor-pointer hover:bg-white/5 flex items-center justify-between ${isCurrentContent ? 'bg-[#1a1e26]/50' : ''}`}
                                            onClick={() => handleContentSelect(c)}
                                        >
                                            <div className="flex items-center gap-3">
                                                {imageUrl ? (
                                                    <img src={imageUrl} className="w-10 h-10 rounded-lg object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                                                        <FileText size={16} />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`text-sm font-bold truncate leading-tight ${isCurrentContent ? 'text-white' : 'text-gray-400'}`}
                                                        style={isCurrentContent ? { color: primaryColor } : {}}
                                                    >
                                                        {displayTitle}
                                                    </h3>
                                                    {!isCurrentContent && (
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Clique para acessar</p>
                                                    )}
                                                </div>
                                            </div>
                                            {isCurrentContent ? (
                                                isContentExpanded ? (
                                                    <ChevronUp size={16} style={{ color: primaryColor }} />
                                                ) : (
                                                    <ChevronDown size={16} style={{ color: primaryColor }} />
                                                )
                                            ) : (
                                                <ChevronRight size={16} className="text-gray-600" />
                                            )}
                                        </div>

                                        {isCurrentContent && isContentExpanded && (
                                            <div className="relative ml-4 pl-4 pt-4 pb-2 space-y-4 border-l border-white/10">
                                                {filteredModules.map((module, index) => (
                                                    <div key={module.id} className="relative pr-2">
                                                        {/* Horizontal Connector Line */}
                                                        <div className="absolute top-[2.5rem] -left-4 w-4 h-[1px] bg-white/10"></div>

                                                        <div
                                                            onClick={() => toggleModule(module.id)}
                                                            className="relative overflow-hidden group cursor-pointer transition-all pr-4 py-6 md:py-8 rounded-lg border border-white/5 shadow-lg hover:shadow-xl hover:border-white/10 transform hover:translate-x-1 duration-300"
                                                            style={{
                                                                backgroundImage: module.image_url ? `url(${module.image_url})` : undefined,
                                                                backgroundSize: 'cover',
                                                                backgroundPosition: 'center',
                                                                backgroundColor: '#1a1e26'
                                                            }}
                                                        >
                                                            <div className={`absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent transition-opacity ${expandedModuleId === module.id ? 'opacity-95' : 'opacity-90 group-hover:opacity-95'}`} />

                                                            <div className="relative z-10 flex items-center justify-between px-4">
                                                                <div className="flex-1 min-w-0 mr-4">
                                                                    <span
                                                                        className="text-[10px] font-bold uppercase tracking-wider mb-1 inline-block px-1.5 py-0.5 rounded bg-black/40 backdrop-blur-sm border border-white/10"
                                                                        style={{ color: primaryColor, borderColor: `${primaryColor}40` }}
                                                                    >
                                                                        Módulo {modules.findIndex(m => m.id === module.id) + 1}
                                                                    </span>
                                                                    <h3 className="text-base md:text-lg font-bold text-white leading-tight drop-shadow-md">{module.title}</h3>
                                                                </div>
                                                                <div className="bg-black/40 backdrop-blur-sm p-1.5 rounded-full border border-white/10 flex-shrink-0 transition-transform duration-300">
                                                                    {expandedModuleId === module.id ? <ChevronUp size={16} style={{ color: primaryColor }} /> : <ChevronDown size={16} className="text-gray-300" />}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {expandedModuleId === module.id && (
                                                            <div className="bg-transparent pl-4 mt-2 space-y-1 ml-2 border-l border-white/5">
                                                                {module.lessons?.map((lesson, lIndex) => {
                                                                    const isActive = currentLesson?.id === lesson.id;
                                                                    const isCompleted = progressMap[lesson.id];
                                                                    let thumbnailUrl = lesson.image_url;
                                                                    if (!thumbnailUrl && lesson.video_url) {
                                                                        const videoId = lesson.video_url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
                                                                        if (videoId) {
                                                                            thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                                                                        }
                                                                    }

                                                                    return (
                                                                        <button
                                                                            key={lesson.id}
                                                                            onClick={() => handleLessonSelect(lesson)}
                                                                            className={`group w-full text-left p-2 flex items-center gap-3 rounded-xl transition-all border ${isActive
                                                                                ? 'shadow-lg relative z-10'
                                                                                : 'bg-transparent hover:bg-[#1a1e26] border-transparent'
                                                                                }`}
                                                                            style={isActive ? {
                                                                                backgroundColor: `${primaryColor}15`,
                                                                                borderColor: primaryColor,
                                                                            } : {}}
                                                                        >
                                                                            <div className="relative w-16 aspect-video flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden shadow-sm">
                                                                                {thumbnailUrl ? (
                                                                                    <img src={thumbnailUrl} className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-40' : 'opacity-80 group-hover:opacity-100'}`} alt="" />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                                                                                        <FileText size={14} />
                                                                                    </div>
                                                                                )}

                                                                                {isActive && (
                                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                                                        <Play size={10} className="text-white fill-white" />
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            <div className="flex-1 min-w-0 py-0.5">
                                                                                <p className={`text-xs font-medium line-clamp-2 leading-snug ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                                                                                    {lesson.title}
                                                                                </p>
                                                                            </div>

                                                                            <div className="flex-shrink-0 pr-1">
                                                                                {isCompleted ? (
                                                                                    <div className="bg-green-500/20 rounded-full p-0.5">
                                                                                        <CheckCircle className="w-3 h-3 text-green-500 fill-green-500/20" />
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className={`w-3 h-3 rounded-full border-2 ${isActive ? 'border-white/20' : 'border-gray-700/50'}`} />
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                                {(!module.lessons || module.lessons.length === 0) && (
                                                                    <div className="p-4 text-xs text-gray-500 text-center">Nenhuma aula neste módulo.</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </aside>

            <main className="flex-1 flex flex-col h-full relative">
                <div className="LESSON-WRAP flex-1 overflow-y-auto bg-[#0D1118] p-4 md:p-8 pt-20 md:pt-16 flex justify-center">
                    {loading ? (
                        <div className="flex items-center justify-center h-64 w-full">
                            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: `${primaryColor} transparent transparent transparent` }}></div>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-64 w-full text-center">
                            <div>
                                <p className="text-red-500 font-bold mb-2">Erro</p>
                                <p className="text-gray-400">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-4 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm font-medium"
                                >
                                    Tentar Novamente
                                </button>
                            </div>
                        </div>
                    ) : (
                        renderContent()
                    )}
                </div>
            </main>

            <ProductSalesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                product={selectedProduct}
            />
        </div>
    );
};
