import React, { useState } from 'react';
import { CustomLink } from '../../types';
import { Plus, Trash2, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';

interface LinksManagerProps {
    links: CustomLink[];
    onChange: (links: CustomLink[]) => void;
}

const ICONS = ['instagram', 'facebook', 'youtube', 'tiktok', 'whatsapp', 'globe', 'link'];

export const LinksManager: React.FC<LinksManagerProps> = ({ links, onChange }) => {
    const [newLink, setNewLink] = useState<Partial<CustomLink>>({ title: '', url: '', icon: 'link', active: true });

    const handleAdd = () => {
        if (!newLink.title || !newLink.url) return;
        const link: CustomLink = {
            id: crypto.randomUUID(),
            title: newLink.title,
            url: newLink.url,
            icon: newLink.icon || 'link',
            active: true
        };
        onChange([...links, link]);
        setNewLink({ title: '', url: '', icon: 'link', active: true });
    };

    const handleUpdate = (id: string, updates: Partial<CustomLink>) => {
        onChange(links.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const handleDelete = (id: string) => {
        onChange(links.filter(l => l.id !== id));
    };

    return (
        <div className="space-y-4">
            {/* Add New Link */}
            <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-2xl border border-gray-200 dark:border-white/10">
                <h4 className="text-sm font-bold mb-4 text-gray-900 dark:text-white">Adicionar Novo Link</h4>
                <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Nome (ex: Instagram)"
                            className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500/30 text-white font-bold placeholder:text-white/10"
                            value={newLink.title}
                            onChange={e => setNewLink({ ...newLink, title: e.target.value })}
                        />
                        <select
                            className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm uppercase outline-none focus:border-purple-500/30 text-white font-bold"
                            value={newLink.icon}
                            onChange={e => setNewLink({ ...newLink, icon: e.target.value })}
                        >
                            {ICONS.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="URL (https://...)"
                        className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500/30 text-white font-bold placeholder:text-white/10"
                        value={newLink.url}
                        onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                    />
                    <div className="flex justify-center">
                        <Button onClick={handleAdd} disabled={!newLink.title || !newLink.url} className="h-10 px-8 font-black uppercase italic tracking-tighter">
                            <Plus className="w-4 h-4 mr-2" /> Adicionar Link
                        </Button>
                    </div>
                </div>
            </div>

            {/* List Links */}
            <div className="space-y-2">
                {links.map(link => (
                    <div key={link.id} className="w-full flex items-center justify-between gap-4 p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl transition-all hover:border-purple-500/20">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="p-3 bg-gray-100 dark:bg-white/10 rounded-xl text-gray-500 shrink-0">
                                <LinkIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{link.title}</p>
                                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-400 hover:underline flex items-center gap-1 mt-1 truncate">
                                    <span className="truncate">{link.url}</span> <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={link.active}
                                    onChange={e => handleUpdate(link.id, { active: e.target.checked })}
                                    className="rounded border-white/10 bg-black/20 text-purple-600 focus:ring-purple-500"
                                />
                                Ativo
                            </label>
                            <button onClick={() => handleDelete(link.id)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {links.length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-4">Nenhum link cadastrado.</p>
                )}
            </div>
        </div>
    );
};
