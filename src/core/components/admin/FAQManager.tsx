import React, { useState } from 'react';
import { FAQ } from '../../types';
import { Plus, Trash2, Edit2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';

interface FAQManagerProps {
    faqs: FAQ[];
    onChange: (faqs: FAQ[]) => void;
}

export const FAQManager: React.FC<FAQManagerProps> = ({ faqs, onChange }) => {
    const [newFAQ, setNewFAQ] = useState<Partial<FAQ>>({ question: '', answer: '', active: true });
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleAdd = () => {
        if (!newFAQ.question || !newFAQ.answer) return;
        const faq: FAQ = {
            id: crypto.randomUUID(),
            question: newFAQ.question,
            answer: newFAQ.answer,
            active: true
        };
        onChange([...faqs, faq]);
        setNewFAQ({ question: '', answer: '', active: true });
    };

    const handleUpdate = (id: string, updates: Partial<FAQ>) => {
        onChange(faqs.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleDelete = (id: string) => {
        onChange(faqs.filter(f => f.id !== id));
    };

    return (
        <div className="space-y-6">
            {/* Add New FAQ */}
            <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-lg border border-gray-200 dark:border-white/10 space-y-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Adicionar Nova Pergunta</h4>
                <input
                    type="text"
                    placeholder="Pergunta"
                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-sm"
                    value={newFAQ.question}
                    onChange={e => setNewFAQ({ ...newFAQ, question: e.target.value })}
                />
                <textarea
                    placeholder="Resposta"
                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-3 py-2 text-sm h-24 resize-none"
                    value={newFAQ.answer}
                    onChange={e => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                />
                <div className="flex justify-end">
                    <Button onClick={handleAdd} size="sm" disabled={!newFAQ.question || !newFAQ.answer}>
                        <Plus className="w-4 h-4 mr-2" /> Adicionar FAQ
                    </Button>
                </div>
            </div>

            {/* List FAQs */}
            <div className="space-y-2">
                {faqs.map(faq => (
                    <div key={faq.id} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
                        <div
                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                        >
                            <div className="flex items-center gap-3 flex-1">
                                <HelpCircle className="w-4 h-4 text-primary" />
                                <span className="font-medium text-sm text-gray-900 dark:text-white">{faq.question}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div onClick={e => e.stopPropagation()}>
                                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer mr-2">
                                        <input
                                            type="checkbox"
                                            checked={faq.active}
                                            onChange={e => handleUpdate(faq.id, { active: e.target.checked })}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        Ativo
                                    </label>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(faq.id); }}
                                    className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                {expandedId === faq.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </div>
                        </div>

                        {expandedId === faq.id && (
                            <div className="p-4 pt-0 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20">
                                <div className="mt-3 whitespace-pre-wrap">{faq.answer}</div>
                            </div>
                        )}
                    </div>
                ))}
                {faqs.length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-4">Nenhuma pergunta cadastrada.</p>
                )}
            </div>
        </div>
    );
};
