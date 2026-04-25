import React, { useState } from 'react';
import { CustomLink } from '../../types';
import { Plus, Trash2, Edit2, Link as LinkIcon, Check, X, ExternalLink } from 'lucide-react';
import { Button } from '../ui/Button';

interface LinksManagerProps {
    links: CustomLink[];
    onChange: (links: CustomLink[]) => void;
}

const ICONS = ['instagram', 'facebook', 'youtube', 'tiktok', 'whatsapp', 'globe', 'link'];

export const LinksManager: React.FC<LinksManagerProps> = ({ links, onChange }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
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
            <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <h4 className="text-sm font-medium mb-3 text-gray-900 dark:text-white">Adicionar Novo Link</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                        type="text"
                        placeholder="Nome (ex: Instagram)"
                        className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-sm"
                        value={newLink.title}
                        onChange={e => setNewLink({ ...newLink, title: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="URL (https://...)"
                        className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-sm md:col-span-2"
                        value={newLink.url}
                        onChange={e => setNewLink({ ...newLink, url: e.target.value })}
                    />
                    <div className="flex gap-2 min-w-0">
                        <select
                            className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-sm flex-1 min-w-0"
                            value={newLink.icon}
                            onChange={e => setNewLink({ ...newLink, icon: e.target.value })}
                        >
                            {ICONS.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                        </select>
                        <Button onClick={handleAdd} size="sm" disabled={!newLink.title || !newLink.url} className="shrink-0">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* List Links */}
            <div className="space-y-2">
                {links.map(link => (
                    <div key={link.id} className="flex items-center gap-3 p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg">
                        <div className="p-2 bg-gray-100 dark:bg-white/10 rounded text-gray-500">
                            <LinkIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{link.title}</p>
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                {link.url} <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer mr-2">
                                <input
                                    type="checkbox"
                                    checked={link.active}
                                    onChange={e => handleUpdate(link.id, { active: e.target.checked })}
                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                Ativo
                            </label>
                            <button onClick={() => handleDelete(link.id)} className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors">
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
