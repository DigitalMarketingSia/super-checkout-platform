import React from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Tutorial {
    id: string;
    title: string;
    type: string;
    content?: string; // Text content if type=text or mixed
    video_url?: string;
    file_url?: string;
    image_url?: string;
    description?: string;
    content_order?: string[];
}

interface TutorialViewerProps {
    tutorial: Tutorial;
    onBack: () => void;
    onClose?: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    prevTitle?: string;
    nextTitle?: string;
}

export const TutorialViewer: React.FC<TutorialViewerProps> = (props) => {
    const [t] = useTranslation('portal');
    const { tutorial, onBack, onPrev, onNext } = props;

    // Improved Regex for YouTube
    const getEmbedUrl = (url: string) => {
        if (!url) return null;
        const videoId = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
        return null;
    };

    const hasExplicitVideo = !!tutorial.video_url;
    const hasExplicitFile = !!tutorial.file_url;

    // Derive Video URL: Use explicit column first, fallback to content ONLY if type is legacy 'video'
    const videoUrl = hasExplicitVideo ? tutorial.video_url : (tutorial.type === 'video' ? tutorial.content : undefined);

    // Derive File URL: Use explicit column first, fallback to content ONLY if type is legacy 'file'
    const fileUrl = hasExplicitFile ? tutorial.file_url : (tutorial.type === 'file' ? tutorial.content : undefined);
    const linkUrl = (!hasExplicitFile && tutorial.type === 'link') ? tutorial.content : undefined;

    // Text Visibility Logic:
    // Show 'content' as text unless it is being used as the resource URL for the active Section type.
    const isContentUsedAsResource = (tutorial.content === videoUrl) || (tutorial.content === fileUrl) || (tutorial.content === linkUrl);

    // If we have explicit columns (mixed content), 'content' is almost always independent text.
    // If strict legacy, 'content' might be the video URL.
    const showText = tutorial.content && !isContentUsedAsResource;

    const embedSrc = videoUrl ? getEmbedUrl(videoUrl) : null;

    // Default order
    const order = (tutorial as any).content_order || ['video', 'text', 'file', 'image'];

    const renderSection = (type: string) => {
        switch (type) {
            case 'video':
                return embedSrc ? (
                    <div key="video" className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/5 mb-8">
                        <iframe
                            src={embedSrc}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                ) : null;
            case 'image':
                return tutorial.image_url ? (
                    <div key="image" className="rounded-xl overflow-hidden shadow-lg border border-white/5 mb-8">
                        <img src={tutorial.image_url} alt={tutorial.title} className="w-full h-auto" />
                    </div>
                ) : null;
            case 'text':
                return showText ? (
                    <div key="text" className="prose prose-invert max-w-none p-6 bg-white/5 rounded-2xl border border-white/5 mb-8">
                        <div className="whitespace-pre-wrap text-gray-300 font-sans leading-relaxed">
                            {tutorial.content}
                        </div>
                    </div>
                ) : null;
            case 'file':
                return (fileUrl || linkUrl) ? (
                    <div key="file" className="flex flex-wrap gap-4 pt-4 mb-4">
                        {fileUrl && (
                            <a
                                href={fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-green-500/20 w-full sm:w-auto justify-center"
                            >
                                <Download className="w-5 h-5" />
                                <span>{t('tutorials.download_file')}</span>
                            </a>
                        )}

                        {linkUrl && (
                            <a
                                href={linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/20 w-full sm:w-auto justify-center"
                            >
                                <ExternalLink className="w-5 h-5" />
                                <span>{t('tutorials.access_external')}</span>
                            </a>
                        )}
                    </div>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <div className="w-full animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Header / Nav */}
            <button
                type="button"
                onClick={onBack}
                className="mb-8 flex items-center gap-3 text-gray-500 hover:text-white transition-all group px-4 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/10"
            >
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">{t('tutorials.back_to_tutorials')}</span>
            </button>

            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-3xl shadow-2xl">

                {/* Content Header */}
                <div className="p-10 md:p-14 border-b border-white/5 bg-white/5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest mb-6">
                        {t('tutorials.featured_lesson')}
                    </div>
                    <h1 className="text-3xl md:text-5xl font-display font-black text-white mb-6 uppercase tracking-tighter italic leading-none">{tutorial.title}</h1>
                    {tutorial.description && <p className="text-gray-400 text-xl font-medium leading-relaxed max-w-3xl">{tutorial.description}</p>}
                </div>

                <div className="p-10 md:p-14">
                    {order.map((type: string) => renderSection(type))}
                </div>

                {/* Footer Navigation */}
                {(onPrev || onNext) && (
                    <div className="p-10 md:p-14 border-t border-white/5 bg-white/5 flex flex-col sm:flex-row justify-between items-center gap-8">
                        {onPrev ? (
                            <button
                                onClick={onPrev}
                                className="flex flex-col items-start gap-2 p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/50 transition-all group text-left w-full sm:w-auto min-w-[300px] active:scale-[0.98]"
                            >
                                <span className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2 group-hover:text-primary transition-colors tracking-widest">
                                    <ChevronLeft className="w-3 h-3" /> {t('tutorials.prev_lesson')}
                                </span>
                                <span className="text-lg font-black text-white truncate w-full group-hover:text-primary transition-colors font-display italic uppercase tracking-tighter">
                                    {(props as any).prevTitle || t('tutorials.previous')}
                                </span>
                            </button>
                        ) : (
                            <div className="hidden sm:block min-w-[300px]" /> // Spacer
                        )}

                        {onNext && (
                            <button
                                onClick={onNext}
                                className="flex flex-col items-end gap-2 p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/50 transition-all group text-right w-full sm:w-auto min-w-[300px] active:scale-[0.98]"
                            >
                                <span className="text-[10px] font-black text-gray-500 uppercase flex items-center gap-2 group-hover:text-primary transition-colors tracking-widest">
                                    {t('tutorials.next_lesson')} <ChevronRight className="w-3 h-3" />
                                </span>
                                <span className="text-lg font-black text-white truncate w-full group-hover:text-primary transition-colors font-display italic uppercase tracking-tighter">
                                    {(props as any).nextTitle || t('tutorials.next')}
                                </span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
