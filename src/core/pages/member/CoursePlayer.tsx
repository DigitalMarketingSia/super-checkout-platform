import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { storage } from "../../services/storageService";
import { Content, Module, Lesson, MemberArea, AccessGrant } from "../../types";
import {
  ChevronLeft,
  CheckCircle,
  Circle,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Play,
  ChevronRight,
  Lock,
} from "lucide-react";
import { useAccessControl } from "../../hooks/useAccessControl";
import { ProductSalesModal } from "../../components/member/ProductSalesModal";
import { IconSidebar } from "../../components/member/IconSidebar";
import { useTranslation } from "react-i18next";

const getYoutubeEmbedUrl = (url?: string | null): string | null => {
  if (!url) return null;

  const videoId = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/,
  )?.[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};

const getProductImage = (
  product?:
    | Content["associated_product"]
    | Module["associated_product"]
    | Lesson["associated_product"]
    | null,
) => {
  if (!product) return "";
  return product.imageUrl || (product as any).image_url || "";
};

const getContentCoverImage = (content: Content) => {
  return (
    getProductImage(content.associated_product) ||
    content.image_horizontal_url ||
    content.image_vertical_url ||
    content.thumbnail_url ||
    ""
  );
};

const getModuleCoverImage = (module: Module, targetContent: Content) => {
  return (
    module.image_horizontal_url ||
    module.image_vertical_url ||
    getProductImage(module.associated_product) ||
    targetContent.image_horizontal_url ||
    targetContent.image_vertical_url ||
    targetContent.thumbnail_url ||
    ""
  );
};

const formatLessonDuration = (duration?: number) => {
  if (!duration || duration <= 0) return null;
  if (duration >= 60) {
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  }
  return `${duration} min`;
};

