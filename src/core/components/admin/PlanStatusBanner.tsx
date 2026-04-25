import React, { useState } from 'react';
import { useFeatures } from '../../hooks/useFeatures';
import { Zap, ArrowRight, X } from 'lucide-react';
import { UpsellModal } from '../ui/UpsellModal';

export const PlanStatusBanner = () => {
    const { getLimit, plan, isOwner, loading } = useFeatures();
    const [dismissed, setDismissed] = useState(false);
    const [isUpsellOpen, setIsUpsellOpen] = useState(false);

    // Refactored to use static resolution from useFeatures
    const isFree = plan === 'free' && !isOwner;
    const showBanner = isFree && !dismissed;

    if (loading || !showBanner) return null;

    return (
        <>
            <div className="mb-8 p-4 bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-50 hover:opacity-100 cursor-pointer" onClick={() => setDismissed(true)}>
                    <X className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-pulse">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm sm:text-base">Upgrade Disponível</h3>
                            <p className="text-xs sm:text-sm text-purple-200/70">
                                Seu plano atual permite até {getLimit('domains') || 0} {getLimit('domains') === 1 ? 'domínio' : 'domínios'}. 
                                Libere domínios ilimitados agora!
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsUpsellOpen(true)}
                        className="w-full sm:w-auto px-5 py-2 bg-white text-purple-900 font-bold rounded-lg text-sm hover:scale-105 transition-transform flex items-center justify-center gap-2 shadow-lg shadow-white/10"
                    >
                        Destravar Ilimitado <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <UpsellModal
                isOpen={isUpsellOpen}
                onClose={() => setIsUpsellOpen(false)}
                offerSlug="unlimited_domains"
            />
        </>
    );
};
