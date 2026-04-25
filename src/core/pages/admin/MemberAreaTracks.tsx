import React, { useState, useEffect } from 'react';
import { storage } from '../../services/storageService';
import { Track, TrackItem, MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { 
    Plus, 
    Trash2, 
    Eye, 
    EyeOff, 
    X, 
    Search, 
    Layers, 
    ChevronUp, 
    ChevronDown, 
    Settings2, 
    Grid2X2, 
    LayoutList,
    Activity,
    Zap,
    BookOpen,
    Play,
    CheckCircle2,
    Image as ImageIcon,
    Target,
    ArrowRight,
    MoveUp,
    MoveDown
} from 'lucide-react';

interface MemberAreaTracksProps {
    area: MemberArea;
}

export const MemberAreaTracks: React.FC<MemberAreaTracksProps> = ({ area }) => {
    const [tracks, setTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // New Track Form State
    const [newTrackTitle, setNewTrackTitle] = useState('');
    const [newTrackType, setNewTrackType] = useState<'products' | 'contents' | 'modules' | 'lessons'>('contents');
    const [newTrackCardStyle, setNewTrackCardStyle] = useState<'vertical' | 'horizontal'>('horizontal');

    // Item Selection Modal State
    const [showItemModal, setShowItemModal] = useState(false);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; trackId: string | null }>({ isOpen: false, trackId: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedTrackIds, setExpandedTrackIds] = useState<string[]>([]);

    const toggleTrackExpansion = (trackId: string) => {
        setExpandedTrackIds(prev => 
            prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
        );
    };

    const primaryColor = area.primary_color || '#8A2BE2';

    useEffect(() => {
        loadTracks();
    }, [area.id]);

    const loadTracks = async () => {
        setLoading(true);
        try {
            const data = await storage.getTracks(area.id);
            const fullTracks = await Promise.all(data.map(t => storage.getTrackWithItems(t.id)));
            setTracks(fullTracks.filter(t => t !== null) as Track[]);
        } catch (error) {
            console.error('Error loading tracks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTrack = async () => {
        if (!newTrackTitle) return;
        try {
            await storage.createTrack({
                member_area_id: area.id,
                title: newTrackTitle,
                type: newTrackType,
                position: tracks.length,
                is_visible: true,
                card_style: newTrackCardStyle
            });
            setNewTrackTitle('');
            setIsCreating(false);
            loadTracks();
        } catch (error) {
            console.error('Error creating track:', error);
        }
    };

    const handleDeleteTrack = async () => {
        if (!deleteModal.trackId) return;
        setIsDeleting(true);
        try {
            await storage.deleteTrack(deleteModal.trackId);
            setTracks(tracks.filter(t => t.id !== deleteModal.trackId));
            setDeleteModal({ isOpen: false, trackId: null });
        } catch (error) {
            console.error('Error deleting track:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpdateTrackStyle = async (trackId: string, style: 'vertical' | 'horizontal') => {
        try {
            await storage.updateTrack({ id: trackId, card_style: style });
            setTracks(tracks.map(t => t.id === trackId ? { ...t, card_style: style } : t));
        } catch (error) {
            console.error('Error updating track style:', error);
        }
    };

    const handleToggleVisibility = async (track: Track) => {
        try {
            await storage.updateTrack({ id: track.id, is_visible: !track.is_visible });
            setTracks(tracks.map(t => t.id === track.id ? { ...t, is_visible: !t.is_visible } : t));
        } catch (error) {
            console.error('Error updating visibility:', error);
        }
    };

    const handleAddItem = async (item: any) => {
        if (!selectedTrackId) return;
        try {
            const track = tracks.find(t => t.id === selectedTrackId);
            if (!track) return;

            await storage.addTrackItem(selectedTrackId, item.id, (track.items?.length || 0));
            setShowItemModal(false);
            loadTracks();
        } catch (error) {
            console.error('Error adding item:', error);
        }
    };

    const handleRemoveItem = async (itemId: string) => {
        try {
            await storage.removeTrackItem(itemId);
            loadTracks();
        } catch (error) {
            console.error('Error removing item:', error);
        }
    };

    const openItemModal = async (trackId: string, type: string) => {
        setSelectedTrackId(trackId);
        setAvailableItems([]);
        setShowItemModal(true);
        setSearchQuery('');

        try {
            let items: any[] = [];
            if (type === 'products') {
                items = await storage.getProducts();
            } else if (type === 'contents') {
                items = await storage.getContents(area.id);
            } else if (type === 'modules') {
                items = await storage.getModulesByAreaId(area.id);
            } else if (type === 'lessons') {
                const modules = await storage.getModulesByAreaId(area.id);
                items = modules.flatMap(m => m.lessons || []).map(l => ({ 
                    ...l, 
                    title: l.title,
                    subtitle: `Module: ${modules.find(m => m.id === l.module_id)?.title || 'Unknown'}`
                }));
            }
            setAvailableItems(items);
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };

    const moveTrack = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === tracks.length - 1) return;

        const newTracks = [...tracks];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        [newTracks[index], newTracks[targetIndex]] = [newTracks[targetIndex], newTracks[index]];
        newTracks.forEach((t, i) => t.position = i);
        setTracks(newTracks);

        try {
            await storage.updateTrackPositions(newTracks.map(t => ({ id: t.id, position: t.position })));
        } catch (error) {
            console.error('Error updating positions:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-white/5 rounded-[2.5rem] backdrop-blur-3xl animate-pulse">
                <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-6" />
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] font-mono">Syncing Learning Paths...</p>
            </div>
        );
    }

    const filteredItems = availableItems.filter(item => 
        (item.title || item.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto">
            {/* Track Architecture Header */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl relative overflow-hidden transition-all shadow-2xl"
                style={{ 
                    background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${primaryColor}20 100%)`,
                }}
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                
                <div className="flex items-center gap-5 relative z-10">
                    <div>
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Track & <span style={{ color: primaryColor }}>Structure</span></h2>
                        <div className="flex items-center gap-3">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">Portal Vitrine Engine</span>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">{tracks.length} Active Nodes</span>
                        </div>
                    </div>
                </div>
                
                <Button 
                    onClick={() => setIsCreating(true)}
                    className="h-12 px-8 bg-white hover:bg-white/90 font-black uppercase italic tracking-tighter flex items-center gap-2 rounded-xl shadow-2xl transition-all hover:scale-[1.05] active:scale-95 group"
                    style={{ color: '#0A0A1F' }}
                >
                    <Plus className="w-5 h-5 border border-black/10 rounded-md group-hover:rotate-90 transition-transform" style={{ color: primaryColor }} /> 
                    <span className="text-sm">Add New Track</span>
                </Button>
            </div>

            {/* Creation Form - Refined UX version */}
            {isCreating && (
                <div className="mb-12 bg-white/5 border border-white/10 rounded-[2.5rem] p-8 lg:p-10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] animate-in slide-in-from-top-4 duration-500 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Target className="w-32 h-32 text-purple-500" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col lg:flex-row gap-10">
                        <div className="flex-1 space-y-10">
                            <div>
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mb-4 block ml-1">01 // Identification</label>
                                <input
                                    type="text"
                                    value={newTrackTitle}
                                    autoFocus
                                    onChange={(e) => setNewTrackTitle(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-8 py-5 text-xl text-white outline-none focus:border-purple-500 transition-all font-black italic tracking-tighter placeholder:text-white/5"
                                    placeholder="ENTER TRACK TITLE..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mb-4 block ml-1">02 // Content Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'contents', label: 'Contents', icon: BookOpen },
                                            { id: 'products', label: 'Products', icon: Zap },
                                            { id: 'modules', label: 'Modules', icon: Layers },
                                            { id: 'lessons', label: 'Lessons', icon: Play }
                                        ].map(type => (
                                            <button 
                                                key={type.id}
                                                onClick={() => setNewTrackType(type.id as any)}
                                                className={`flex items-center gap-3 px-5 py-4 rounded-xl border transition-all font-bold text-[10px] uppercase tracking-widest ${newTrackType === type.id ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-black/20 border-white/5 text-white/20 hover:border-white/10'}`}
                                            >
                                                <type.icon className="w-4 h-4" /> {type.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mb-4 block ml-1">03 // Visual Strategy</label>
                                    <div className="grid grid-cols-2 gap-4 h-[calc(100%-2rem)]">
                                        <button 
                                            onClick={() => setNewTrackCardStyle('horizontal')}
                                            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border transition-all ${newTrackCardStyle === 'horizontal' ? 'bg-white text-black border-white' : 'bg-black/20 border-white/5 text-white/20 hover:border-white/10'}`}
                                        >
                                            <LayoutList className="w-6 h-6" />
                                            <span className="text-[10px] font-black uppercase tracking-tighter italic">Banner (Horizontal)</span>
                                        </button>
                                        <button 
                                            onClick={() => setNewTrackCardStyle('vertical')}
                                            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border transition-all ${newTrackCardStyle === 'vertical' ? 'bg-white text-black border-white' : 'bg-black/20 border-white/5 text-white/20 hover:border-white/10'}`}
                                        >
                                            <Grid2X2 className="w-6 h-6" />
                                            <span className="text-[10px] font-black uppercase tracking-tighter italic">Poster (Vertical)</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:w-72 flex flex-col gap-3 justify-end">
                            <Button 
                                onClick={handleCreateTrack}
                                style={{ backgroundColor: primaryColor }}
                                className="h-20 w-full font-black uppercase text-white italic tracking-tighter rounded-2xl text-lg shadow-2xl group/btn"
                            >
                                <span>Deploy Track</span>
                                <ArrowRight className="w-5 h-5 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                            </Button>
                            <button 
                                onClick={() => setIsCreating(false)}
                                className="h-12 w-full text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white/60 transition-colors"
                            >
                                Cancel Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-12">
                {tracks.map((track, index) => {
                    const isExpanded = expandedTrackIds.includes(track.id);
                    
                    return (
                        <div key={track.id} className="relative group bg-white/[0.01] border border-white/5 rounded-[3rem] p-1 overflow-hidden transition-all hover:border-white/10 hover:bg-white/[0.02] shadow-2xl">
                            <div className="bg-[#080815] rounded-[2.9rem]">
                                {/* Track Header Consolidated */}
                                <div 
                                    onClick={() => toggleTrackExpansion(track.id)}
                                    className={`flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 lg:p-10 cursor-pointer transition-all ${isExpanded ? 'border-b border-white/5' : ''}`}
                                >
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden group/icon shrink-0">
                                            <Layers className="w-8 h-8 text-white/30 group-hover/icon:scale-110 transition-transform" />
                                            <div className="absolute bottom-0 left-0 w-full h-1" style={{ backgroundColor: primaryColor }} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">{track.title}</h3>
                                                <span className="px-3 py-1 bg-white/5 rounded-full text-[8px] font-mono font-bold text-white/40 uppercase tracking-widest border border-white/5">{track.type}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                                <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> {track.items?.length || 0} Objects Mapped</span>
                                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                                <span className="flex items-center gap-1.5 line-clamp-1 italic">
                                                    {track.card_style === 'horizontal' ? <LayoutList className="w-3.5 h-3.5" /> : <Grid2X2 className="w-3.5 h-3.5" />}
                                                    Strategy: {track.card_style}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 bg-black/40 p-2 rounded-2xl border border-white/5 shadow-inner" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex gap-1 pr-2 border-r border-white/5">
                                            <button
                                                onClick={() => moveTrack(index, 'up')}
                                                disabled={index === 0}
                                                className="p-3 text-white/40 hover:text-white disabled:opacity-0 transition-all hover:bg-white/5 rounded-xl"
                                            >
                                                <MoveUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => moveTrack(index, 'down')}
                                                disabled={index === tracks.length - 1}
                                                className="p-3 text-white/40 hover:text-white disabled:opacity-0 transition-all hover:bg-white/5 rounded-xl"
                                            >
                                                <MoveDown className="w-4 h-4" />
                                            </button>
                                        </div>
                                        
                                        <button
                                            onClick={() => handleToggleVisibility(track)}
                                            className={`p-3 rounded-xl transition-all ${track.is_visible ? 'text-green-500 bg-green-500/10' : 'text-white/20 bg-white/5'}`}
                                        >
                                            {track.is_visible ? <Eye size={18} /> : <EyeOff size={18} />}
                                        </button>
                                        
                                        <button
                                            onClick={() => handleUpdateTrackStyle(track.id, track.card_style === 'horizontal' ? 'vertical' : 'horizontal')}
                                            className="p-3 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                                            title="Toggle Style"
                                        >
                                            <Settings2 size={18} />
                                        </button>

                                        <button
                                            onClick={() => setDeleteModal({ isOpen: true, trackId: track.id })}
                                            className="p-3 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Internal Content (Only if expanded) */}
                                {isExpanded && (
                                    <div className="p-8 lg:p-10 animate-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                            {track.items?.map((item) => (
                                                <div key={item.id} className="group/item relative flex flex-col gap-3">
                                                    <div className="relative aspect-video sm:aspect-square rounded-[2rem] bg-black/60 border border-white/5 overflow-hidden transition-all hover:border-purple-500/30 shadow-lg">
                                                        {(item.product?.imageUrl || item.content?.thumbnail_url) ? (
                                                            <img
                                                                src={item.product?.imageUrl || item.content?.thumbnail_url}
                                                                className="w-full h-full object-cover opacity-60 group-hover/item:opacity-90 transition-all group-hover/item:scale-110 duration-700"
                                                                alt="Item"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center opacity-10 group-hover/item:opacity-30 transition-opacity">
                                                                <Zap className="w-10 h-10" />
                                                            </div>
                                                        )}
                                                        
                                                        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent">
                                                            <div className="flex items-center justify-between gap-4">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[10px] font-black text-white uppercase italic tracking-tighter truncate leading-none">
                                                                        {item.product?.name || item.content?.title || item.module?.title || item.lesson?.title || 'UNKNOWN'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                                                            className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-xl shadow-2xl opacity-0 group-hover/item:opacity-100 transition-all translate-y-2 group-hover/item:translate-y-0 hover:scale-110 active:scale-90"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {/* Invite Slot */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openItemModal(track.id, track.type); }}
                                                className="aspect-video sm:aspect-square rounded-[2rem] border-2 border-dashed border-white/5 hover:border-purple-500/20 bg-white/[0.01] hover:bg-purple-500/[0.03] transition-all flex flex-col items-center justify-center gap-4 group/add shadow-inner"
                                            >
                                                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover/add:scale-110 group-hover/add:bg-purple-500/20 group-hover/add:border-purple-500/30 transition-all shadow-2xl">
                                                    <Plus className="w-7 h-7 text-white/40 group-hover/add:text-purple-400" />
                                                </div>
                                                <div className="text-center">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/10 group-hover/add:text-purple-500/60 transition-colors">Map Node</span>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {tracks.length === 0 && (
                    <div className="py-32 flex flex-col items-center gap-8 bg-white/[0.02] border border-white/5 rounded-[4rem] border-dashed">
                        <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center shadow-inner relative overflow-hidden">
                            <Layers className="w-10 h-10 text-white/10" />
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">No Discovery Structure</h3>
                            <p className="text-white/20 text-sm font-medium max-w-xs mx-auto">Deploy your first track to start mapping content to the portal vitrine.</p>
                        </div>
                        <Button 
                            onClick={() => setIsCreating(true)} 
                            style={{ borderColor: primaryColor, color: primaryColor }}
                            variant="ghost" 
                            className="px-10 h-14 border rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white/5"
                        >
                            Deploy Alpha Node
                        </Button>
                    </div>
                )}
            </div>

            {/* Selection Modal - Premium Gallery Overlay */}
            {showItemModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 sm:p-20 animate-in fade-in duration-500">
                    <div className="bg-[#0A0A1F] w-full max-w-7xl h-full rounded-[4rem] border border-white/10 shadow-[0_0_150px_rgba(138,43,226,0.15)] flex flex-col overflow-hidden relative">
                        {/* Background Glows */}
                        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-[150px] opacity-10 pointer-events-none" style={{ backgroundColor: primaryColor }} />
                        
                        {/* Modal Header */}
                        <div className="p-10 lg:p-14 border-b border-white/5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10 bg-white/[0.01]">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                                    <Target className="w-8 h-8 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter mb-1.5 leading-none line-through decoration-white/20">Entity <span style={{ color: primaryColor }}>Selection</span></h3>
                                    <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.3em] leading-none ml-1">Scan. Match. Integrate.</p>
                                </div>
                            </div>
                            
                            <div className="flex-1 lg:max-w-2xl w-full relative group">
                                <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-6 h-6 text-white/10 group-focus-within:text-purple-500 transition-colors" />
                                <input 
                                    type="text"
                                    autoFocus
                                    placeholder="INITIATING SCAN SEQUENCE..."
                                    className="w-full bg-black/60 border border-white/5 rounded-3xl pl-20 pr-10 py-6 text-xl text-white outline-none focus:border-purple-500 font-black italic tracking-tighter shadow-3xl placeholder:text-white/5"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <button 
                                onClick={() => setShowItemModal(false)}
                                className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all hover:bg-white/10 border border-white/5 active:scale-90"
                            >
                                <X className="w-7 h-7" />
                            </button>
                        </div>

                        {/* Modal Body - Gallery Grid */}
                        <div className="flex-1 p-10 lg:p-14 overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8 pb-32">
                            {filteredItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleAddItem(item)}
                                    className="group/btn relative aspect-square rounded-[2.5rem] bg-black/40 border border-white/5 overflow-hidden transition-all hover:border-purple-500/50 text-left shadow-2xl"
                                >
                                    {(item.imageUrl || item.thumbnail_url || item.image_url || item.image_horizontal_url || item.image_vertical_url) ? (
                                        <img src={item.imageUrl || item.thumbnail_url || item.image_url || item.image_horizontal_url || item.image_vertical_url} className="w-full h-full object-cover opacity-40 group-hover/btn:opacity-100 transition-all duration-1000 group-hover/btn:scale-110" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5 group-hover/btn:bg-white/10 transition-colors">
                                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5">
                                                <ImageIcon className="w-6 h-6 text-white/10" />
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="absolute inset-0 bg-purple-500/20 opacity-0 group-hover/btn:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[4px]">
                                        <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center scale-75 group-hover/btn:scale-100 transition-all shadow-3xl">
                                            <Plus className="w-8 h-8" />
                                        </div>
                                    </div>

                                    <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent">
                                        <p className="text-xs font-black text-white italic uppercase tracking-tighter leading-tight mb-1.5 group-hover/btn:translate-y-[-4px] transition-transform">{item.name || item.title}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-bold text-purple-500 uppercase tracking-widest">{item.subtitle || 'ENTITY NODE'}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                            
                            {filteredItems.length === 0 && (
                                <div className="col-span-full py-40 flex flex-col items-center gap-10">
                                    <div className="w-32 h-32 rounded-full border border-dashed border-white/10 flex items-center justify-center animate-pulse">
                                        <Search className="w-12 h-12 text-white/10" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">Neural Mismatch</p>
                                        <p className="text-white/20 text-sm font-medium uppercase tracking-widest max-w-sm mx-auto">No assets detected with current scan sequence.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Sticky Modal Footer */}
                        <div className="absolute bottom-0 inset-x-0 p-10 bg-gradient-to-t from-[#0A0A1F] via-[#0A0A1F] to-transparent flex items-center justify-between">
                            <div className="flex items-center gap-4 bg-black/40 px-6 py-4 rounded-2xl border border-white/5 backdrop-blur-3xl">
                                <Activity className="w-4 h-4 text-purple-500" />
                                <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.3em]">Network Grid Synced: {availableItems.length} Nodes</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-[10px] font-mono text-white/10 uppercase tracking-widest italic py-4">SECURE PICKER v5.0</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, trackId: null })}
                onConfirm={handleDeleteTrack}
                title="Decommission Track"
                message="Confirm absolute removal of this learning path? All mappings will be purged from the vitrine protocol."
                confirmText="PURGE TRACK"
                variant="danger"
                loading={isDeleting}
            />
        </div>
    );
};
