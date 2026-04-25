import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { storage, supabase } from '../../services/storageService';
import { Content, MemberArea, Module, AccessGrant } from '../../types';
import { Play, ArrowLeft, FileText } from 'lucide-react';
import { useAccessControl } from '../../hooks/useAccessControl';
import { ProductSalesModal } from '../../components/member/ProductSalesModal';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const ContentModules = () => {
    const navigate = useNavigate();
    const { slug, id } = useParams<{ slug: string; id: string }>();
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const [content, setContent] = useState<Content | null>(null);
    const [modules, setModules] = useState<Module[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const { handleAccess } = useAccessControl(accessGrants);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, [slug, id]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (id) {
                // Fetch content details
                const { data: contentData } = await supabase
                    .from('contents')
                    .select('*')
                    .eq('id', id)
                    .single();

                setContent(contentData);

                // Fetch modules
                const modulesData = await storage.getModules(id);
                setModules(modulesData);

                // Fetch access grants
                const grants = await storage.getAccessGrants();
                setAccessGrants(grants);
            }
        } catch (error) {
            console.error('Error loading content modules:', error);
        } finally {
            setLoading(false);
        }
    };

    const appLink = memberArea ? `/app/${memberArea.slug}` : '/app';
    const isVertical = content?.modules_layout === 'vertical';

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
                onClick={() => navigate(appLink)}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> Voltar
            </button>

            <div className="flex flex-col md:flex-row gap-8 mb-12">
                <div className="w-full md:w-1/3 lg:w-1/4">
                    <div className={`aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ${isVertical ? '' : 'aspect-video'}`}>
                        <img
                            src={isVertical ? content.image_vertical_url : content.image_horizontal_url}
                            alt={content.title}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
                <div className="flex-1">
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">{content.title}</h1>
                    <p className="text-gray-400 text-lg leading-relaxed mb-6">{content.description}</p>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <FileText className="w-4 h-4" />
                            {modules.length} Módulos
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <h2 className="text-2xl font-bold text-white">Módulos</h2>
                <div className="grid gap-4">
                    {modules.map((module, index) => (
                        <div
                            key={module.id}
                            onClick={() => {
                                handleAccess(module, {
                                    onAccess: () => navigate(`${appLink}/course/${content.id}?module_id=${module.id}`),
                                    onSalesModal: (product) => {
                                        setSelectedProduct(product);
                                        setIsModalOpen(true);
                                    }
                                });
                            }}
                            className="bg-[#1A1D21] p-4 rounded-xl border border-white/5 hover:border-white/20 transition-all cursor-pointer group flex items-center gap-4"
                        >
                            <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-red-600 transition-colors">
                                <span className="font-bold text-lg">{index + 1}</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white group-hover:text-red-500 transition-colors">{module.title}</h3>
                                <p className="text-sm text-gray-500 line-clamp-1">{module.description}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play className="w-4 h-4 text-white fill-white" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