export const CoursePlayer = ({ forcedSlug }: { forcedSlug?: string } = {}) => {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation("member");

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
  const { handleAccess, checkAccess } = useAccessControl(accessGrants);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isContentExpanded, setIsContentExpanded] = useState(true);
  const [showAllLocked, setShowAllLocked] = useState(false);
 
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id, effectiveSlug]);

  const syncPlayerSearch = (params: {
    lessonId?: string | null;
    moduleId?: string | null;
  }) => {
    const nextParams = new URLSearchParams(searchParams);

    if (params.lessonId) {
      nextParams.set("lesson_id", params.lessonId);
      nextParams.delete("module_id");
    } else {
      nextParams.delete("lesson_id");
    }

    if (params.moduleId) {
      nextParams.set("module_id", params.moduleId);
    } else {
      nextParams.delete("module_id");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const loadData = async (contentId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Detect custom domain
      const isCustomDomain =
        typeof window !== "undefined" &&
        !window.location.hostname.includes("vercel.app") &&
        !window.location.hostname.includes("localhost") &&
        !window.location.pathname.startsWith("/app/");

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
        throw new Error(
          t(
            "course.errors.member_area_not_found",
            "ÃƒÂrea de membros nÃƒÂ£o encontrada para este domÃƒÂ­nio.",
          ),
        );
      }

      // 2. Resolve Content & Area
      let fetchedContents: Content[] = [];

      if (areaId) {
        fetchedContents = await storage.getContents(areaId);
      } else {
        fetchedContents = await storage.getContents();
      }

      const targetContent = fetchedContents.find((c) => c.id === contentId);

      if (!targetContent) {
        console.error(`Content not found: ${contentId}`);
        throw new Error(
          t(
            "course.errors.content_not_found",
            "ConteÃƒÂºdo nÃƒÂ£o encontrado.",
          ),
        );
      }

      // If we just discovered the area from the content, filter the list properly
      if (!areaId && targetContent.member_area_id) {
        areaId = targetContent.member_area_id;
        fetchedContents = fetchedContents.filter(
          (c) => c.member_area_id === areaId,
        );
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
      let initialExpandedModuleId: string | null = null;
      const lessonIdParam = searchParams.get("lesson_id");
      const moduleIdParam = searchParams.get("module_id");

      if (lessonIdParam) {
        for (const m of modulesData) {
          const l = m.lessons?.find((l) => l.id === lessonIdParam);
          if (l) {
            lessonToPlay = l;
            initialExpandedModuleId = l.module_id;
            break;
          }
        }
      } else if (moduleIdParam) {
        const m = modulesData.find((m) => m.id === moduleIdParam);
        if (m) {
          initialExpandedModuleId = m.id;
        }
      }

      // Fallback to first lesson
      if (
        !lessonToPlay &&
        !moduleIdParam &&
        modulesData.length > 0 &&
        modulesData[0].lessons &&
        modulesData[0].lessons.length > 0
      ) {
        lessonToPlay = modulesData[0].lessons[0];
        initialExpandedModuleId = lessonToPlay.module_id;
      }

      if (lessonToPlay) {
        setCurrentLesson(lessonToPlay);
        setExpandedModuleId(initialExpandedModuleId || lessonToPlay.module_id);
        checkProgress(lessonToPlay.id);
      } else if (initialExpandedModuleId) {
        setCurrentLesson(null);
        setExpandedModuleId(initialExpandedModuleId);
      } else if (modulesData.length > 0) {
        setCurrentLesson(null);
        setExpandedModuleId(modulesData[0].id);
      }
    } catch (error) {
      console.error("Error loading course:", error);
      setError(
        error instanceof Error
          ? error.message
          : t("course.errors.load_course", "Erro ao carregar curso."),
      );
    } finally {
      setLoading(false);
    }
  };

  const checkProgress = async (lessonId: string) => {
    const progress = await storage.getLessonProgress(lessonId);
    if (progress?.completed) {
      setProgressMap((prev) => ({ ...prev, [lessonId]: true }));
    }
  };

  // Check access when currentLesson changes
  useEffect(() => {
    if (!loading && currentLesson) {
      const currentModule = modules.find((m) =>
        m.lessons?.some((l) => l.id === currentLesson.id),
      );

      handleAccess(
        currentLesson,
        {
          onAccess: () => {},
          onSalesModal: (product) => {
            setSelectedProduct(product);
            setIsModalOpen(true);
          },
        },
        { content: content || undefined, module: currentModule },
      );
    }
  }, [currentLesson, loading, accessGrants, content, modules]);

  const handleLessonSelect = (lesson: Lesson) => {
    const currentModule = modules.find((m) =>
      m.lessons?.some((l) => l.id === lesson.id),
    );

    handleAccess(
      lesson,
      {
        onAccess: () => {
          setExpandedModuleId(lesson.module_id);
          setIsContentExpanded(true);
          setCurrentLesson(lesson);
          checkProgress(lesson.id);
          syncPlayerSearch({ lessonId: lesson.id });
          if (window.innerWidth < 768) {
            setSidebarOpen(false);
          }
        },
        onSalesModal: (product) => {
          setSelectedProduct(product);
          setIsModalOpen(true);
        },
      },
      { content: content || undefined, module: currentModule },
    );
  };

  const handleModuleSelect = (module: Module) => {
    if (!content) return;

    handleAccess(
      module,
      {
        onAccess: () => {
          setIsContentExpanded(true);
          setExpandedModuleId((prev) =>
            prev === module.id ? null : module.id,
          );
        },
        onSalesModal: (product) => {
          setSelectedProduct(product);
          setIsModalOpen(true);
        },
      },
      { content, module },
    );
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
          console.warn("No product associated with this content to sell");
        }
      },
    });
  };

  const handleMarkCompleted = async () => {
    if (!currentLesson) return;

    const newStatus = !progressMap[currentLesson.id];
    setProgressMap((prev) => ({ ...prev, [currentLesson.id]: newStatus }));

    await storage.updateLessonProgress({
      lesson_id: currentLesson.id,
      completed: newStatus,
    });
  };

  const handlePrevious = () => {
    if (!currentLesson) return;
    const allLessons = modules.flatMap((m) => m.lessons || []);
    const currentIndex = allLessons.findIndex((l) => l.id === currentLesson.id);
    if (currentIndex > 0) {
      handleLessonSelect(allLessons[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (!currentLesson) return;
    const allLessons = modules.flatMap((m) => m.lessons || []);
    const currentIndex = allLessons.findIndex((l) => l.id === currentLesson.id);
    if (currentIndex < allLessons.length - 1) {
      handleLessonSelect(allLessons[currentIndex + 1]);
    }
  };

  const renderContent = () => {
    if (!currentLesson)
      return (
        <div className="text-white">
          {t("course.select_lesson", "Selecione uma aula")}
        </div>
      );

    const allLessons = modules.flatMap((m) => m.lessons || []);
    const currentIndex = allLessons.findIndex((l) => l.id === currentLesson.id);
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < allLessons.length - 1;

    const renderSection = (type: string) => {
      switch (type) {
        case "video":
          return currentLesson.video_url ? (
            <div
              key="video"
              className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 w-full"
            >
              <iframe
                src={
                  getYoutubeEmbedUrl(currentLesson.video_url) ||
                  currentLesson.video_url
                }
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null;

        case "text":
          return currentLesson.content_text ? (
            <div
              key="text"
              className="bg-white/5 rounded-xl p-8 border border-white/5"
            >
              <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                {currentLesson.content_text}
              </div>
            </div>
          ) : null;

        case "file":
          return currentLesson.file_url ? (
            <div
              key="file"
              className="bg-white/5 rounded-xl p-6 border border-white/5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {t(
                      "course.supplementary_material",
                      "Material complementar",
                    )}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {t(
                      "course.file_access_hint",
                      "Clique para acessar o arquivo ou link externo",
                    )}
                  </p>
                </div>
              </div>
              <a
                href={currentLesson.file_url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />{" "}
                {t("course.access_resource", "Acessar recurso")}
              </a>
            </div>
          ) : null;

        case "gallery":
          return currentLesson.gallery && currentLesson.gallery.length > 0 ? (
            <div key="gallery" className="pt-8 border-t border-white/5">
              <h3 className="text-xl font-bold text-white mb-6">
                {t("course.resource_gallery", "Galeria de recursos")}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentLesson.gallery.map((resource) => (
                  <div
                    key={resource.id}
                    className="bg-[#1a1e26] rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-all group"
                  >
                    <div className="aspect-video w-full bg-black/20 relative overflow-hidden">
                      {resource.image_url ? (
                        <img
                          src={resource.image_url}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                          <FileText className="w-10 h-10 text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="font-bold text-white mb-2 text-sm line-clamp-2 leading-snug">
                        {resource.title}
                      </h4>
                      <a
                        href={resource.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full text-center py-2 rounded-lg font-bold text-xs transition-colors bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white"
                      >
                        {t("course.access", "Acessar")}
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

    const contentOrder = currentLesson.content_order || [
      "video",
      "text",
      "file",
      "gallery",
    ];

    return (
      <div className="LESSON-CONTAINER w-full max-w-[1100px] mx-auto px-6 space-y-8 pb-20">
        <div className="space-y-8">
          {contentOrder.map((type) => renderSection(type))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-white/10 pb-8">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl font-bold text-white mb-1">
              {currentLesson.title}
            </h1>
            <p className="text-gray-400 text-sm">
              {t("course.module_label", "MÃƒÂ³dulo")}:{" "}
              {modules.find((m) => m.id === currentLesson.module_id)?.title}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                disabled={!hasPrevious}
                className={`p-3 rounded-full border transition-colors ${!hasPrevious ? "border-white/5 text-gray-600 cursor-not-allowed" : "border-white/10 text-white hover:bg-white/10 hover:border-white/20"}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleNext}
                disabled={!hasNext}
                className={`p-3 rounded-full border transition-colors ${hasNext ? "border-white/10 text-white hover:bg-white/10 hover:border-white/20" : "border-white/5 text-gray-600 cursor-not-allowed"}`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleMarkCompleted}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all ${
                progressMap[currentLesson.id]
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              style={
                progressMap[currentLesson.id] && memberArea?.primary_color
                  ? { backgroundColor: memberArea.primary_color }
                  : {}
              }
            >
              {progressMap[currentLesson.id] ? (
                <>
                  <CheckCircle className="w-5 h-5" />{" "}
                  {t("course.completed", "ConcluÃƒÂ­da")}
                </>
              ) : (
                <>
                  <Circle className="w-5 h-5" />{" "}
                  {t("course.mark_completed", "Marcar como concluÃƒÂ­da")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const primaryColor = memberArea?.primary_color || "#dc2626";

  const filteredModules = React.useMemo(() => {
    if (!searchTerm) return modules;
    const lowerTerm = searchTerm.toLowerCase();
    return modules
      .map((m) => {
        const moduleMatches = m.title.toLowerCase().includes(lowerTerm);
        const matchingLessons = m.lessons?.filter((l) =>
          l.title.toLowerCase().includes(lowerTerm),
        );

        if (moduleMatches) return m;
        if (matchingLessons && matchingLessons.length > 0) {
          return { ...m, lessons: matchingLessons };
        }
        return null;
      })
      .filter(Boolean) as Module[];
  }, [modules, searchTerm]);

  const filteredContents = React.useMemo(() => {
    // Filter by member area if known
    let displayContents = allContents;
    if (memberArea?.id) {
      displayContents = allContents.filter(
        (c) => c.member_area_id === memberArea.id,
      );
    } else if (allContents.length > 0 && content?.member_area_id) {
      // Fallback filtering if memberArea object is null but we inferred ID from content
      displayContents = allContents.filter(
        (c) => c.member_area_id === content.member_area_id,
      );
    }

    if (!searchTerm) return displayContents;
    const lowerTerm = searchTerm.toLowerCase();
    return displayContents.filter(
      (c) => c.title.toLowerCase().includes(lowerTerm) || c.id === content?.id,
    );
  }, [allContents, searchTerm, content, memberArea]);

  const collapsedContents = React.useMemo(() => {
    return [...filteredContents].sort((a, b) => {
      if (a.id === content?.id) return -1;
      if (b.id === content?.id) return 1;
      return 0;
    });
  }, [filteredContents, content]);
 
  const totalLockedCount = React.useMemo(() => {
    return filteredContents.filter(
      (c) => c.id !== content?.id && checkAccess(c) === "SALES_MODAL"
    ).length;
  }, [filteredContents, content, accessGrants]);

  useEffect(() => {
    if (searchTerm && filteredModules.length > 0) {
      setIsContentExpanded(true);
      if (filteredModules.length > 0) {
        setExpandedModuleId(filteredModules[0].id);
      }
    }
  }, [searchTerm, filteredModules]);

  const renderModuleTree = (targetContent: Content) => {
    if (!isContentExpanded) return null;

    if (filteredModules.length === 0) {
      return (
        <div className="mt-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">
          {t("course.no_modules_found", "Nenhum modulo encontrado")}
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-3 pl-2 relative">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-[-16px] bottom-6 w-px z-0 pointer-events-none"
          style={{ backgroundColor: `${primaryColor}24` }}
        />
        {filteredModules.map((module, moduleIndex) => {
          const isExpanded = expandedModuleId === module.id;
          const moduleAccess = checkAccess(module, {
            content: targetContent,
            module,
          });
          const isLockedModule = moduleAccess === "SALES_MODAL";
          const moduleLessons = module.lessons || [];
          const isModuleFree = module.is_free || targetContent.is_free;
          const completedLessons = moduleLessons.filter(
            (lesson) => progressMap[lesson.id],
          ).length;
          const moduleProgress =
            moduleLessons.length > 0
              ? Math.round((completedLessons / moduleLessons.length) * 100)
              : 0;
          const moduleCover = getModuleCoverImage(module, targetContent);
          return (
            <div
              key={module.id}
              className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#121620]/60 shadow-[0_4px_24px_rgba(0,0,0,0.15)] backdrop-blur-xl transition-all"
              style={
                isExpanded
                  ? {
                      borderColor: `${primaryColor}25`,
                      background: `linear-gradient(180deg, ${primaryColor}08 0%, rgba(255,255,255,0.02) 100%)`,
                      boxShadow: `0 12px 32px ${primaryColor}0d`,
                    }
                  : undefined
              }
            >
              {isExpanded && (
                <div
                  className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-r-full"
                  style={{
                    backgroundColor: primaryColor,
                    boxShadow: `0 0 12px ${primaryColor}55`,
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => handleModuleSelect(module)}
                className={`relative flex w-full flex-col overflow-hidden text-left transition-all p-4 ${isExpanded ? "bg-white/[0.015]" : "hover:bg-white/[0.015]"}`}
              >
                <div className="relative w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] backdrop-blur-sm"
                      style={{
                        borderColor: isExpanded ? `${primaryColor}40` : "rgba(255,255,255,0.08)",
                        color: isExpanded ? primaryColor : "rgba(255,255,255,0.6)",
                        backgroundColor: isExpanded ? `${primaryColor}12` : "rgba(255,255,255,0.02)",
                      }}
                    >
                      {t("course.module_label", "Módulo")}{" "}
                      {String(moduleIndex + 1).padStart(2, "0")}
                    </span>
                    {isModuleFree && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 border border-green-500/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-green-400">
                        {t("track.free", "Gratuito")}
                      </span>
                    )}
                    {!isLockedModule && completedLessons > 0 && (
                      <span
                        className="inline-flex rounded-full border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/50"
                      >
                        {completedLessons}/{moduleLessons.length}{" "}
                        {t("course.completed", "Concluída")}
                      </span>
                    )}
                  </div>

                  <p
                    className="mt-2.5 text-sm font-bold leading-snug text-white/90 transition-colors line-clamp-2"
                    style={isExpanded ? { color: primaryColor } : undefined}
                  >
                    {module.title}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-[0.14em]">
                    <span>
                      {t("course.lesson_count", "{{count}} aulas", {
                        count: moduleLessons.length,
                      })}
                    </span>
                    {!isLockedModule && (
                      <span>
                        {moduleProgress}% {t("course.progress_label", "Progresso")}
                      </span>
                    )}
                  </div>

                  {!isLockedModule && (
                    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${moduleProgress}%`,
                          backgroundColor: primaryColor,
                        }}
                      />
                    </div>
                  )}

                  <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">
                      {isLockedModule
                        ? t("course.click_to_unlock", "Clique para desbloquear")
                        : isExpanded
                          ? t("course.lessons_opened", "Aulas abertas")
                          : t(
                              "course.expand_lessons",
                              "Clique para abrir as aulas",
                            )}
                    </p>

                    {isLockedModule ? (
                      <span
                        className="rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/90"
                        style={{
                          borderColor: `${primaryColor}3D`,
                          backgroundColor: `${primaryColor}18`,
                        }}
                      >
                        {t("course.unlock_cta", "Desbloquear")}
                      </span>
                    ) : (
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-white/60 transition-colors"
                        style={
                          isExpanded
                            ? {
                                borderColor: `${primaryColor}20`,
                                color: primaryColor,
                                backgroundColor: `${primaryColor}08`,
                              }
                            : undefined
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div
                  className="relative border-t border-white/5 bg-black/25 pl-4 pr-3 py-3"
                >
                  {/* Linha vertical de conexão da árvore */}
                  <div className="absolute left-[37px] top-0 bottom-0 w-px bg-white/5 z-0 pointer-events-none" />

                  <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1 custom-scrollbar relative z-10">
                    {moduleLessons.length > 0 ? (
                      moduleLessons.map((lesson, lessonIndex) => {
                        const lessonAccess = checkAccess(lesson, {
                          content: targetContent,
                          module,
                        });
                        const isLockedLesson = lessonAccess === "SALES_MODAL";
                        const isCurrentLesson = currentLesson?.id === lesson.id;
                        const isLessonFree =
                          lesson.is_free ||
                          module.is_free ||
                          targetContent.is_free;
                        const lessonDuration = formatLessonDuration(
                          lesson.duration,
                        );
                        const isCompletedLesson = Boolean(
                          progressMap[lesson.id],
                        );

                        return (
                          <button
                            type="button"
                            key={lesson.id}
                            onClick={() => handleLessonSelect(lesson)}
                            className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all z-10 ${
                              isCurrentLesson
                                ? "border-white/10 bg-white/[0.04] shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
                                : "border-transparent bg-transparent hover:bg-white/[0.02]"
                            }`}
                            style={
                              isCurrentLesson
                                ? {
                                    borderColor: `${primaryColor}22`,
                                    backgroundColor: `${primaryColor}0d`,
                                  }
                                : undefined
                            }
                          >
                            {isCurrentLesson && (
                              <div
                                className="absolute inset-y-2 left-0 w-[2px] rounded-r-full"
                                style={{
                                  backgroundColor: primaryColor,
                                  boxShadow: `0 0 12px ${primaryColor}55`,
                                }}
                              />
                            )}
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-[#0D1118] text-[10px] font-bold text-white/50 z-10 transition-colors"
                              style={
                                isCurrentLesson
                                  ? {
                                      borderColor: `${primaryColor}40`,
                                      color: primaryColor,
                                      backgroundColor: `${primaryColor}12`,
                                    }
                                  : undefined
                              }
                            >
                              {isCurrentLesson ? (
                                <Play className="h-3 w-3 fill-current" />
                              ) : isCompletedLesson ? (
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                String(lessonIndex + 1).padStart(2, "0")
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p
                                  className="min-w-0 flex-1 truncate text-xs font-semibold text-white/90"
                                  style={
                                    isCurrentLesson
                                      ? { color: primaryColor }
                                      : undefined
                                  }
                                >
                                  {lesson.title}
                                </p>
                                {isLessonFree && (
                                  <span className="hidden rounded-full bg-green-500/20 border border-green-500/30 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-green-400 sm:inline-flex">
                                    {t("track.free", "Gratuito")}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`mt-0.5 flex items-center gap-2 overflow-hidden text-[9px] uppercase tracking-[0.12em] ${isLockedLesson ? "text-white/40" : "text-gray-500"}`}
                              >
                                <span>
                                  {t("course.lesson_label", "Aula")}{" "}
                                  {String(lessonIndex + 1).padStart(2, "0")}
                                </span>
                                {lessonDuration && (
                                  <span>• {lessonDuration}</span>
                                )}
                                <span className="truncate hidden sm:inline">
                                  • {isLockedLesson
                                    ? t(
                                        "content_modules.lesson_locked",
                                        "Bloqueado",
                                      )
                                    : isCurrentLesson
                                      ? t(
                                          "course.current_lesson_badge",
                                          "Em reprodução",
                                        )
                                      : t(
                                          "content_modules.lesson_open",
                                          "Abrir",
                                        )}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center">
                              {isLockedLesson ? (
                                <Lock className="h-3.5 w-3.5 text-white/40" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-white/20 transition-all group-hover:text-white/60 group-hover:translate-x-0.5" />
                              )}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                        {t(
                          "course.no_lessons_in_module",
                          "Sem aulas neste modulo",
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const handleCollapsedContentClick = (targetContent: Content) => {
    setSidebarOpen(true);
    if (targetContent.id === content?.id) {
      setIsContentExpanded(true);
      return;
    }
    handleContentSelect(targetContent);
  };

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
              fixed md:static inset-x-0 bottom-0 z-40 md:z-50 bg-gradient-to-b from-[#0f131a] to-[#0b0f16] flex flex-col transition-all duration-300 md:ml-16 md:mr-4
              /* Mobile: Top-16 (header), Bottom-0 */
              top-16 w-full md:w-auto
              /* Desktop: Top-0, Bottom-0 */
              md:inset-y-0 md:top-0
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
              ${sidebarOpen ? "md:w-[24rem]" : "md:w-[6rem]"}
            `}
      >
        {sidebarOpen ? (
          <>
            <div className="p-4 pb-3 flex items-center justify-between gap-2 sticky top-0 bg-[#0f131a]/95 backdrop-blur-sm z-20">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                <input
                  id="search-input"
                  type="text"
                  placeholder={t(
                    "course.search_placeholder",
                    "Buscar conteÃƒÂºdo",
                  )}
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
            <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-4 custom-scrollbar">
              {(() => {
                const lockedContents = filteredContents.filter(c => {
                  const isCurrentContent = c.id === content?.id;
                  const accessAction = checkAccess(c);
                  return !isCurrentContent && accessAction === "SALES_MODAL";
                });

                const accessibleContents = filteredContents.filter(c => {
                  const isCurrentContent = c.id === content?.id;
                  const accessAction = checkAccess(c);
                  return isCurrentContent || accessAction !== "SALES_MODAL";
                });

                const renderContentCard = (c: Content, isLockedContent: boolean, index: number) => {
                  const isCurrentContent = c.id === content?.id;
                  const imageUrl = getContentCoverImage(c);
                  const displayTitle = isLockedContent
                    ? c.associated_product?.name || c.title
                    : c.title;
                  const secondaryTitle =
                    isLockedContent &&
                    c.associated_product?.name &&
                    c.associated_product.name !== c.title
                      ? c.title
                      : null;
                  const displaySubtitle =
                    secondaryTitle ||
                    (!isLockedContent &&
                    c.associated_product?.name &&
                    c.associated_product.name !== c.title
                      ? c.associated_product.name
                      : null);
                  const displayModuleCount = isCurrentContent
                    ? modules.length
                    : c.modules_count || 0;
                  const displayLessonCount = isCurrentContent
                    ? modules.reduce(
                        (total, module) => total + (module.lessons?.length || 0),
                        0,
                      )
                    : null;
 
                  const lockedCardStyle = isLockedContent
                    ? {
                        background: "rgba(10, 13, 20, 0.25)",
                        borderColor: "rgba(255, 255, 255, 0.03)",
                      }
                    : undefined;
                  const lockedBadgeStyle = isLockedContent
                    ? {
                        borderColor: "rgba(255, 255, 255, 0.05)",
                        backgroundColor: "rgba(255, 255, 255, 0.02)",
                        color: "rgba(255, 255, 255, 0.4)",
                      }
                    : undefined;
 
                  return (
                    <div key={c.id} className="relative">
                      <div
                        className={`relative overflow-hidden rounded-[2rem] border cursor-pointer transition-all duration-300 group ${
                          isCurrentContent
                            ? "shadow-[0_20px_46px_rgba(0,0,0,0.24)]"
                            : isLockedContent
                              ? "border-dashed backdrop-blur-sm hover:bg-[#0a0d16]/30 hover:border-white/10 opacity-60 hover:opacity-90"
                              : "hover:-translate-y-[1px]"
                        }`}
                        style={
                          isCurrentContent
                            ? {
                                background: `linear-gradient(135deg, ${primaryColor}14 0%, rgba(255,255,255,0.04) 36%, rgba(255,255,255,0.02) 100%)`,
                                borderColor: `${primaryColor}44`,
                                boxShadow: `0 16px 36px ${primaryColor}14`,
                              }
                            : isLockedContent
                              ? lockedCardStyle
                              : {
                                  background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))",
                                  borderColor: "rgba(255, 255, 255, 0.08)",
                                }
                        }
                        onClick={() => handleContentSelect(c)}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-80">
                          <div
                            className="absolute inset-0"
                            style={{
                              background: `linear-gradient(90deg, ${primaryColor}12 0%, transparent 80%)`,
                            }}
                          />
                          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-white/5 blur-3xl" />
                        </div>
                        {isCurrentContent && (
                          <div
                            className="pointer-events-none absolute inset-y-4 left-0 w-[4px] rounded-r-full"
                            style={{
                              backgroundColor: primaryColor,
                              boxShadow: `0 0 16px ${primaryColor}66`,
                            }}
                          />
                        )}
 
                        <div className="relative flex items-stretch gap-4 p-3.5">
                          <div className="relative h-[86px] w-[74px] shrink-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/20">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                className={`h-full w-full object-cover ${isLockedContent ? "grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-75 transition-all duration-500" : ""}`}
                              />
                            ) : (
                              <div
                                className={`flex h-full w-full items-center justify-center ${isLockedContent ? "text-white/40 bg-white/[0.01]" : "bg-white/10 text-white/70"}`}
                                style={
                                  isLockedContent
                                    ? {
                                        borderColor: "rgba(255,255,255,0.05)",
                                      }
                                    : undefined
                                }
                              >
                                <Lock size={16} />
                              </div>
                            )}
                            {isLockedContent && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 backdrop-blur-[0.5px]">
                                <Lock size={16} className="text-white/60" />
                              </div>
                            )}
                          </div>
 
                          <div className="min-w-0 flex-1 py-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${isLockedContent ? "border-white/5 bg-white/[0.02] text-white/30" : "border-white/10 bg-white/5 text-white/80"}`}>
                                Produto
                              </span>
                              {isLockedContent && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] backdrop-blur-sm"
                                  style={lockedBadgeStyle}
                                >
                                  <Lock className="w-3 h-3" />
                                  {t("course.locked_badge", "Bloqueado")}
                                </span>
                              )}
                            </div>
                            <h3
                              className={`line-clamp-1 text-[15px] font-black leading-tight ${isCurrentContent ? "text-white" : isLockedContent ? "text-white/45 group-hover:text-white/70 transition-colors" : "text-gray-100"}`}
                              style={
                                isCurrentContent ? { color: primaryColor } : {}
                              }
                            >
                              {displayTitle}
                            </h3>
                            {displaySubtitle && (
                              <p className={`mt-1 line-clamp-1 text-[11px] ${isLockedContent ? "text-gray-500/70" : "text-gray-400/80"}`}>
                                {displaySubtitle}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                              {displayModuleCount > 0 && (
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${isLockedContent ? "border-white/5 bg-white/[0.01] text-white/30" : "border-white/10 bg-black/20 text-white/70"}`}>
                                  {displayModuleCount}{" "}
                                  {displayModuleCount === 1
                                    ? "módulo"
                                    : "módulos"}
                                </span>
                              )}
                              {displayLessonCount !== null &&
                                displayLessonCount > 0 && (
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${isLockedContent ? "border-white/5 bg-white/[0.01] text-white/30" : "border-white/10 bg-black/20 text-white/70"}`}>
                                    {displayLessonCount}{" "}
                                    {displayLessonCount === 1 ? "aula" : "aulas"}
                                  </span>
                                )}
                            </div>
                            <p
                              className={`mt-3 text-[10px] uppercase tracking-[0.16em] ${isLockedContent ? "text-white/30" : "text-gray-500"}`}
                            >
                              {isLockedContent
                                ? t(
                                    "course.click_to_unlock",
                                    "Clique para desbloquear",
                                  )
                                : isCurrentContent
                                  ? t(
                                      "course.expand_lessons",
                                      "Clique para abrir as aulas",
                                    )
                                  : t(
                                      "course.click_to_access",
                                      "Clique para acessar",
                                    )}
                            </p>
                          </div>
 
                          <div className="flex shrink-0 items-center">
                            {isCurrentContent ? (
                              <div
                                className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5"
                                style={{
                                  borderColor: `${primaryColor}26`,
                                  color: primaryColor,
                                  backgroundColor: `${primaryColor}10`,
                                }}
                              >
                                {isContentExpanded ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </div>
                            ) : isLockedContent ? (
                              <>
                                <span
                                  className="hidden md:inline-flex rounded-full px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white transition-all hover:scale-105 shadow-md animate-pulse"
                                  style={{
                                    backgroundColor: primaryColor,
                                    boxShadow: `0 2px 8px ${primaryColor}40`,
                                  }}
                                >
                                  {t("course.unlock_cta", "Desbloquear")}
                                </span>
                                <div className="flex md:hidden h-8 w-8 items-center justify-center rounded-full border border-white/5 bg-white/[0.02] text-white/40">
                                  <Lock size={12} />
                                </div>
                              </>
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-gray-500">
                                <ChevronRight size={16} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
 
                      {isCurrentContent && renderModuleTree(c)}
                    </div>
                  );
                };
 
                return (
                  <React.Fragment>
                    {/* 1. Produtos Bloqueados (Vitrine) no Topo */}
                    {lockedContents.length > 0 && (
                      <React.Fragment>
                        {/* Primeiro card bloqueado (teaser) */}
                        {renderContentCard(lockedContents[0], true, 0)}

                        {/* Demais cards bloqueados (se expandido) */}
                        {showAllLocked &&
                          lockedContents.slice(1).map((c, idx) => renderContentCard(c, true, idx + 1))}

                        {/* Botão expansor na fronteira da seção bloqueada */}
                        {lockedContents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setShowAllLocked(!showAllLocked)}
                            className="w-full mt-1.5 mb-4 rounded-[1.5rem] border border-dashed border-white/5 bg-black/20 hover:bg-[#0a0d16]/30 hover:border-white/10 px-4 py-3 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-white transition-all duration-300 group"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-white/40">
                                <Lock size={12} className="group-hover:text-white/60 transition-colors" />
                              </div>
                              <span>
                                {showAllLocked
                                  ? t("course.hide_locked_products", "Ocultar outros produtos bloqueados")
                                  : t("course.show_locked_products", `+ ${lockedContents.length - 1} produtos para desbloquear`)}
                              </span>
                            </div>
                            <ChevronDown
                              size={14}
                              className={`text-white/40 group-hover:text-white/60 transition-transform duration-300 ${showAllLocked ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}
                      </React.Fragment>
                    )}

                    {/* 2. Produtos Acessíveis (Liberados / Ativos) */}
                    {accessibleContents.map((c, idx) => renderContentCard(c, false, idx))}
                  </React.Fragment>
                );
              })()}
            </div>
          </>
        ) : (
          <div className="hidden h-full flex-col items-center gap-3 px-3 py-4 md:flex">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/80 transition-all hover:bg-white/[0.08]"
              style={{ color: primaryColor }}
              title="Abrir menu"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>

                   <div className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto custom-scrollbar">
              {collapsedContents.map((item) => {
                const imageUrl = getContentCoverImage(item);
                const isCurrentContent = item.id === content?.id;
                const accessAction = checkAccess(item);
                const isLockedContent = !isCurrentContent && accessAction === "SALES_MODAL";
                const label = item.associated_product?.name || item.title;
 
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleCollapsedContentClick(item)}
                    className={`group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border transition-all duration-300 ${
                      isCurrentContent
                        ? "shadow-[0_12px_26px_rgba(0,0,0,0.2)]"
                        : isLockedContent
                          ? "border-dashed border-white/5 bg-black/40 opacity-50 hover:opacity-85 hover:scale-105"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.08] hover:scale-105 hover:-translate-y-[1px]"
                    }`}
                    style={
                      isCurrentContent
                        ? {
                            borderColor: `${primaryColor}66`,
                            backgroundColor: `${primaryColor}15`,
                            boxShadow: `0 8px 24px ${primaryColor}20`,
                          }
                        : undefined
                    }
                    title={label}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={label}
                        className={`h-full w-full object-cover transition-all duration-500 ${isLockedContent ? "grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-75" : ""}`}
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-[11px] font-black transition-colors duration-300"
                        style={
                          isLockedContent
                            ? { backgroundColor: "rgba(255, 255, 255, 0.03)", color: "rgba(255, 255, 255, 0.3)" }
                            : { backgroundColor: primaryColor, color: "#000" }
                        }
                      >
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div
                      className={`absolute inset-0 ${isCurrentContent ? "bg-black/10" : "bg-black/25 group-hover:bg-black/10"} transition-colors`}
                    />
                    {isLockedContent && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10 backdrop-blur-[0.5px]">
                        <div className="p-1.5 rounded-lg bg-black/60 border border-white/10 text-white/60">
                          <Lock size={11} />
                        </div>
                      </div>
                    )}
                    {isCurrentContent && (
                      <div
                        className="absolute bottom-1 h-1.5 w-6 rounded-full"
                        style={{
                          backgroundColor: primaryColor,
                          boxShadow: `0 0 12px ${primaryColor}55`,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col h-full relative">
        <div className="LESSON-WRAP flex-1 overflow-y-auto bg-[#0D1118] p-4 md:p-8 pt-20 md:pt-16 flex justify-center">
          {loading ? (
            <div className="flex items-center justify-center h-64 w-full">
              <div
                className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full"
                style={{
                  borderColor: `${primaryColor} transparent transparent transparent`,
                }}
              ></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 w-full text-center">
              <div>
                <p className="text-red-500 font-bold mb-2">
                  {t("course.error_title", "Erro")}
                </p>
                <p className="text-gray-400">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-sm font-medium"
                >
                  {t("course.try_again", "Tentar novamente")}
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
