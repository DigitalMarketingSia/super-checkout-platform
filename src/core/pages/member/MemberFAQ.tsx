import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MemberArea } from '../../types';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const MemberFAQ: React.FC = () => {
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const activeFaqs = memberArea?.faqs?.filter(faq => faq.active) || [];

    const toggleFaq = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 max-w-4xl">
            <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full mb-4">
                    <HelpCircle className="w-8 h-8 text-red-600" style={{ color: memberArea?.primary_color }} />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">Perguntas Frequentes</h1>
                <p className="text-gray-400">Tire suas dúvidas sobre o conteúdo e a plataforma.</p>
            </div>

            {activeFaqs.length === 0 ? (
                <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                    <h3 className="text-xl font-bold text-white mb-2">Nenhuma dúvida encontrada</h3>
                    <p className="text-gray-400">No momento não há perguntas frequentes cadastradas.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {activeFaqs.map((faq, index) => (
                        <div
                            key={faq.id}
                            className="bg-[#1A1D21] rounded-xl border border-white/10 overflow-hidden transition-all duration-300"
                        >
                            <button
                                onClick={() => toggleFaq(index)}
                                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                            >
                                <span className="font-medium text-white text-lg pr-4">{faq.question}</span>
                                {openIndex === index ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                )}
                            </button>

                            <div
                                className={`transition-all duration-300 ease-in-out overflow-hidden ${openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                                    }`}
                            >
                                <div className="px-6 pb-6 text-gray-400 leading-relaxed border-t border-white/5 pt-4">
                                    {faq.answer}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
