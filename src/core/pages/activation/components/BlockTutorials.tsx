import React, { useEffect, useState } from 'react';
import { Play, FileText, Download, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../services/supabase';
import { TutorialViewer } from './TutorialViewer';
import { useTranslation } from 'react-i18next';

interface Tutorial {
    id: string;
    title: string;
    type: 'video' | 'text' | 'link' | 'file' | 'image';
    content: string;
    video_url?: string;
    file_url?: string;
    image_url?: string;
    description?: string;
    order: number;
}

interface BlockTutorialsProps {
    planType?: string; // e.g. 'agency', 'starter'
}

export const BlockTutorials: React.FC<BlockTutorialsProps> = ({ planType }) => {
    const [t] = useTranslation('portal');
    const [tutorials, setTutorials] = useState<Tutorial[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();

    // Derived state from URL
    const tutorialId = searchParams.get('tutorial');
    const selectedTutorial = tutorials.find(t => t.id === tutorialId) || null;

    useEffect(() => {
        fetchTutorials();
    }, [planType]);

    const fetchTutorials = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('activation_content')
                .select('*')
                .eq('active', true)
                .order('order', { ascending: true });

            if (data) {
                const filtered = data.filter((item: any) => {
                    const scope = item.plan_scope || 'all';
                    if (scope === 'all') return true;
                    if (planType && scope.includes(planType.toLowerCase())) return true;
                    return false;
                });
                setTutorials(filtered);
            }
        } catch (error) {
            console.error('Error fetching tutorials:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTutorial = (id: string | null) => {
        const newParams = new URLSearchParams(searchParams);
        if (id) {
            newParams.set('tutorial', id);
        } else {
            newParams.delete('tutorial');
        }
        setSearchParams(newParams);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'video': return <Play className="w-5 h-5 text-red-400" />;
            case 'link': return <ExternalLink className="w-5 h-5 text-blue-400" />;
            case 'file': return <Download className="w-5 h-5 text-green-400" />;
            default: return <FileText className="w-5 h-5 text-gray-400" />;
        }
    };

    const getThumbnail = (url: string) => {
        if (!url) return null;
        const videoId = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
        if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        return null;
    };

    if (loading) return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-white/5 rounded-2xl" />)}
        </div>
    );

    if (tutorials.length === 0) return (
        <div className="text-center py-12 text-gray-500 bg-white/5 rounded-2xl border border-dashed border-white/10">
            {t('tutorials.no_tutorials')}
        </div>
    );

    // RENDER: Detail View
    if (selectedTutorial) {
        const currentIndex = tutorials.findIndex(t => t.id === selectedTutorial.id);
        const prevTutorial = currentIndex > 0 ? tutorials[currentIndex - 1] : null;
        const nextTutorial = currentIndex < tutorials.length - 1 ? tutorials[currentIndex + 1] : null;

        console.log('Nav Debug:', { currentIndex, prev: prevTutorial?.title, next: nextTutorial?.title });

        return (
            <TutorialViewer
                tutorial={selectedTutorial}
                onBack={() => handleSelectTutorial(null)}
                onPrev={prevTutorial ? () => handleSelectTutorial(prevTutorial.id) : undefined}
                onNext={nextTutorial ? () => handleSelectTutorial(nextTutorial.id) : undefined}
                prevTitle={prevTutorial?.title}
                nextTitle={nextTutorial?.title}
            />
        );
    }

    // RENDER: List View
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tutorials.map((tutorial, idx) => {
                const videoUrl = tutorial.video_url || (tutorial.type === 'video' ? tutorial.content : '');
                const thumb = getThumbnail(videoUrl) || tutorial.image_url;

                return (
                    <div
                        key={tutorial.id}
                        onClick={() => handleSelectTutorial(tutorial.id)}
                        className="group bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden hover:border-primary/50 hover:shadow-[0_20px_40px_rgba(138,43,226,0.15)] transition-all duration-500 cursor-pointer relative flex flex-col h-full backdrop-blur-xl animate-in fade-in slide-in-from-bottom duration-500"
                        style={{ animationDelay: `${idx * 100}ms` }}
                    >
                        {/* Thumbnail Area */}
                        <div className="aspect-video bg-black/40 relative overflow-hidden flex-shrink-0">
                            {thumb ? (
                                <>
                                    <img src={thumb} alt={tutorial.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" />
                                    {(tutorial.type === 'video' || tutorial.video_url || videoUrl) && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-16 h-16 bg-primary/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 group-hover:scale-125 transition-all duration-500 shadow-2xl">
                                                <Play className="w-6 h-6 text-white fill-white ml-1" />
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-white/5 group-hover:bg-primary/5 transition-colors duration-500">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/5 group-hover:border-primary/20">
                                        {getIcon(tutorial.type)}
                                    </div>
                                </div>
                            )}

                            {/* Type Badge */}
                            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/90">
                                {(tutorial.video_url || tutorial.type === 'video' || videoUrl) ? t('tutorials.streaming') : tutorial.type}
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="p-8 flex flex-col flex-1">
                            <h4 className="font-display font-black italic uppercase italic text-lg text-white mb-3 leading-tight group-hover:text-primary transition-colors line-clamp-2 tracking-tighter">
                                {tutorial.title}
                            </h4>
                            <p className="text-sm font-medium text-gray-400 line-clamp-3 mb-6 flex-1 leading-relaxed">
                                {tutorial.description || t('tutorials.master_feature')}
                            </p>

                            <div className="w-full py-4 rounded-2xl bg-white/5 text-center text-xs font-black uppercase tracking-[0.2em] text-gray-300 group-hover:bg-primary group-hover:text-white group-hover:shadow-[0_10px_20px_rgba(138,43,226,0.3)] transition-all mt-auto border border-white/5 group-hover:border-primary">
                                {t('tutorials.start_now')}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
