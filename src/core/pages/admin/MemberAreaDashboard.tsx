import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { ArrowLeft, BookOpen, Settings, Globe, Package, ExternalLink, Layers, Users, Activity, Terminal, Lock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Contents } from './Contents';
import { MemberSettings } from './MemberSettings';
import { MemberDomains } from './MemberDomains';
import { MemberAreaTracks } from './MemberAreaTracks';
import { MemberAreaMembers } from './MemberAreaMembers';
import { MemberAreaProducts } from './MemberAreaProducts';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { useFeatures } from '../../hooks/useFeatures';
import { UpsellModal } from '../../components/ui/UpsellModal';
import { isPlanLimitError } from '../../services/featureAccess';

export const MemberAreaDashboard = () => {
    const { t } = useTranslation('admin');
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isNew = !id || id === 'new';
    const { getLimit, loading: checkingFeatures } = useFeatures();

    const [activeTab, setActiveTab] = useState<'contents' | 'settings' | 'domains' | 'products' | 'tracks' | 'members'>('contents');
    const [loading, setLoading] = useState(true);
    const [createGuardLoading, setCreateGuardLoading] = useState(false);
    const [canCreateNewArea, setCanCreateNewArea] = useState(true);
    const [currentAreaCount, setCurrentAreaCount] = useState(0);
    const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);
    const [area, setArea] = useState<MemberArea>({
        id: '',
        owner_id: '',
        name: '',
        slug: '',
        primary_color: '#8A2BE2',
        created_at: ''
    });
    const memberAreaLimit = getLimit('member_areas');

    useEffect(() => {
        if (!isNew && id) {
            loadArea(id);
        } else {
            setArea((current) => ({ ...current, id: current.id || crypto.randomUUID() }));
            setLoading(false);
            setActiveTab('settings');
        }
    }, [id, isNew]);

    useEffect(() => {
        if (!isNew || checkingFeatures) return;

        if (memberAreaLimit === 'unlimited' || memberAreaLimit === null) {
            setCanCreateNewArea(true);
            return;
        }

        let isMounted = true;
        setCreateGuardLoading(true);

        storage.getMemberAreas()
            .then((areas) => {
                if (!isMounted) return;
                setCurrentAreaCount(areas.length);
                setCanCreateNewArea(areas.length < memberAreaLimit);
            })
            .catch((error) => {
                console.error('Error checking member area creation limit:', error);
            })
            .finally(() => {
                if (isMounted) {
                    setCreateGuardLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [checkingFeatures, isNew, memberAreaLimit]);

    const loadArea = async (areaId: string) => {
        setLoading(true);
        try {
            const data = await storage.getMemberAreaById(areaId);
            if (data) {
                setArea(data);
            } else {
                navigate('/admin/members');
            }
        } catch (error) {
            console.error('Error loading area:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updatedArea: MemberArea) => {
        try {
            if (isNew) {
                if (!canCreateNewArea) {
                    setIsUpsellModalOpen(true);
                    return;
                }

                const { created_at, ...areaData } = updatedArea;
                // @ts-ignore
                const newArea = await storage.createMemberArea(areaData);
                navigate(`/admin/members/${newArea.id}`, { replace: true });
            } else {
                await storage.updateMemberArea(updatedArea);
            }
            setArea(updatedArea);
        } catch (error: any) {
            console.error('Error saving area:', error);
            if (isPlanLimitError(error, 'member_areas')) {
                setCanCreateNewArea(false);
                setIsUpsellModalOpen(true);
                return;
            }
            alert(`${t('member_area_details.error_save', 'Erro ao salvar:')} ${error.message}`);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4" />
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest font-mono">
                        {t('member_area_details.loading')}
                    </p>
                </div>
            </Layout>
        );
    }

    if (isNew && (checkingFeatures || createGuardLoading)) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4" />
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest font-mono">
                        {t('member_areas_page.checking_plan')}
                    </p>
                </div>
            </Layout>
        );
    }

    if (isNew && !canCreateNewArea) {
        return (
            <Layout>
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-6 mb-10">
                        <button
                            onClick={() => navigate('/admin/members')}
                            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                            <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono mb-1">
                                {t('member_area_details.control_plane')}
                            </p>
                            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                                {t('member_areas_page.upgrade_gate_title')}
                            </h1>
                        </div>
                    </div>

                    <div className="bg-[#0A0A15]/50 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-10 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
                        <div className="relative z-10">
                            <div className="w-20 h-20 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-8">
                                <Lock className="w-9 h-9 text-emerald-400" />
                            </div>
                            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">
                                {t('member_areas_page.upgrade_gate_heading')}
                            </h2>
                            <p className="text-white/50 text-base leading-relaxed max-w-2xl">
                                {t('member_areas_page.upgrade_gate_desc')}
                            </p>
                            {memberAreaLimit && (
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-300/80 mt-6">
                                    {t('member_areas_page.limit_status', {
                                        count: currentAreaCount,
                                        limit: memberAreaLimit === 'unlimited' ? '∞' : memberAreaLimit,
                                    })}
                                </p>
                            )}

                            <div className="flex flex-col sm:flex-row gap-4 mt-10">
                                <Button
                                    onClick={() => setIsUpsellModalOpen(true)}
                                    className="bg-purple-600 hover:bg-purple-500 text-white border-none px-8 py-5 rounded-2xl font-black uppercase tracking-tight"
                                >
                                    {t('member_areas_page.upgrade_gate_cta')}
                                </Button>
                                <Button
                                    onClick={() => navigate('/admin/members')}
                                    className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-8 py-5 rounded-2xl font-black uppercase tracking-tight"
                                >
                                    {t('member_areas_page.upgrade_gate_back')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <UpsellModal
                    isOpen={isUpsellModalOpen}
                    onClose={() => setIsUpsellModalOpen(false)}
                    offerSlug="unlimited_domains"
                />
            </Layout>
        );
    }

    const tabs = [
        { id: 'contents', label: t('member_area_details.tabs.contents'), icon: BookOpen, hideIfNew: true },
        { id: 'tracks', label: t('member_area_details.tabs.tracks'), icon: Layers, hideIfNew: true },
        { id: 'members', label: t('member_area_details.tabs.members'), icon: Users, hideIfNew: true },
        { id: 'settings', label: t('member_area_details.tabs.settings'), icon: Settings, hideIfNew: false },
        { id: 'products', label: t('member_area_details.tabs.products'), icon: Package, hideIfNew: true },
    ];

    return (
        <Layout>
            {/* Control Plane Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => navigate('/admin/members')} 
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                    >
                        <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Terminal className="w-3 h-3 text-purple-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono">
                                {t('member_area_details.control_plane')}
                            </span>
                        </div>
                        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
                            {isNew ? t('member_area_details.new_title', 'New Academy') : area.name}
                        </h1>
                        {!isNew && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-mono text-white/40">
                                    {t('member_area_details.slug_badge')}
                                </span>
                                <span className="text-purple-400/80 text-sm font-bold tracking-tight">/app/{area.slug}</span>
                            </div>
                        )}
                    </div>
                </div>

                {!isNew && (
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end mr-2">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest leading-none mb-1">
                                {t('member_area_details.operational_status')}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-green-500 uppercase tracking-tighter italic">
                                    {t('member_area_details.live')}
                                </span>
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                            </div>
                        </div>
                        <a
                            href={`/app/${area.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-6 py-4 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-2xl border border-green-500/20 hover:border-green-500/40 transition-all font-black uppercase italic tracking-tighter text-sm group shadow-[0_0_25px_rgba(34,197,94,0.15)] hover:shadow-[0_0_35px_rgba(34,197,94,0.3)]"
                        >
                            <ExternalLink className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform" />
                            <span>{t('member_area_details.preview_portal')}</span>
                        </a>
                    </div>
                )}
            </div>

            {/* Tactical Tab Switcher */}
            <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2 no-scrollbar">
                {tabs.filter(tab => !tab.hideIfNew || !isNew).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-xs font-black uppercase italic tracking-tight transition-all relative overflow-hidden group border ${
                            activeTab === tab.id 
                            ? 'bg-white/5 border-purple-500/40 text-white shadow-[0_0_20px_rgba(147,51,234,0.1)]' 
                            : 'bg-transparent border-white/5 text-white/40 hover:text-white hover:bg-white/5 hover:border-white/10'
                        }`}
                    >
                        {activeTab === tab.id && (
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent animate-pulse" />
                        )}
                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-purple-400' : 'text-white/20 group-hover:text-white/60'}`} />
                        <span className="relative z-10">{tab.label}</span>
                        {activeTab === tab.id && (
                            <div 
                                className="absolute bottom-0 left-0 right-0 h-0.5" 
                                style={{ background: `linear-gradient(90deg, transparent, ${area.primary_color || '#8A2BE2'}, transparent)` }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 min-h-[400px]">
                <div className="bg-[#0A0A15]/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 p-8 lg:p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Activity className="w-32 h-32 text-purple-500 rotate-12" />
                    </div>

                    <div className="relative z-10">
                        {activeTab === 'contents' && !isNew && (
                            <Contents memberAreaId={area.id} primaryColor={area.primary_color} />
                        )}

                        {activeTab === 'tracks' && !isNew && (
                            <MemberAreaTracks area={area} />
                        )}

                        {activeTab === 'members' && !isNew && (
                            <MemberAreaMembers area={area} />
                        )}

                        {activeTab === 'settings' && (
                            <div className="space-y-16">
                                <MemberSettings area={area} onSave={handleSave} isNew={isNew} />
                                {!isNew && (
                                    <div className="pt-16 border-t border-white/5">
                                        <div 
                                            className="mb-8 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl flex items-center gap-4"
                                            style={{ 
                                                background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${(area.primary_color || '#8A2BE2')}20 100%)`,
                                            }}
                                        >
                                            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
                                                <Globe className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">
                                                    {t('member_area_details.domains_heading.prefix')}{' '}
                                                    <span style={{ color: area.primary_color || '#8A2BE2' }}>
                                                        {t('member_area_details.domains_heading.highlight')}
                                                    </span>
                                                </h2>
                                                <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                                                    <Terminal className="w-3.5 h-3.5" />
                                                    {t('member_area_details.domains_heading.subtitle')}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-black/20 rounded-3xl border border-white/5 p-1">
                                            <MemberDomains
                                                area={area}
                                                onSave={handleSave}
                                                onDomainChange={(domainId) => setArea({ ...area, domain_id: domainId || undefined })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <MemberAreaProducts area={area} />
                        )}
                    </div>
                </div>
            </div>

            <UpsellModal
                isOpen={isUpsellModalOpen}
                onClose={() => setIsUpsellModalOpen(false)}
                offerSlug="unlimited_domains"
            />
        </Layout>
    );
};
