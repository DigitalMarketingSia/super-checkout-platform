import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Content, Module, Lesson, Product, MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { ConfirmModal, AlertModal } from '../../components/ui/Modal';
import {
    ArrowLeft, Save, Upload, Plus, Trash2, Edit2, GripVertical, Video, FileText, Link as LinkIcon, File as FileIcon, MoreVertical, ChevronDown, ChevronRight, Layers, Lock, Terminal, Activity, Globe, Monitor, Smartphone, Layout as LayoutIcon
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LessonEditorModal } from '../../components/admin/LessonEditorModal';
import { useTranslation } from 'react-i18next';

export const ContentEditor = () => {
    const { t } = useTranslation(['admin', 'common']);
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const areaId = searchParams.get('areaId');
    const isNew = !id || id === 'new';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [area, setArea] = useState<MemberArea | null>(null);
    const [content, setContent] = useState<Content>({
        id: '',
        title: '',
        description: '',
        thumbnail_url: '',
        type: 'course',
        member_area_id: areaId || '',
        created_at: '',
        updated_at: ''
    });

    const [modules, setModules] = useState<Module[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>('');

    // Upload State
    const [uploading, setUploading] = useState(false);
    const horizontalInputRef = useRef<HTMLInputElement>(null);
    const moduleVerticalInputRef = useRef<HTMLInputElement>(null);
    const moduleHorizontalInputRef = useRef<HTMLInputElement>(null);

    // Modal States
    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false, title: '', message: '', variant: 'info'
    });

    // Module/Lesson Editing State
    const [editingModule, setEditingModule] = useState<Module | null>(null);
    const [editingLesson, setEditingLesson] = useState<{ lesson: Lesson, moduleId: string } | null>(null);
    const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
    const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);

    // Expanded Modules State (for UI toggle)
    const [activeTab, setActiveTab] = useState<'info' | 'structure'>('info');
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!isNew && id) {
            loadData(id);
        } else {
            setContent(prev => ({ ...prev, id: crypto.randomUUID(), member_area_id: areaId || '' }));
            if (areaId) loadArea(areaId);
            setLoading(false);
            storage.getProducts().then(setProducts);
        }
    }, [id, areaId]);

    const loadArea = async (aId: string) => {
        try {
            const areaData = await storage.getMemberAreaById(aId);
            if (areaData) setArea(areaData);
        } catch (error) {
            console.error('Error loading area:', error);
        }
    };

    const loadData = async (contentId: string) => {
        setLoading(true);
        try {
            const contents = await storage.getContents();
            const found = contents.find(c => c.id === contentId);
            if (found) {
                setContent(found);
                setSelectedProductId(found.associated_product?.id || '');
                const modulesData = await storage.getModules(contentId);
                setModules(modulesData);
                // Expand all by default
                const expanded: Record<string, boolean> = {};
                modulesData.forEach(m => expanded[m.id] = true);
                setExpandedModules(expanded);
                
                // Load Area context
                if (found.member_area_id) loadArea(found.member_area_id);
            } else {
                navigate('/admin/members');
            }

            const productsData = await storage.getProducts();
            setProducts(productsData);
        } catch (error) {
            console.error('Error loading content:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.load_error', 'Erro ao carregar conteúdo.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
        setAlertState({ isOpen: true, title, message, variant });
    };

    const handleSaveContent = async () => {
        setSaving(true);
        try {
            if (isNew) {
                if (!content.member_area_id) {
                    showAlert(t('common.error', 'Erro'), t('content_editor.missing_area_id', 'Erro interno: ID da área de membros não encontrado.'), 'error');
                    return;
                }
                await storage.createContent(content, selectedProductId || undefined);
                navigate(`/admin/contents/${content.id}`, { replace: true });
            } else {
                await storage.updateContent(content, selectedProductId || undefined);
            }
            showAlert(t('common.success', 'Sucesso'), t('content_editor.save_success', 'Conteúdo salvo com sucesso!'), 'success');
        } catch (error: any) {
            console.error('Error saving content:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.save_error', 'Erro ao salvar conteúdo: ') + (error.message || error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleBack = () => {
        if (content.member_area_id) {
            navigate(`/admin/members/${content.member_area_id}`);
        } else {
            navigate('/admin/members');
        }
    };

    const handleContentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'vertical' | 'horizontal') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                setUploading(true);
                const publicUrl = await storage.uploadContentImage(file, content.id, type);
                if (type === 'vertical') {
                    setContent({ ...content, image_vertical_url: publicUrl });
                } else {
                    setContent({ ...content, image_horizontal_url: publicUrl, thumbnail_url: publicUrl });
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                showAlert(t('common.error', 'Erro'), t('common.upload_error', 'Erro ao fazer upload da imagem.'), 'error');
            } finally {
                setUploading(false);
            }
        }
    };

    const handleModuleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, moduleId: string, type: 'vertical' | 'horizontal') => {
        if (e.target.files && e.target.files[0] && editingModule) {
            const file = e.target.files[0];
            try {
                setUploading(true);
                const publicUrl = await storage.uploadModuleImage(file, moduleId, type);
                setEditingModule({
                    ...editingModule,
                    [type === 'vertical' ? 'image_vertical_url' : 'image_horizontal_url']: publicUrl
                });
            } catch (error) {
                console.error('Error uploading module image:', error);
                showAlert(t('common.error', 'Erro'), t('common.upload_error', 'Erro ao fazer upload da imagem.'), 'error');
            } finally {
                setUploading(false);
            }
        }
    };

    const handleCreateModule = async () => {
        const newModule: Module = {
            id: crypto.randomUUID(),
            content_id: content.id,
            title: 'Novo Módulo',
            description: '',
            order_index: modules.length,
            created_at: new Date().toISOString(),
            lessons: []
        };
        setModules([...modules, newModule]);
        setExpandedModules({ ...expandedModules, [newModule.id]: true });

        try {
            await storage.createModule(newModule);
            setEditingModule(newModule);
            setIsModuleModalOpen(true);
        } catch (error) {
            console.error('Error creating module:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.create_module_error', 'Erro ao criar módulo.'), 'error');
            loadData(content.id);
        }
    };

    const handleUpdateModule = async (module: Module) => {
        try {
            await storage.updateModule(module);
            setModules(modules.map(m => m.id === module.id ? module : m));
            setIsModuleModalOpen(false);
        } catch (error) {
            console.error('Error updating module:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.update_module_error', 'Erro ao atualizar módulo.'), 'error');
        }
    };

    const handleDeleteModule = async (moduleId: string) => {
        if (!confirm(t('content_editor.delete_module_confirm', 'Tem certeza que deseja excluir este módulo e todas as suas aulas?'))) return;
        try {
            await storage.deleteModule(moduleId);
            setModules(modules.filter(m => m.id !== moduleId));
        } catch (error) {
            console.error('Error deleting module:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.delete_module_error', 'Erro ao excluir módulo.'), 'error');
        }
    };

    const handleCreateLesson = async (moduleId: string) => {
        const module = modules.find(m => m.id === moduleId);
        if (!module) return;

        const newLesson: Lesson = {
            id: crypto.randomUUID(),
            module_id: moduleId,
            title: 'Nova Aula',
            content_type: 'video',
            order_index: module.lessons?.length || 0,
            is_free: false,
            created_at: new Date().toISOString()
        };

        const updatedModules = modules.map(m => {
            if (m.id === moduleId) {
                return { ...m, lessons: [...(m.lessons || []), newLesson] };
            }
            return m;
        });
        setModules(updatedModules);

        try {
            await storage.createLesson(newLesson);
            setEditingLesson({ lesson: newLesson, moduleId });
            setIsLessonModalOpen(true);
        } catch (error) {
            console.error('Error creating lesson:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.create_lesson_error', 'Erro ao criar aula.'), 'error');
            loadData(content.id);
        }
    };

    const handleUpdateLesson = async (lesson: Lesson) => {
        try {
            await storage.updateLesson(lesson);
            const updatedModules = modules.map(m => {
                if (m.id === lesson.module_id) {
                    return {
                        ...m,
                        lessons: m.lessons?.map(l => l.id === lesson.id ? lesson : l)
                    };
                }
                return m;
            });
            setModules(updatedModules);
            setIsLessonModalOpen(false);
        } catch (error) {
            console.error('Error updating lesson:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.update_lesson_error', 'Erro ao atualizar aula.'), 'error');
        }
    };

    const handleDeleteLesson = async (lessonId: string, moduleId: string) => {
        if (!confirm(t('content_editor.delete_lesson_confirm', 'Tem certeza que deseja excluir esta aula?'))) return;
        try {
            await storage.deleteLesson(lessonId);
            const updatedModules = modules.map(m => {
                if (m.id === moduleId) {
                    return {
                        ...m,
                        lessons: m.lessons?.filter(l => l.id !== lessonId)
                    };
                }
                return m;
            });
            setModules(updatedModules);
        } catch (error) {
            console.error('Error deleting lesson:', error);
            showAlert(t('common.error', 'Erro'), t('content_editor.delete_lesson_error', 'Erro ao excluir aula.'), 'error');
        }
    };

    const toggleModule = (moduleId: string) => {
        setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4" />
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest font-mono italic">Syncing Content Data...</p>
                </div>
            </Layout>
        );
    }

    const primaryColor = area?.primary_color || '#8A2BE2';

    return (
        <Layout>
            <div className="animate-in slide-in-from-bottom-2 duration-700 pb-20">
                {/* Tactical Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={handleBack} 
                            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                            <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Terminal className="w-3 h-3 text-purple-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono italic">Content Architect</span>
                            </div>
                            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
                                {isNew ? 'New Content' : 'Edit Content'}
                            </h1>
                            <p className="text-white/30 text-xs font-bold font-mono tracking-tight mt-1">{content.title || 'Untitled Archive'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end mr-2">
                             <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest leading-none mb-1">Integrity Status</span>
                             <div className="flex items-center gap-2">
                                 <span className="text-xs font-bold text-blue-500 uppercase tracking-tighter italic">Secured</span>
                                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                             </div>
                        </div>
                        <Button 
                            onClick={handleSaveContent} 
                            isLoading={saving}
                            className="px-8 py-6 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase italic tracking-tighter transition-all flex items-center gap-3"
                        >
                            {saving ? <Activity className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Commit Changes
                        </Button>
                    </div>
                </div>

                {/* Tactical Tabs */}
                <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2 no-scrollbar">
                    <button
                        onClick={() => setActiveTab('info')}
                        className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-xs font-black uppercase italic tracking-tight transition-all relative overflow-hidden group border ${
                            activeTab === 'info' 
                            ? 'bg-white/5 border-purple-500/40 text-white shadow-[0_0_20px_rgba(147,51,234,0.1)]' 
                            : 'bg-transparent border-white/5 text-white/40 hover:text-white hover:bg-white/5 hover:border-white/10'
                        }`}
                    >
                        {activeTab === 'info' && <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent animate-pulse" />}
                        <FileText className={`w-4 h-4 ${activeTab === 'info' ? 'text-purple-400' : 'text-white/20 group-hover:text-white/60'}`} />
                        <span className="relative z-10">Basic Intel</span>
                        {activeTab === 'info' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${primaryColor}, transparent)` }} />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('structure')}
                        disabled={isNew}
                        className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-xs font-black uppercase italic tracking-tight transition-all relative overflow-hidden group border ${
                            activeTab === 'structure' 
                            ? 'bg-white/5 border-purple-500/40 text-white shadow-[0_0_20px_rgba(147,51,234,0.1)]' 
                            : 'bg-transparent border-white/5 text-white/40 hover:text-white hover:bg-white/5 hover:border-white/10'
                        } ${isNew ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                        {activeTab === 'structure' && <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent animate-pulse" />}
                        <Layers className={`w-4 h-4 ${activeTab === 'structure' ? 'text-purple-400' : 'text-white/20 group-hover:text-white/60'}`} />
                        <span className="relative z-10">Module Tree</span>
                        {activeTab === 'structure' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${primaryColor}, transparent)` }} />
                        )}
                    </button>
                </div>

                {/* Tab: Info */}
                <div className="animate-in fade-in duration-500">
                    {activeTab === 'info' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                            {/* Left Column: Visuals */}
                            <div className="lg:col-span-4 space-y-8">
                                <div className="bg-[#0A0A15]/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-8">
                                    <h3 className="text-xs font-black text-white italic uppercase tracking-widest mb-6 opacity-40">Visual Identity</h3>
                                    <div className="relative w-full aspect-video rounded-3xl bg-black/40 border border-white/10 overflow-hidden mb-6 group">
                                        {content.image_horizontal_url ? (
                                            <>
                                                <img src={content.image_horizontal_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm">
                                                    <Button variant="secondary" size="sm" onClick={() => horizontalInputRef.current?.click()} className="rounded-xl font-bold uppercase italic text-[10px] tracking-widest">
                                                       Replace Asset
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors group" onClick={() => horizontalInputRef.current?.click()}>
                                                <Upload className="w-10 h-10 text-white/20 mb-3 group-hover:text-purple-500 transition-colors" />
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Upload Cover (16:9)</span>
                                            </div>
                                        )}
                                        {uploading && (
                                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
                                                <Activity className="w-8 h-8 text-purple-500 animate-spin mb-2" />
                                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Uploading...</span>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" ref={horizontalInputRef} className="hidden" accept="image/*" onChange={(e) => handleContentImageUpload(e, 'horizontal')} />
                                    
                                    <div>
                                        <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-3 block">Asset Blueprint (URL)</label>
                                        <div className="relative">
                                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                            <input
                                                type="text"
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-white font-mono placeholder:text-white/10 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                                                placeholder="https://assets.cdn/..."
                                                value={content.image_horizontal_url || ''}
                                                onChange={e => setContent({ ...content, image_horizontal_url: e.target.value, thumbnail_url: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Meta & Access */}
                            <div className="lg:col-span-8 space-y-10">
                                <div className="bg-[#0A0A15]/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-10 lg:p-12">
                                    <div className="grid grid-cols-1 gap-10">
                                        <div>
                                            <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Core Title</label>
                                            <input
                                                type="text"
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-xl font-bold text-white placeholder:text-white/10 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all italic tracking-tight"
                                                placeholder="Enter Content Designation..."
                                                value={content.title}
                                                onChange={e => setContent({ ...content, title: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Manifest / Description</label>
                                            <textarea
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-white placeholder:text-white/10 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all min-h-[160px] leading-relaxed"
                                                placeholder="Detailed specifications for this content..."
                                                value={content.description}
                                                onChange={e => setContent({ ...content, description: e.target.value })}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block flex items-center gap-2">
                                                    <LayoutIcon className="w-3 h-3 text-purple-400" /> Display Matrix
                                                </label>
                                                <div className="flex bg-black/40 border border-white/10 rounded-2xl p-1.5">
                                                    <button 
                                                        onClick={() => setContent({ ...content, modules_layout: 'horizontal' })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${content.modules_layout !== 'vertical' ? 'bg-white/10 text-white border border-white/10 shadow-lg' : 'text-white/30 hover:text-white'}`}
                                                    >
                                                        <Monitor className="w-3.5 h-3.5" /> Horizontal
                                                    </button>
                                                    <button 
                                                        onClick={() => setContent({ ...content, modules_layout: 'vertical' })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${content.modules_layout === 'vertical' ? 'bg-white/10 text-white border border-white/10 shadow-lg' : 'text-white/30 hover:text-white'}`}
                                                    >
                                                        <Smartphone className="w-3.5 h-3.5" /> Vertical
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block flex items-center gap-2">
                                                    <Lock className="w-3 h-3 text-purple-400" /> Gateway Logic
                                                </label>
                                                <div className="flex bg-black/40 border border-white/10 rounded-2xl p-1.5">
                                                    <button 
                                                        onClick={() => { setContent({ ...content, is_free: true }); setSelectedProductId(''); }}
                                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${content.is_free ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-lg shadow-green-500/5' : 'text-white/30 hover:text-white'}`}
                                                    >
                                                        Public Access
                                                    </button>
                                                    <button 
                                                        onClick={() => setContent({ ...content, is_free: false })}
                                                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase italic transition-all ${!content.is_free ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-lg shadow-purple-500/5' : 'text-white/30 hover:text-white'}`}
                                                    >
                                                        Secured / Paid
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {!content.is_free && (
                                            <div className="animate-in fade-in slide-in-from-top-4">
                                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Linked Production Offer</label>
                                                <select
                                                    value={selectedProductId}
                                                    onChange={(e) => setSelectedProductId(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-white focus:ring-2 focus:ring-purple-500/20 outline-none transition-all font-bold appearance-none cursor-pointer"
                                                >
                                                    <option value="" className="bg-gray-900 text-white/40 italic">Select Linked Product...</option>
                                                    {products.map(product => (
                                                        <option key={product.id} value={product.id} className="bg-gray-900 text-white">
                                                            {product.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab: Structure */}
                    {activeTab === 'structure' && (
                        <div className="max-w-5xl mx-auto space-y-12">
                            <div className="flex items-center justify-between px-4">
                                <div>
                                    <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Content <span className="text-purple-500">Tree</span></h2>
                                    <p className="text-white/30 text-xs font-bold font-mono tracking-tight">Logical structure mapping: {modules.length} Modules</p>
                                </div>
                                <Button 
                                    size="lg" 
                                    className="rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/40 text-white font-black uppercase italic tracking-tighter text-sm flex items-center gap-2 group" 
                                    onClick={handleCreateModule}
                                >
                                    <Plus className="w-4 h-4 text-purple-400 group-hover:rotate-90 transition-transform" /> 
                                    New Module
                                </Button>
                            </div>

                            <div className="space-y-6">
                                {modules.map((module, index) => (
                                    <div key={module.id} className="group/module relative">
                                        {/* Module Bar */}
                                        <div className={`relative z-10 flex items-center justify-between p-6 rounded-[2rem] border transition-all ${expandedModules[module.id] ? 'bg-[#0A0A15]/60 border-purple-500/30 shadow-[0_0_40px_rgba(147,51,234,0.05)]' : 'bg-[#0A0A15]/40 border-white/5 hover:border-white/10'}`}>
                                            <div className="flex items-center gap-6 flex-1 cursor-pointer" onClick={() => toggleModule(module.id)}>
                                                <div className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${expandedModules[module.id] ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/20 group-hover/module:bg-white/10'}`}>
                                                    {expandedModules[module.id] ? <ChevronDown className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">
                                                            {module.title}
                                                        </h4>
                                                        {module.is_free && (
                                                            <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded text-[9px] font-black text-green-400 uppercase italic">Free Gateway</span>
                                                        )}
                                                        {module.is_published === false && (
                                                            <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-[9px] font-black text-yellow-400 uppercase italic">Draft</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-bold font-mono text-white/20 uppercase tracking-widest mt-1">
                                                        Sequence ID: {String(index + 1).padStart(2, '0')} // {module.lessons?.length || 0} Assets
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => { setEditingModule(module); setIsModuleModalOpen(true); }} className="w-10 h-10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 rounded-xl transition-all" title="Edit Properties">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDeleteModule(module.id)} className="w-10 h-10 flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all" title="Wipe Module">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <div className="w-px h-6 bg-white/10 mx-1" />
                                                <Button size="sm" onClick={() => handleCreateLesson(module.id)} className="rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-black uppercase italic tracking-tighter px-5">
                                                    Deploy Lesson
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Lessons List in a Glass Surface */}
                                        {expandedModules[module.id] && (
                                            <div className="mt-4 ml-10 space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
                                                {module.lessons && module.lessons.length > 0 ? (
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {module.lessons.map((lesson, lIdx) => (
                                                            <div key={lesson.id} className="group/lesson flex items-center justify-between p-4 pl-6 bg-[#0A0A15]/40 border border-white/5 hover:border-white/10 rounded-2xl transition-all hover:bg-white/5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                                                                        lesson.content_type === 'video' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                                        lesson.content_type === 'text' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                                                        'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                                    }`}>
                                                                        {lesson.content_type === 'video' ? <Video className="w-4 h-4" /> :
                                                                         lesson.content_type === 'text' ? <FileText className="w-4 h-4" /> :
                                                                         <FileIcon className="w-4 h-4" />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-bold text-white tracking-tight">{lesson.title}</span>
                                                                            {lesson.is_free && <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-black uppercase italic">Free</span>}
                                                                        </div>
                                                                        <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">{String(lIdx + 1).padStart(2, '0')} // Operational</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                                                                    <button onClick={() => { setEditingLesson({ lesson, moduleId: module.id }); setIsLessonModalOpen(true); }} className="p-2 text-white/20 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteLesson(lesson.id, module.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="p-10 text-center bg-black/20 rounded-3xl border border-white/5 border-dashed">
                                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest italic">No assets deployed in this module.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {modules.length === 0 && (
                                    <div className="p-24 bg-[#0A0A15]/40 border-2 border-dashed border-white/5 rounded-[3rem] text-center flex flex-col items-center justify-center group overflow-hidden relative">
                                        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/5 group-hover:border-purple-500/40 transition-all shadow-2xl shadow-purple-500/0 group-hover:shadow-purple-500/10 group-hover:scale-110 duration-700">
                                            <Plus className="w-12 h-12 text-white/20 group-hover:text-purple-500 transition-colors" />
                                        </div>
                                        <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-4">Initialize <span className="text-purple-500">Architecture</span></h3>
                                        <p className="text-white/30 text-sm font-medium max-w-sm mb-10">Start by deploying your first module to begin curriculum orchestration.</p>
                                        <Button onClick={handleCreateModule} className="px-10 py-5 rounded-2xl bg-white text-black font-black uppercase italic tracking-tighter shadow-xl hover:scale-105 transition-all">
                                            Deploy First Module
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Tactical Module Modal */}
                {isModuleModalOpen && editingModule && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-[#0A0A15]/90 backdrop-blur-xl" onClick={() => setIsModuleModalOpen(false)} />
                        <div className="relative bg-[#0A0A15] border border-white/10 rounded-[3rem] w-full max-w-2xl p-10 lg:p-12 shadow-2xl animate-in zoom-in-95 duration-300">
                            <div className="flex items-center gap-3 mb-10">
                                <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                                    <Terminal className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">Module <span className="text-purple-500">Intel</span></h3>
                                    <p className="text-white/30 text-xs font-bold font-mono tracking-tight mt-1">Configure module blueprint</p>
                                </div>
                            </div>
                            
                            <div className="space-y-8">
                                <div>
                                    <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Module Designation</label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-5 text-xl font-bold text-white focus:ring-2 focus:ring-purple-500/20 outline-none transition-all italic tracking-tight"
                                        value={editingModule.title}
                                        onChange={e => setEditingModule({ ...editingModule, title: e.target.value })}
                                        placeholder="Identification Título..."
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Visual Pivot (Horizontal)</label>
                                        <div className="relative aspect-video rounded-3xl bg-black/40 border border-white/10 overflow-hidden group">
                                            {editingModule.image_horizontal_url ? (
                                                <img src={editingModule.image_horizontal_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => moduleHorizontalInputRef.current?.click()}>
                                                    <Upload className="w-8 h-8 text-white/20" />
                                                </div>
                                            )}
                                        </div>
                                        <input type="file" ref={moduleHorizontalInputRef} className="hidden" accept="image/*" onChange={(e) => handleModuleImageUpload(e, editingModule.id, 'horizontal')} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4 block">Access Mode</label>
                                        <div className="space-y-4">
                                            <label className="flex items-center gap-4 group cursor-pointer">
                                                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${editingModule.is_free ? 'bg-purple-500 border-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]' : 'bg-black/40 border-white/10 group-hover:border-white/20'}`}>
                                                    {editingModule.is_free && <Activity className="w-3 h-3 text-white" />}
                                                </div>
                                                <input type="checkbox" className="hidden" checked={editingModule.is_free || false} onChange={e => setEditingModule({ ...editingModule, is_free: e.target.checked })} />
                                                <div>
                                                    <span className={`text-[11px] font-black uppercase italic tracking-tight transition-colors ${editingModule.is_free ? 'text-white' : 'text-white/30'}`}>Free Sequence</span>
                                                </div>
                                            </label>
                                            <label className="flex items-center gap-4 group cursor-pointer">
                                                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${editingModule.is_published !== false ? 'bg-green-500 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-black/40 border-white/10 group-hover:border-white/20'}`}>
                                                    {editingModule.is_published !== false && <Activity className="w-3 h-3 text-white" />}
                                                </div>
                                                <input type="checkbox" className="hidden" checked={editingModule.is_published !== false} onChange={e => setEditingModule({ ...editingModule, is_published: e.target.checked })} />
                                                <div>
                                                    <span className={`text-[11px] font-black uppercase italic tracking-tight transition-colors ${editingModule.is_published !== false ? 'text-white' : 'text-white/30'}`}>Force Deployment (Published)</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-end gap-4 mt-8">
                                    <button 
                                        onClick={() => setIsModuleModalOpen(false)}
                                        className="px-8 py-5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black uppercase italic tracking-tighter transition-all border border-white/5"
                                    >
                                        Abort
                                    </button>
                                    <button 
                                        onClick={() => handleUpdateModule(editingModule)}
                                        className="px-10 py-5 rounded-2xl bg-white text-black font-black uppercase italic tracking-tighter transition-all shadow-xl"
                                    >
                                        Sync Module
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Lesson Modal */}
                {editingLesson && (
                    <LessonEditorModal
                        isOpen={isLessonModalOpen}
                        onClose={() => setIsLessonModalOpen(false)}
                        onSave={handleUpdateLesson}
                        lesson={editingLesson.lesson}
                        moduleId={editingLesson.moduleId}
                    />
                )}

                <AlertModal
                    isOpen={alertState.isOpen}
                    onClose={() => setAlertState({ ...alertState, isOpen: false })}
                    title={alertState.title}
                    message={alertState.message}
                    variant={alertState.variant}
                />
            </div>
        </Layout >
    );
};
