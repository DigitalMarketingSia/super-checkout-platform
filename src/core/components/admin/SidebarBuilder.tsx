import React, { useState } from 'react';
import { SidebarItem } from '../../types';
import { Plus, Trash2, ChevronUp, ChevronDown, Link as LinkIcon, Folder, GripVertical, X, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface SidebarBuilderProps {
    items: SidebarItem[];
    onChange: (items: SidebarItem[]) => void;
}

export const SidebarBuilder: React.FC<SidebarBuilderProps> = ({ items, onChange }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newItemType, setNewItemType] = useState<'link' | 'section'>('link');

    const handleAddItem = (parentId?: string) => {
        const newItem: SidebarItem = {
            id: crypto.randomUUID(),
            title: 'Novo Item',
            type: parentId ? 'link' : newItemType,
            url: parentId ? '/' : (newItemType === 'link' ? '/' : undefined),
            children: newItemType === 'section' ? [] : undefined
        };

        if (parentId) {
            const newItems = items.map(item => {
                if (item.id === parentId) {
                    return { ...item, children: [...(item.children || []), newItem] };
                }
                return item;
            });
            onChange(newItems);
        } else {
            onChange([...items, newItem]);
        }
        setEditingId(newItem.id);
    };

    const handleUpdateItem = (id: string, updates: Partial<SidebarItem>) => {
        const updateRecursive = (list: SidebarItem[]): SidebarItem[] => {
            return list.map(item => {
                if (item.id === id) {
                    return { ...item, ...updates };
                }
                if (item.children) {
                    return { ...item, children: updateRecursive(item.children) };
                }
                return item;
            });
        };
        onChange(updateRecursive(items));
    };

    const handleDeleteItem = (id: string) => {
        const deleteRecursive = (list: SidebarItem[]): SidebarItem[] => {
            return list.filter(item => item.id !== id).map(item => {
                if (item.children) {
                    return { ...item, children: deleteRecursive(item.children) };
                }
                return item;
            });
        };
        onChange(deleteRecursive(items));
    };

    const handleMoveItem = (id: string, direction: 'up' | 'down') => {
        const moveRecursive = (list: SidebarItem[]): SidebarItem[] => {
            const index = list.findIndex(item => item.id === id);
            if (index !== -1) {
                const newList = [...list];
                if (direction === 'up' && index > 0) {
                    [newList[index], newList[index - 1]] = [newList[index - 1], newList[index]];
                } else if (direction === 'down' && index < list.length - 1) {
                    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
                }
                return newList;
            }
            return list.map(item => {
                if (item.children) {
                    return { ...item, children: moveRecursive(item.children) };
                }
                return item;
            });
        };
        onChange(moveRecursive(items));
    };

    const renderItem = (item: SidebarItem, depth = 0, parentId?: string) => {
        const isEditing = editingId === item.id;

        return (
            <div key={item.id} className={`bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 mb-2 ${depth > 0 ? 'ml-8' : ''}`}>
                <div className="p-3 flex items-center gap-3">
                    <div className="text-gray-400 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="p-2 bg-white dark:bg-white/10 rounded">
                        {item.type === 'section' ? <Folder className="w-4 h-4 text-primary" /> : <LinkIcon className="w-4 h-4 text-gray-500" />}
                    </div>

                    <div className="flex-1">
                        {isEditing ? (
                            <div className="flex flex-col gap-2">
                                <input
                                    type="text"
                                    value={item.title}
                                    onChange={e => handleUpdateItem(item.id, { title: e.target.value })}
                                    className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-sm w-full"
                                    placeholder="Título"
                                    autoFocus
                                />
                                {item.type === 'link' && (
                                    <input
                                        type="text"
                                        value={item.url}
                                        onChange={e => handleUpdateItem(item.id, { url: e.target.value })}
                                        className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-2 py-1 text-xs w-full font-mono"
                                        placeholder="URL (ex: /produtos)"
                                    />
                                )}
                            </div>
                        ) : (
                            <div>
                                <h4 className="font-medium text-sm text-gray-900 dark:text-white">{item.title}</h4>
                                {item.type === 'link' && <p className="text-xs text-gray-500 font-mono">{item.url}</p>}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        {isEditing ? (
                            <button onClick={() => setEditingId(null)} className="p-1.5 hover:bg-green-500/10 text-green-500 rounded transition-colors">
                                <Check className="w-4 h-4" />
                            </button>
                        ) : (
                            <>
                                <button onClick={() => handleMoveItem(item.id, 'up')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors text-gray-500">
                                    <ChevronUp className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleMoveItem(item.id, 'down')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded transition-colors text-gray-500">
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingId(item.id)} className="p-1.5 hover:bg-blue-500/10 text-blue-500 rounded transition-colors text-xs font-medium px-2">
                                    Editar
                                </button>
                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {item.type === 'section' && (
                    <div className="p-3 pt-0 border-t border-gray-200 dark:border-white/10 bg-gray-100/50 dark:bg-black/20">
                        <div className="mt-2 space-y-2">
                            {item.children?.map(child => renderItem(child, depth + 1, item.id))}
                        </div>
                        <button
                            onClick={() => handleAddItem(item.id)}
                            className="mt-2 flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors font-medium px-2 py-1"
                        >
                            <Plus className="w-3 h-3" /> Adicionar Link na Seção
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
                <select
                    value={newItemType}
                    onChange={(e) => setNewItemType(e.target.value as 'link' | 'section')}
                    className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/50"
                >
                    <option value="link">Link Simples</option>
                    <option value="section">Seção (Dropdown)</option>
                </select>
                <Button onClick={() => handleAddItem()} variant="secondary" size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Adicionar Item
                </Button>
            </div>

            <div className="space-y-2">
                {items.length === 0 && (
                    <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-lg">
                        Nenhum item no menu lateral
                    </div>
                )}
                {items.map(item => renderItem(item))}
            </div>
        </div>
    );
};
