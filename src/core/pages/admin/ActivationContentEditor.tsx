import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Layout } from '../../components/Layout';
import { 
    Plus, 
    Trash2, 
    Save, 
    Video, 
    FileText, 
    Link as LinkIcon, 
    Image as ImageIcon, 
    ArrowUp, 
    ArrowDown, 
    Upload, 
    Loader2, 
    X, 
    Rocket,
    Eye,
    EyeOff,
    Monitor,
    Smartphone,
    GripVertical,
    ChevronDown,
    ChevronUp,
    Zap,
    ExternalLink,
    Download,
    ChevronLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface ContentItem {
    id: string;
    title: string;
    type: string; 
    content: string;
    video_url?: string;
    file_url?: string;
    image_url?: string;
    description: string;
    plan_scope: string;
    order: number;
    active: boolean;
    content_order?: string[];
}

const SECTION_LABELS: Record<string, string> = {
    video: 'Vídeo (YouTube)',
    text: 'Texto (Corpo)',
    image: 'Imagem (Capa/Banner)',
    file: 'Download (Arquivo)',
    link: 'Link Externo'
};

const SECTION_COLORS: Record<string, string> = {
    video: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    text: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    image: 'text-green-400 bg-green-500/10 border-green-500/20',
    file: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    link: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
};

export const ActivationContentEditor = () => {
    const [items, setItems] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<ContentItem>>({});
    const [uploading, setUploading] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('activation_content')
                .select('*')
                .order('order', { ascending: true });

            if (data) setItems(data);
        } catch (error) {
            console.error('Error fetching:', error);
            toast.error('Erro ao carregar conteúdos');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingId('new');
        setFormData({
            title: '',
            type: 'mixed',
            content: '',
            description: '',
            plan_scope: 'all',
            active: true,
            order: items.length,
            content_order: ['video', 'text', 'file', 'image'] 
        });
    };

    const handleEdit = (item: ContentItem) => {
        setEditingId(item.id);
        const defaultOrder = ['video', 'text', 'file', 'image'];
        setFormData({
            ...item,
            content_order: item.content_order && item.content_order.length > 0 ? item.content_order : defaultOrder
        });
    };

    const handleSave = async () => {
        try {
            const dataToSave = {
                ...formData,
                content_order: formData.content_order || ['video', 'text', 'file', 'image']
            };

            if (editingId === 'new') {
                await supabase.from('activation_content').insert([dataToSave]);
                toast.success('Conteúdo criado com sucesso');
            } else {
                await supabase.from('activation_content').update(dataToSave).eq('id', editingId);
                toast.success('Alterações salvas');
            }
            setEditingId(null);
            fetchItems();
        } catch (error) {
            console.error('Error saving:', error);
            toast.error('Erro ao salvar');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este bloco?')) return;
        try {
            await supabase.from('activation_content').delete().eq('id', id);
            toast.success('Bloco excluído');
            setEditingId(null);
            fetchItems();
        } catch (error) {
            toast.error('Erro ao excluir');
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('activation-assets')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('activation-assets')
                .getPublicUrl(filePath);

            setFormData({ ...formData, image_url: publicUrl });
            toast.success('Imagem carregada com sucesso');
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error('Erro no upload');
        } finally {
            setUploading(false);
        }
    };

    const moveSection = (index: number, direction: 'up' | 'down') => {
        if (!formData.content_order) return;
        const newOrder = [...formData.content_order];
        if (direction === 'up' && index > 0) {
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setFormData({ ...formData, content_order: newOrder });
    };

    const getEmbedUrl = (url: string) => {
        if (!url) return null;
        const videoId = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
        return null;
    };

    const renderSectionInput = (type: string) => {
        switch (type) {
            case 'text':
                return (
                    <textarea
                        value={formData.content || ''}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-sm text-gray-300 focus:border-primary/50 outline-none h-32 font-mono scrollbar-thin scrollbar-thumb-white/10"
                        placeholder="Corpo do texto..."
                    />
                );
            case 'video':
                return (
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={formData.video_url || ''}
                            onChange={e => setFormData({ ...formData, video_url: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:border-primary/50 outline-none"
                            placeholder="URL do YouTube..."
                        />
                        {formData.video_url && getEmbedUrl(formData.video_url) && (
                            <div className="aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/5 relative group">
                                <iframe 
                                    src={getEmbedUrl(formData.video_url)!} 
                                    className="w-full h-full pointer-events-none" 
                                />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Video className="w-8 h-8 text-white/50" />
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'file':
                return (
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={formData.file_url || ''}
                            onChange={e => setFormData({ ...formData, file_url: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:border-primary/50 outline-none"
                            placeholder="URL do Arquivo..."
                        />
                        <div className="flex items-center gap-3 p-3 bg-white/5 border border-dashed border-white/10 rounded-xl">
                            <Download className="w-4 h-4 text-amber-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Resource Link Connected</span>
                        </div>
                    </div>
                );
            case 'link':
                return (
                    <input
                        type="text"
                        value={formData.content || ''}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:border-primary/50 outline-none"
                        placeholder="URL Externa..."
                    />
                );
            case 'image':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={formData.image_url || ''}
                                onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:border-primary/50 outline-none"
                                placeholder="URL da Imagem..."
                            />
                            <label className="cursor-pointer bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-all text-gray-400 hover:text-white">
                                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={uploading} />
                            </label>
                        </div>
                        {formData.image_url && (
                            <div className="relative aspect-[21/9] bg-black/40 rounded-xl overflow-hidden border border-white/5 group">
                                <img src={formData.image_url} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
                                <button
                                    onClick={() => setFormData({ ...formData, image_url: '' })}
                                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const renderPreviewContent = (type: string) => {
        switch (type) {
            case 'video':
                const embed = formData.video_url ? getEmbedUrl(formData.video_url) : null;
                return embed ? (
                    <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 mb-6 shadow-2xl">
                        <iframe src={embed} className="w-full h-full" allowFullScreen />
                    </div>
                ) : null;
            case 'image':
                return formData.image_url ? (
                    <div className="rounded-2xl overflow-hidden border border-white/10 mb-6 shadow-xl">
                        <img src={formData.image_url} className="w-full h-auto" />
                    </div>
                ) : null;
            case 'text':
                return formData.content ? (
                    <div className="p-6 bg-white/5 border border-white/5 rounded-[2rem] mb-6 text-gray-300 leading-relaxed font-medium whitespace-pre-wrap">
                        {formData.content}
                    </div>
                ) : null;
            case 'file':
                return formData.file_url ? (
                    <div className="flex flex-wrap gap-4 mb-6">
                        <div className="flex items-center gap-3 px-6 py-4 bg-green-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-lg shadow-green-600/20">
                            <Download className="w-4 h-4" /> Download Material
                        </div>
                    </div>
                ) : null;
            default: return null;
        }
    };

    return (
        <Layout>
            <div className="flex flex-col gap-8 pb-32 animate-in fade-in duration-700">
                {/* Tactical Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <Rocket className="w-8 h-8 text-primary animate-pulse" />
                            </div>
                            <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">
                                Activation Content
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            Gerencie os tutoriais, organize a ordem dos elementos e fluxos.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleCreate}
                            className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 translate-y-[-2px]"
                        >
                            <Plus className="w-4 h-4" /> Novo Bloco
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-primary/40" />
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando Central...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Tutorial Matrix (List) */}
                        <div className="lg:col-span-4 space-y-4">
                            <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2rem] p-4 backdrop-blur-xl">
                                <div className="p-4 border-b border-white/5 mb-4">
                                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Biblioteca de Ativação</h3>
                                </div>
                                <div className="space-y-2">
                                    {items.map((item, idx) => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleEdit(item)}
                                            className={`p-5 rounded-2xl border transition-all cursor-pointer group animate-in slide-in-from-left duration-500 ${
                                                editingId === item.id
                                                    ? 'bg-primary/10 border-primary/30 shadow-lg shadow-primary/5'
                                                    : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'
                                            }`}
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black text-gray-600 font-mono italic">#{item.order}</span>
                                                        <h4 className={`text-sm font-black italic tracking-tight transition-colors ${editingId === item.id ? 'text-primary' : 'text-gray-200 group-hover:text-white'}`}>
                                                            {item.title}
                                                        </h4>
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 font-medium line-clamp-1">{item.description}</p>
                                                </div>
                                                <div className={`p-1.5 rounded-lg border ${item.active ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                                    {item.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                                                {item.video_url && <Video className="w-3 h-3 text-purple-400/60" />}
                                                {item.image_url && <ImageIcon className="w-3 h-3 text-green-400/60" />}
                                                {item.file_url && <Download className="w-3 h-3 text-amber-400/60" />}
                                                <span className="text-[9px] font-black uppercase text-gray-600 tracking-widest ml-auto">{item.plan_scope}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Editor Panel */}
                        <div className="lg:col-span-8">
                            {editingId ? (
                                <div className="bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] p-8 md:p-12 backdrop-blur-3xl sticky top-24 animate-in fade-in slide-in-from-right-8 duration-700 shadow-2xl">
                                    <div className="flex items-center justify-between mb-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary border border-white/10">
                                                <Zap className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">
                                                    {editingId === 'new' ? 'Novo Tutorial' : 'Configurar Bloco'}
                                                </h2>
                                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Editor de Fluxo Operacional</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setIsPreviewOpen(true)}
                                                className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all overflow-hidden relative group"
                                            >
                                                <Eye className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                            </button>
                                            <button 
                                                onClick={() => setEditingId(null)} 
                                                className="p-3 bg-white/5 hover:bg-white/10 border border-red-500/10 rounded-2xl text-gray-400 hover:text-red-500 transition-all"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Título do Bloco</label>
                                            <input
                                                type="text"
                                                value={formData.title || ''}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold tracking-tight focus:border-primary/50 outline-none transition-all"
                                                placeholder="Ex: Primeiros Passos"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Descrição Auxiliar</label>
                                            <input
                                                type="text"
                                                value={formData.description || ''}
                                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold tracking-tight focus:border-primary/50 outline-none transition-all"
                                                placeholder="Breve explicação..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Nível de Acesso (Escopo)</label>
                                            <div className="relative group/select">
                                                <select
                                                    value={formData.plan_scope || 'all'}
                                                    onChange={e => setFormData({ ...formData, plan_scope: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold tracking-tight focus:border-primary/50 outline-none appearance-none cursor-pointer hover:bg-white/10 transition-all custom-select-arrow"
                                                >
                                                    <option value="all" className="bg-[#0A0A15] text-white">Global (Todos)</option>
                                                    <option value="starter" className="bg-[#0A0A15] text-white">Plano Starter</option>
                                                    <option value="agency" className="bg-[#0A0A15] text-white">Plano Agency</option>
                                                    <option value="master" className="bg-[#0A0A15] text-white">Plano Master</option>
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2 text-gray-500">
                                                    <div className="w-px h-4 bg-white/10 mx-1" />
                                                    <ChevronDown className="w-4 h-4 group-hover/select:text-primary transition-colors" />
                                                </div>
                                                {/* Minimalist Icon overlay (visual only) */}
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary/40">
                                                    {formData.plan_scope === 'all' && <Rocket className="w-4 h-4" />}
                                                    {formData.plan_scope === 'starter' && <Zap className="w-4 h-4" />}
                                                    {formData.plan_scope === 'agency' && <Rocket className="w-4 h-4" />}
                                                    {formData.plan_scope === 'master' && <Zap className="w-4 h-4" />}
                                                </div>
                                                <style>{`
                                                    .custom-select-arrow { padding-left: 3rem !important; }
                                                    select option { padding: 1rem; }
                                                `}</style>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Sequência de Exibição</label>
                                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 px-4">
                                                <span className="font-mono font-black text-primary italic">#{formData.order || 0}</span>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="50"
                                                    value={formData.order || 0}
                                                    onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })}
                                                    className="flex-1 accent-primary bg-black/40 h-1.5 rounded-full"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content Matrix Reordering */}
                                    <div className="space-y-6 pt-10 border-t border-white/5">
                                        <div className="flex items-center justify-between px-4">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-3 italic">
                                                <GripVertical className="w-4 h-4 text-primary" />
                                                Stack de Conteúdo
                                            </h3>
                                            <div className={`px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${formData.active ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}
                                                onClick={() => setFormData({ ...formData, active: !formData.active })}
                                            >
                                                Status: {formData.active ? 'Ativo na Plataforma' : 'Oculto (Draft)'}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {(formData.content_order || ['video', 'text', 'file', 'image']).map((type, index) => {
                                                const isActive = (type === 'video' && formData.video_url) || 
                                                               (type === 'text' && formData.content) || 
                                                               (type === 'image' && formData.image_url) || 
                                                               (type === 'file' && formData.file_url);

                                                return (
                                                    <div key={type} className={`bg-black/20 border rounded-3xl overflow-hidden transition-all duration-500 ${isActive ? 'border-white/10' : 'border-white/5 opacity-60 grayscale'}`}>
                                                        <div className="flex items-center justify-between px-6 py-4 bg-white/[0.02]">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`p-2 rounded-xl border ${SECTION_COLORS[type]}`}>
                                                                    {type === 'video' && <Video className="w-4 h-4" />}
                                                                    {type === 'text' && <FileText className="w-4 h-4" />}
                                                                    {type === 'image' && <ImageIcon className="w-4 h-4" />}
                                                                    {type === 'file' && <Download className="w-4 h-4" />}
                                                                </div>
                                                                <span className="text-sm font-black text-gray-300 uppercase italic tracking-tighter">
                                                                    {SECTION_LABELS[type]}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => moveSection(index, 'up')}
                                                                    disabled={index === 0}
                                                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all disabled:opacity-0"
                                                                >
                                                                    <ChevronUp className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => moveSection(index, 'down')}
                                                                    disabled={index === (formData.content_order?.length || 4) - 1}
                                                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all disabled:opacity-0"
                                                                >
                                                                    <ChevronDown className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="p-6">
                                                            {renderSectionInput(type)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-12 border-t border-white/5 mt-10">
                                        <button
                                            onClick={handleSave}
                                            className="flex-1 bg-primary hover:bg-primary-hover text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-all active:scale-95 text-sm uppercase tracking-widest italic"
                                        >
                                            <Save className="w-5 h-5" /> Salvar Tutorial
                                        </button>
                                        {editingId !== 'new' && (
                                            <button
                                                onClick={() => handleDelete(editingId)}
                                                className="px-8 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white rounded-[2.5rem] border border-red-500/20 transition-all font-black text-[10px] uppercase tracking-widest group"
                                            >
                                                <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full min-h-[500px] border border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center p-12 bg-white/[0.02]">
                                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/10 group-hover:border-primary/20 transition-all">
                                        <Rocket className="w-10 h-10 text-gray-600 animate-pulse" />
                                    </div>
                                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-4 opacity-40">Ready for Launch?</h2>
                                    <p className="text-gray-500 max-w-sm text-sm font-medium leading-relaxed">
                                        Selecione um bloco de ativação na matriz ou crie um novo para começar o redesign operacional dos seus clientes.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* MODAL: Preview Mode */}
                <Modal 
                    isOpen={isPreviewOpen} 
                    onClose={() => setIsPreviewOpen(false)}
                    title="Real-time Portal Preview"
                    className="!max-w-[90vw] !w-full"
                >
                    <div className="flex flex-col gap-6">
                        {/* Device Toggle */}
                        <div className="flex items-center justify-center gap-2 p-1.5 bg-black/40 rounded-2xl w-fit mx-auto border border-white/5 shadow-inner">
                            <button 
                                onClick={() => setPreviewDevice('desktop')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${previewDevice === 'desktop' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Monitor className="w-4 h-4" /> Desktop View
                            </button>
                            <button 
                                onClick={() => setPreviewDevice('mobile')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${previewDevice === 'mobile' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Smartphone className="w-4 h-4" /> Mobile View
                            </button>
                        </div>

                        {/* Preview Frame Container */}
                        <div className="flex justify-center bg-black/20 rounded-3xl p-4 md:p-8 min-h-[60vh] overflow-hidden border border-white/5">
                            {/* Preview Frame */}
                            <div className={`bg-[#05050A] border-[12px] border-[#0F0F1A] rounded-[3rem] p-8 md:p-12 overflow-y-auto custom-scrollbar shadow-2xl transition-all duration-700 ease-in-out ${previewDevice === 'mobile' ? 'w-[375px] h-[667px]' : 'w-full'}`}>
                                {/* Simulator Header */}
                                <div className="mb-10 text-center md:text-left">
                                    <span className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                                        Simulação de Visualização
                                    </span>
                                    <h1 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tighter leading-none mb-6">
                                        {formData.title || 'Título do Tutorial'}
                                    </h1>
                                    <p className="text-gray-400 text-lg md:text-xl font-medium leading-relaxed max-w-2xl">
                                        {formData.description || 'A descrição detalhada aparecerá aqui para orientar o cliente no fluxo de ativação.'}
                                    </p>
                                </div>

                                {/* Render Logic based on content_order */}
                                <div className="flex flex-col">
                                    {(formData.content_order || ['video', 'text', 'file', 'image']).map(type => (
                                        <React.Fragment key={type}>
                                            {renderPreviewContent(type)}
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Navigation Simulator (Portal UI Style) */}
                                <div className="mt-12 pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 opacity-40 grayscale pointer-events-none">
                                    <div className="flex flex-col items-start gap-2 p-6 rounded-[2rem] bg-white/5 border border-white/5 w-full md:w-auto md:min-w-[240px]">
                                        <span className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2 tracking-widest">
                                            <ChevronLeft className="w-3 h-3" /> VOLTAR PAINEL
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 p-6 rounded-[2rem] bg-primary/10 border border-primary/40 w-full md:w-auto md:min-w-[240px]">
                                        <span className="text-[10px] font-black text-primary uppercase flex items-center gap-2 tracking-widest text-right">
                                            PRÓXIMA ETAPA <ArrowUp className="w-3 h-3 rotate-90" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button 
                            variant="outline" 
                            onClick={() => setIsPreviewOpen(false)}
                            className="bg-white/5 border-white/10 hover:bg-white/10 font-black uppercase text-xs rounded-2xl py-5"
                        >
                            Retornar ao Editor Central
                        </Button>
                    </div>
                </Modal>
            </div>
        </Layout >
    );
};
