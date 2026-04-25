import React, { useRef, useState } from 'react';
import { Lesson, LessonResource } from '../../types';
import { Button } from '../ui/Button';
import { Upload, Plus, Trash2, Video, FileText, Link as LinkIcon, File as FileIcon, X, ChevronUp, ChevronDown } from 'lucide-react';
import { storage } from '../../services/storageService';

interface LessonEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (lesson: Lesson) => void;
    lesson: Lesson;
    moduleId: string;
}

export const LessonEditorModal: React.FC<LessonEditorModalProps> = ({ isOpen, onClose, onSave, lesson, moduleId }) => {
    const [editedLesson, setEditedLesson] = useState<Lesson>(lesson);
    const [uploading, setUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setEditedLesson(lesson);
    }, [lesson]);

    if (!isOpen) return null;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                setUploading(true);
                const publicUrl = await storage.uploadLessonImage(file, editedLesson.id);
                setEditedLesson({ ...editedLesson, image_url: publicUrl });
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('Erro ao fazer upload da imagem.');
            } finally {
                setUploading(false);
            }
        }
    };

    const handleGalleryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, resourceId: string) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                setUploading(true);
                // Reusing lesson image upload for now, or create a specific one if needed
                const publicUrl = await storage.uploadLessonImage(file, resourceId);

                const updatedGallery = (editedLesson.gallery || []).map(r =>
                    r.id === resourceId ? { ...r, image_url: publicUrl } : r
                );
                setEditedLesson({ ...editedLesson, gallery: updatedGallery });
            } catch (error) {
                console.error('Error uploading gallery image:', error);
                alert('Erro ao fazer upload da imagem.');
            } finally {
                setUploading(false);
            }
        }
    };

    const addResource = () => {
        const newResource: LessonResource = {
            id: crypto.randomUUID(),
            title: 'Novo Recurso',
            image_url: '',
            link_url: '',
            button_text: 'Acessar'
        };
        setEditedLesson({
            ...editedLesson,
            gallery: [...(editedLesson.gallery || []), newResource]
        });
    };

    const removeResource = (id: string) => {
        setEditedLesson({
            ...editedLesson,
            gallery: (editedLesson.gallery || []).filter(r => r.id !== id)
        });
    };

    const updateResource = (id: string, field: keyof LessonResource, value: string) => {
        setEditedLesson({
            ...editedLesson,
            gallery: (editedLesson.gallery || []).map(r =>
                r.id === id ? { ...r, [field]: value } : r
            )
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-4xl p-0 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white">Editar Aula</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

                    {/* 1. General Info */}
                    <section className="space-y-4">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Informações Gerais</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Título da Aula</label>
                                <input
                                    type="text"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                                    value={editedLesson.title}
                                    onChange={e => setEditedLesson({ ...editedLesson, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Ícone Principal (Lista)</label>
                                <select
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                                    value={editedLesson.content_type}
                                    onChange={e => setEditedLesson({ ...editedLesson, content_type: e.target.value as any })}
                                >
                                    <option value="video">Vídeo</option>
                                    <option value="text">Texto</option>
                                    <option value="file">Arquivo</option>
                                    <option value="link">Link</option>
                                </select>
                            </div>
                        </div>

                        {/* Thumbnail */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Capa do Card (Horizontal)</label>
                            <div className="relative w-full max-w-sm aspect-video rounded-xl bg-black/20 border-2 border-dashed border-white/10 overflow-hidden group">
                                {editedLesson.image_url ? (
                                    <>
                                        <img src={editedLesson.image_url} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button variant="secondary" size="xs" onClick={() => imageInputRef.current?.click()}>
                                                <Upload className="w-3 h-3 mr-1" /> Trocar
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => imageInputRef.current?.click()}>
                                        <Upload className="w-6 h-6 text-gray-400 mb-1" />
                                        <span className="text-[10px] text-gray-400">Upload</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </div>

                        <div className="flex items-center pt-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded border-gray-600 text-primary bg-black/20"
                                    checked={editedLesson.is_free}
                                    onChange={e => setEditedLesson({ ...editedLesson, is_free: e.target.checked })}
                                />
                                <span className="text-sm text-white">Aula Gratuita (Preview)</span>
                            </label>
                        </div>
                    </section>

                    <div className="h-px bg-white/10" />

                    {/* Dynamic Sections */}
                    <div className="space-y-8">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Organização do Conteúdo</h4>
                            <p className="text-xs text-gray-500">Use as setas para reordenar os blocos</p>
                        </div>

                        {(editedLesson.content_order || ['video', 'text', 'file', 'gallery']).map((sectionType, index, arr) => {
                            const moveUp = () => {
                                if (index === 0) return;
                                const newOrder = [...arr];
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                setEditedLesson({ ...editedLesson, content_order: newOrder });
                            };

                            const moveDown = () => {
                                if (index === arr.length - 1) return;
                                const newOrder = [...arr];
                                [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
                                setEditedLesson({ ...editedLesson, content_order: newOrder });
                            };

                            const renderControls = () => (
                                <div className="flex items-center gap-1 ml-4">
                                    <button onClick={moveUp} disabled={index === 0} className="p-1 hover:bg-white/10 rounded disabled:opacity-30 text-gray-400">
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button onClick={moveDown} disabled={index === arr.length - 1} className="p-1 hover:bg-white/10 rounded disabled:opacity-30 text-gray-400">
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                </div>
                            );

                            if (sectionType === 'video') {
                                return (
                                    <div key="video" className="bg-white/5 p-4 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <Video className="w-5 h-5 text-blue-400" />
                                                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Conteúdo de Vídeo</h4>
                                            </div>
                                            {renderControls()}
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">URL do Vídeo (YouTube, Vimeo, Panda...)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                                                placeholder="https://..."
                                                value={editedLesson.video_url || ''}
                                                onChange={e => setEditedLesson({ ...editedLesson, video_url: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            if (sectionType === 'text') {
                                return (
                                    <div key="text" className="bg-white/5 p-4 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-5 h-5 text-green-400" />
                                                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Conteúdo de Texto</h4>
                                            </div>
                                            {renderControls()}
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Texto / Artigo (Markdown)</label>
                                            <textarea
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none font-mono text-sm"
                                                rows={8}
                                                placeholder="# Título da aula..."
                                                value={editedLesson.content_text || ''}
                                                onChange={e => setEditedLesson({ ...editedLesson, content_text: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            if (sectionType === 'file') {
                                return (
                                    <div key="file" className="bg-white/5 p-4 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <FileIcon className="w-5 h-5 text-orange-400" />
                                                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Arquivo / Link Externo</h4>
                                            </div>
                                            {renderControls()}
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">URL do Arquivo ou Link</label>
                                            <input
                                                type="text"
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                                                placeholder="https://..."
                                                value={editedLesson.file_url || ''}
                                                onChange={e => setEditedLesson({ ...editedLesson, file_url: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            if (sectionType === 'gallery') {
                                return (
                                    <div key="gallery" className="bg-white/5 p-4 rounded-xl border border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <LinkIcon className="w-5 h-5 text-purple-400" />
                                                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Galeria de Recursos</h4>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button size="xs" variant="secondary" onClick={addResource}>
                                                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                                                </Button>
                                                {renderControls()}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {(editedLesson.gallery || []).map((resource, index) => (
                                                <div key={resource.id} className="p-4 bg-black/20 border border-white/10 rounded-xl space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-gray-300">Recurso #{index + 1}</span>
                                                        <button onClick={() => removeResource(resource.id)} className="text-gray-500 hover:text-red-400">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                        {/* Image */}
                                                        <div className="md:col-span-1">
                                                            <div className="relative w-full aspect-video rounded-lg bg-black/20 border-2 border-dashed border-white/10 overflow-hidden group">
                                                                {resource.image_url ? (
                                                                    <>
                                                                        <img src={resource.image_url} className="w-full h-full object-cover" />
                                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                            <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded flex items-center">
                                                                                <Upload className="w-3 h-3 mr-1" /> Trocar
                                                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleGalleryImageUpload(e, resource.id)} />
                                                                            </label>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors">
                                                                        <Upload className="w-5 h-5 text-gray-400 mb-1" />
                                                                        <span className="text-[10px] text-gray-400">Img</span>
                                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleGalleryImageUpload(e, resource.id)} />
                                                                    </label>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Fields */}
                                                        <div className="md:col-span-3 space-y-3">
                                                            <input
                                                                type="text"
                                                                placeholder="Título do Recurso"
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                                                                value={resource.title}
                                                                onChange={e => updateResource(resource.id, 'title', e.target.value)}
                                                            />
                                                            <input
                                                                type="text"
                                                                placeholder="Link de Destino (URL)"
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                                                                value={resource.link_url}
                                                                onChange={e => updateResource(resource.id, 'link_url', e.target.value)}
                                                            />
                                                            <input
                                                                type="text"
                                                                placeholder="Texto do Botão (ex: Baixar PDF)"
                                                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                                                                value={resource.button_text}
                                                                onChange={e => updateResource(resource.id, 'button_text', e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A] rounded-b-2xl">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={() => onSave(editedLesson)}>Salvar Alterações</Button>
                </div>
            </div>
        </div>
    );
};
