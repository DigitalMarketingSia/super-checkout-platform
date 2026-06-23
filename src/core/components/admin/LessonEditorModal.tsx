import React, { useRef, useState } from 'react';
import { Lesson, LessonResource } from '../../types';
import { Button } from '../ui/Button';
import {
    Upload,
    Plus,
    Trash2,
    Video,
    FileText,
    Link as LinkIcon,
    File as FileIcon,
    X,
    ChevronUp,
    ChevronDown,
    CheckCircle,
    Circle,
    Download,
    ChevronLeft,
    ChevronRight,
    Eye,
    Edit2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storageService';

interface LessonEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (lesson: Lesson) => void;
    lesson: Lesson;
    moduleId: string;
}

type LessonEditorTab = 'config' | 'video' | 'text' | 'material' | 'gallery' | 'preview';

const getYoutubeEmbedUrl = (url?: string | null): string | null => {
    if (!url) return null;

    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i)?.[1];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};


export const LessonEditorModal: React.FC<LessonEditorModalProps> = ({ isOpen, onClose, onSave, lesson }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [editedLesson, setEditedLesson] = useState<Lesson>(lesson);
    const [textTab, setTextTab] = useState<'write' | 'preview'>('write');
    const [activeTab, setActiveTab] = useState<LessonEditorTab>('config');
    const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const lessonEditorTabLabels: Record<LessonEditorTab, string> = {
        config: t('content_editor.lesson_editor.tabs.config', 'Configurações'),
        video: t('content_editor.lesson_editor.tabs.video', 'Vídeo/Player'),
        text: t('content_editor.lesson_editor.tabs.text', 'Texto'),
        material: t('content_editor.lesson_editor.tabs.material', 'Material complementar'),
        gallery: t('content_editor.lesson_editor.tabs.gallery', 'Galeria'),
        preview: t('content_editor.lesson_editor.tabs.preview', 'Preview')
    };

    const lessonContentTypeLabels = {
        video: t('content_editor.lesson_editor.content_types.video', 'Vídeo'),
        text: t('content_editor.lesson_editor.content_types.text', 'Texto'),
        file: t('content_editor.lesson_editor.content_types.file', 'Arquivo / link externo')
    };

    const lessonPreviewSectionLabels = {
        video: t('content_editor.lesson_editor.section_labels.video', 'Vídeo da aula'),
        text: t('content_editor.lesson_editor.section_labels.text', 'Texto da aula'),
        file: t('content_editor.lesson_editor.section_labels.file', 'Material complementar'),
        gallery: t('content_editor.lesson_editor.section_labels.gallery', 'Galeria de recursos')
    };

    React.useEffect(() => {
        setEditedLesson(lesson);
    }, [lesson]);

    if (!isOpen) return null;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const publicUrl = await storage.uploadLessonImage(file, editedLesson.id);
                setEditedLesson({ ...editedLesson, image_url: publicUrl });
            } catch (error) {
                console.error('Error uploading image:', error);
                window.alert(t('common.upload_error', 'Erro ao enviar imagem.'));
            }
        }
    };

    const handleGalleryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, resourceId: string) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const publicUrl = await storage.uploadLessonImage(file, resourceId);

                const updatedGallery = (editedLesson.gallery || []).map(r =>
                    r.id === resourceId ? { ...r, image_url: publicUrl } : r
                );
                setEditedLesson({ ...editedLesson, gallery: updatedGallery });
            } catch (error) {
                console.error('Error uploading gallery image:', error);
                window.alert(t('common.upload_error', 'Erro ao enviar imagem.'));
            }
        }
    };

    const addResource = () => {
        const newResource: LessonResource = {
            id: crypto.randomUUID(),
            title: '',
            image_url: '',
            link_url: '',
            button_text: 'Acessar'
        };
        setEditedLesson({
            ...editedLesson,
            gallery: [...(editedLesson.gallery || []), newResource]
        });
        setEditingResourceId(newResource.id);
    };

    const removeResource = (id: string) => {
        setEditedLesson({
            ...editedLesson,
            gallery: (editedLesson.gallery || []).filter(r => r.id !== id)
        });
        if (editingResourceId === id) {
            setEditingResourceId(null);
        }
    };

    const updateResource = (id: string, field: keyof LessonResource, value: string) => {
        setEditedLesson({
            ...editedLesson,
            gallery: (editedLesson.gallery || []).map(r =>
                r.id === id ? { ...r, [field]: value } : r
            )
        });
    };

    const handleMoveSection = (index: number, direction: 'up' | 'down') => {
        const order = editedLesson.content_order || ['video', 'text', 'file', 'gallery'];
        const newOrder = [...order];
        if (direction === 'up' && index > 0) {
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
        }
        setEditedLesson({ ...editedLesson, content_order: newOrder });
    };

    const getVideoPreview = (url: string) => {
        if (!url) {
            return (
                <div className="relative aspect-video max-w-md mx-auto w-full rounded-2xl overflow-hidden bg-black/40 border border-dashed border-white/10 mt-2 flex flex-col items-center justify-center text-white/20 gap-2 p-4">
                    <Video className="w-8 h-8 opacity-40" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('content_editor.lesson_editor.waiting_video_link', 'Aguardando link do vídeo...')}</span>
                </div>
            );
        }
        const embedUrl = getYoutubeEmbedUrl(url);
        if (embedUrl && embedUrl !== url) {
            return (
                <div className="relative aspect-video max-w-md mx-auto w-full rounded-2xl overflow-hidden bg-black mt-2 shadow-xl border border-white/5">
                    <iframe className="absolute inset-0 w-full h-full" src={embedUrl} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
            );
        }
        return (
            <div className="max-w-md mx-auto w-full text-[10px] text-white/30 font-mono mt-2 italic flex items-center gap-2 bg-white/5 p-4 rounded-xl border border-white/5">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                {t('content_editor.lesson_editor.custom_video_provider', 'Link de vídeo customizado ou provedor alternativo.')}
            </div>
        );
    };

    const renderMarkdownPreview = (text: string) => {
        if (!text) return <p className="text-white/20 italic text-xs py-4 font-mono">{t('content_editor.lesson_editor.nothing_to_preview', 'Nada para visualizar...')}</p>;
        const lines = text.split('\n');
        return (
            <div className="text-white/70 text-sm space-y-3 font-sans leading-relaxed p-6 bg-black/40 border border-white/5 rounded-2xl min-h-[350px] overflow-y-auto">
                {lines.map((line, idx) => (
                    <p key={idx} className="min-h-[1em]">{line}</p>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="relative bg-[#0E0E1F]/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] w-full max-w-3xl p-0 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col overflow-hidden">
                {/* Header do Modal */}
                <div className="flex items-center justify-between p-5 md:p-6 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3">
                        <Video className="w-5 h-5 text-purple-400" />
                        <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">{t('content_editor.lesson_editor.title', 'Editar aula')}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={onClose} className="rounded-xl px-4 py-2 border-white/5 text-white hover:bg-white/5 uppercase italic font-black text-[10px]">{t('common.cancel', 'Cancelar')}</Button>
                        <Button onClick={() => onSave(editedLesson)} className="rounded-xl px-5 py-2 bg-white !text-black hover:bg-white/90 uppercase italic font-black text-[10px]">{t('content_editor.commit_changes', 'Salvar alterações')}</Button>
                    </div>
                </div>

                {/* Abas */}
                <div className="flex border-b border-white/5 bg-black/10 px-6 py-1 gap-1 md:gap-2 shrink-0 overflow-x-auto no-scrollbar">
                    {(['config', 'video', 'text', 'material', 'gallery', 'preview'] as LessonEditorTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-3 px-3 md:px-4 text-[9px] md:text-[10px] font-black uppercase italic tracking-wider transition-all border-b-2 whitespace-nowrap ${activeTab === tab ? 'border-purple-500 text-white' : 'border-transparent text-white/40'}`}
                        >
                            {lessonEditorTabLabels[tab]}
                        </button>
                    ))}
                </div>

                {/* Corpo do Modal com rolagem */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                    {/* Aba: Configurações */}
                    {activeTab === 'config' && (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start py-4 max-w-2xl mx-auto w-full">
                            <div className="md:col-span-7 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">{t('content_editor.lesson_editor.lesson_title', 'Título da aula')}</label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                        value={editedLesson.title}
                                        onChange={e => setEditedLesson({ ...editedLesson, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">{t('content_editor.lesson_editor.content_type', 'Tipo de conteúdo')}</label>
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white focus:outline-none"
                                        value={editedLesson.content_type}
                                        onChange={e => setEditedLesson({ ...editedLesson, content_type: e.target.value as any })}
                                    >
                                        <option value="video">{lessonContentTypeLabels.video}</option>
                                        <option value="text">{lessonContentTypeLabels.text}</option>
                                        <option value="file">{lessonContentTypeLabels.file}</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <input
                                        type="checkbox"
                                        id="is_free_checkbox"
                                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-purple-500 focus:ring-purple-500/20"
                                        checked={editedLesson.is_free || false}
                                        onChange={e => setEditedLesson({ ...editedLesson, is_free: e.target.checked })}
                                    />
                                    <label htmlFor="is_free_checkbox" className="text-xs font-bold text-white/80 cursor-pointer select-none">
                                        {t('content_editor.lesson_editor.free_demo_lesson', 'Aula de demonstração gratuita')}
                                    </label>
                                </div>
                            </div>
                            <div className="md:col-span-5 space-y-2">
                                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest">{t('content_editor.lesson_editor.lesson_cover_label', 'Capa da aula (16:9)')}</label>
                                <div
                                    className="relative w-full aspect-video rounded-2xl bg-black/40 border border-white/10 overflow-hidden cursor-pointer hover:border-white/20 transition-all flex items-center justify-center group"
                                    onClick={() => imageInputRef.current?.click()}
                                >
                                    {editedLesson.image_url ? (
                                        <>
                                            <img src={editedLesson.image_url} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Upload className="w-6 h-6 text-white" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-white/20">
                                            <Upload className="w-6 h-6 mb-2" />
                                            <span className="text-[9px] font-bold uppercase tracking-wider">{t('content_editor.lesson_editor.upload_button', 'Fazer upload')}</span>
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                        </div>
                    )}

                    {/* Aba: Vídeo/Player */}
                    {activeTab === 'video' && (
                        <div className="space-y-4 max-w-2xl mx-auto w-full py-2">
                            <div>
                                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">{t('content_editor.lesson_editor.video_url_label', 'URL do vídeo')}</label>
                                <input
                                    type="text"
                                    placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm font-mono text-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                    value={editedLesson.video_url || ''}
                                    onChange={e => setEditedLesson({ ...editedLesson, video_url: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest">{t('content_editor.lesson_editor.video_preview_label', 'Pré-visualização do player')}</label>
                                {getVideoPreview(editedLesson.video_url || '')}
                            </div>
                        </div>
                    )}

                    {/* Aba: Texto */}
                    {activeTab === 'text' && (
                        <div className="space-y-4 max-w-2xl mx-auto w-full">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTextTab('write')}
                                    className={`px-4 py-2 text-[10px] font-black uppercase italic tracking-wider rounded-xl transition-all ${textTab === 'write' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 border border-transparent'}`}
                                >
                                    {t('content_editor.lesson_editor.write_tab', 'Escrever')}
                                </button>
                                <button
                                    onClick={() => setTextTab('preview')}
                                    className={`px-4 py-2 text-[10px] font-black uppercase italic tracking-wider rounded-xl transition-all ${textTab === 'preview' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 border border-transparent'}`}
                                >
                                    {t('content_editor.lesson_editor.preview_tab', 'Visualizar')}
                                </button>
                            </div>
                            {textTab === 'write' ? (
                                <textarea
                                    className="w-full min-h-[350px] bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500/20 outline-none resize-y"
                                    placeholder={t('content_editor.lesson_editor.markdown_placeholder', 'Digite o conteúdo da aula em Markdown...')}
                                    value={editedLesson.content_text || ''}
                                    onChange={e => setEditedLesson({ ...editedLesson, content_text: e.target.value })}
                                />
                            ) : (
                                renderMarkdownPreview(editedLesson.content_text || '')
                            )}
                        </div>
                    )}

                    {/* Aba: Material Complementar */}
                    {activeTab === 'material' && (
                        <div className="space-y-6 max-w-2xl mx-auto w-full py-4">
                            <div className="space-y-4 bg-black/20 p-6 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-purple-400" />
                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">{t('content_editor.lesson_editor.main_material_title', 'Material complementar principal')}</h4>
                                </div>
                                <p className="text-[10px] text-white/40">{t('content_editor.lesson_editor.main_material_description', 'Insira a URL de um arquivo (PDF, ZIP, etc.) ou um link externo de apoio.')}</p>
                                <input
                                    type="text"
                                    placeholder={t('content_editor.lesson_editor.file_url_placeholder', 'Ex: https://meusite.com/manual.pdf')}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white focus:ring-2 focus:ring-purple-500/20 outline-none"
                                    value={editedLesson.file_url || ''}
                                    onChange={e => setEditedLesson({ ...editedLesson, file_url: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {/* Aba: Galeria */}
                    {activeTab === 'gallery' && (
                        <div className="space-y-6 max-w-2xl mx-auto w-full py-4">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-purple-400" />
                                        <h4 className="text-xs font-black text-white uppercase tracking-wider">{t('content_editor.lesson_editor.gallery_title', 'Galeria de recursos adicionais')}</h4>
                                    </div>
                                    <button
                                        onClick={addResource}
                                        className="flex items-center gap-1 bg-purple-500 hover:bg-purple-600 text-white font-bold text-[9px] px-3 py-2 rounded-xl uppercase italic tracking-wider transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> {t('content_editor.lesson_editor.add_resource', 'Adicionar recurso')}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {(editedLesson.gallery || []).map((resource) => {
                                        const isEditing = editingResourceId === resource.id;
                                        return (
                                            <div key={resource.id} className={`bg-black/20 rounded-2xl border ${isEditing ? 'border-purple-500/50 bg-black/40' : 'border-white/5'} p-4 flex flex-col gap-3 transition-all relative group`}>
                                                {/* Botão de Excluir */}
                                                <button
                                                    onClick={() => removeResource(resource.id)}
                                                    className="absolute top-2 right-2 p-1.5 bg-red-500/20 hover:bg-red-500/80 hover:text-white text-red-400 rounded-lg transition-colors z-10"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>

                                                {isEditing ? (
                                                    // Modo Edição Inline do card
                                                    <div className="space-y-3 pt-4">
                                                        <div className="relative w-full aspect-video rounded-xl bg-black/40 border border-white/10 overflow-hidden cursor-pointer">
                                                            {resource.image_url ? (
                                                                <>
                                                                    <img src={resource.image_url} className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                                        <label className="cursor-pointer bg-white text-black font-bold text-[9px] px-2 py-1 rounded-lg flex items-center uppercase italic">
                                                                            <Upload className="w-3.5 h-3.5 mr-1" /> {t('content_editor.replace_short', 'Trocar')}
                                                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleGalleryImageUpload(e, resource.id)} />
                                                                        </label>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                                                                    <Upload className="w-4 h-4 text-white/20 mb-1" />
                                                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{t('content_editor.lesson_editor.resource_cover_short', 'Capa')}</span>
                                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleGalleryImageUpload(e, resource.id)} />
                                                                </label>
                                                            )}
                                                        </div>
                                                        <input
                                                            type="text"
                                                            placeholder={t('content_editor.lesson_editor.resource_title_placeholder', 'Título')}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none"
                                                            value={resource.title}
                                                            onChange={e => updateResource(resource.id, 'title', e.target.value)}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder={t('content_editor.lesson_editor.resource_link_placeholder', 'Link (URL)')}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                                                            value={resource.link_url}
                                                            onChange={e => updateResource(resource.id, 'link_url', e.target.value)}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder={t('content_editor.lesson_editor.resource_button_text_placeholder', 'Texto do botão')}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none"
                                                            value={resource.button_text}
                                                            onChange={e => updateResource(resource.id, 'button_text', e.target.value)}
                                                        />
                                                        <button
                                                            onClick={() => setEditingResourceId(null)}
                                                            className="w-full py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-[9px] rounded-lg uppercase transition-colors"
                                                        >
                                                            {t('content_editor.lesson_editor.done', 'Concluir')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    // Modo WYSIWYG colapsado (idêntico à página pública)
                                                    <div
                                                        onClick={() => setEditingResourceId(resource.id)}
                                                        className="cursor-pointer flex flex-col h-full justify-between"
                                                    >
                                                        <div className="aspect-video w-full bg-black/20 rounded-xl overflow-hidden relative mb-2">
                                                            {resource.image_url ? (
                                                                <img src={resource.image_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                                    <FileText className="w-8 h-8 text-white/10" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h5 className="font-bold text-white text-xs line-clamp-2 mb-2 leading-snug">{resource.title || <span className="text-white/20 italic">{t('content_editor.lesson_editor.untitled', 'Sem título')}</span>}</h5>
                                                            <p className="text-[9px] text-white/30 truncate font-mono mb-2">{resource.link_url || t('content_editor.lesson_editor.no_link_configured', 'Sem link configurado')}</p>
                                                            <div className="w-full text-center py-1.5 rounded-lg font-bold text-[10px] bg-white/5 border border-white/10 text-gray-300">
                                                                {resource.button_text || t('content_editor.lesson_editor.default_resource_button', 'Acessar')}
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 text-center text-[8px] font-black text-purple-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {t('content_editor.lesson_editor.edit', 'Editar')}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {/* Card tracejado final de adicionar */}
                                    <button
                                        onClick={addResource}
                                        className="border-2 border-dashed border-white/10 hover:border-purple-500/30 hover:bg-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 text-[10px] font-black text-white/30 hover:text-white uppercase italic tracking-wider transition-all duration-300 min-h-[180px]"
                                    >
                                        <Plus className="w-6 h-6 mb-1" />
                                        <span>{t('content_editor.lesson_editor.add_resource', 'Adicionar recurso')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Aba: Preview WYSIWYG */}
                    {activeTab === 'preview' && (
                        <div className="space-y-8 max-w-2xl mx-auto w-full pb-8">
                            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">{t('content_editor.lesson_editor.student_preview_title', 'Preview do aluno (em tempo real)')}</h4>
                                <p className="text-[10px] text-white/60">{t('content_editor.lesson_editor.student_preview_description', 'Esta é uma simulação fiel de como a aula e os blocos serão exibidos para seus alunos. Use os botões das barras superiores para reordenar os blocos ou editá-los diretamente.')}</p>
                            </div>

                            <div className="space-y-6">
                                {(editedLesson.content_order || ['video', 'text', 'file', 'gallery']).map((type, index, arr) => {
                                    const renderContent = () => {
                                        switch (type) {
                                            case 'video':
                                                return editedLesson.video_url ? (
                                                    <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 w-full">
                                                        <iframe
                                                            src={getYoutubeEmbedUrl(editedLesson.video_url) || editedLesson.video_url}
                                                            className="w-full h-full"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="bg-white/5 rounded-xl p-8 border border-white/5 text-center text-white/40 text-xs italic">{t('content_editor.lesson_editor.empty_video', 'Sem vídeo configurado.')}</div>
                                                );
                                            case 'text':
                                                return editedLesson.content_text ? (
                                                    <div className="bg-white/5 rounded-xl p-8 border border-white/5">
                                                        <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                                                            {editedLesson.content_text}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white/5 rounded-xl p-8 border border-white/5 text-center text-white/40 text-xs italic">{t('content_editor.lesson_editor.empty_text', 'Sem conteúdo de texto configurado.')}</div>
                                                );
                                            case 'file':
                                                return editedLesson.file_url ? (
                                                    <div className="bg-white/5 rounded-xl p-6 border border-white/5 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-white/5 rounded-lg">
                                                                <FileText className="w-6 h-6 text-purple-400" />
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-white text-sm">{t('content_editor.lesson_editor.material_label', 'Material complementar')}</h3>
                                                                <p className="text-xs text-gray-400">{t('content_editor.lesson_editor.material_hint', 'Clique para acessar o arquivo ou link externo')}</p>
                                                            </div>
                                                        </div>
                                                        <a
                                                            href={editedLesson.file_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                                        >
                                                            <Download className="w-4 h-4" /> {t('content_editor.lesson_editor.access_resource', 'Acessar recurso')}
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white/5 rounded-xl p-6 border border-white/5 text-center text-white/40 text-xs italic">{t('content_editor.lesson_editor.empty_material', 'Sem material complementar configurado.')}</div>
                                                );
                                            case 'gallery':
                                                return (editedLesson.gallery && editedLesson.gallery.length > 0) ? (
                                                    <div className="pt-4">
                                                        <h3 className="text-base font-bold text-white mb-4">{t('content_editor.lesson_editor.gallery_preview_title', 'Galeria de recursos')}</h3>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                            {editedLesson.gallery.map((resource) => (
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
                                                                        <h4 className="font-bold text-white mb-2 text-xs line-clamp-2 leading-snug">{resource.title || t('content_editor.lesson_editor.untitled', 'Sem título')}</h4>
                                                                        <a
                                                                            href={resource.link_url || '#'}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="block w-full text-center py-1.5 rounded-lg font-bold text-[10px] transition-colors bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white"
                                                                        >
                                                                            {resource.button_text || t('content_editor.lesson_editor.default_resource_button', 'Acessar')}
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="bg-white/5 rounded-xl p-8 border border-white/5 text-center text-white/40 text-xs italic">{t('content_editor.lesson_editor.empty_gallery', 'Sem recursos na galeria.')}</div>
                                                );
                                            default:
                                                return null;
                                        }
                                    };

                                    return (
                                        <div key={type} className="border border-white/5 rounded-2xl bg-black/10 overflow-hidden shadow-md">
                                            {/* Barra superior de controle do bloco */}
                                            <div className="bg-black/30 px-4 py-2 border-b border-white/5 flex items-center justify-between">
                                                <span className="text-[9px] font-black uppercase text-purple-400 tracking-wider">
                                                    {lessonPreviewSectionLabels[type]}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleMoveSection(index, 'up')}
                                                        disabled={index === 0}
                                                        className={`p-1 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed`}
                                                    >
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveSection(index, 'down')}
                                                        disabled={index === arr.length - 1}
                                                        className={`p-1 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed`}
                                                    >
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    </button>
                                                    <div className="w-px h-3 bg-white/10 mx-1" />
                                                    <button
                                                        onClick={() => {
                                                            if (type === 'video') setActiveTab('video');
                                                            else if (type === 'text') setActiveTab('text');
                                                            else if (type === 'file') setActiveTab('material');
                                                            else if (type === 'gallery') setActiveTab('gallery');
                                                        }}
                                                        className="flex items-center gap-1 text-[8px] font-black uppercase text-white/40 hover:text-white bg-white/5 px-2 py-1 rounded transition-colors"
                                                    >
                                                        <Edit2 className="w-2.5 h-2.5" /> {t('content_editor.lesson_editor.edit', 'Editar')}
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Conteúdo do bloco */}
                                            <div className="p-4 md:p-6 bg-black/20">
                                                {renderContent()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
