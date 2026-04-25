import React, { useState, useRef } from 'react';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { AlertModal } from '../../components/ui/Modal';
import { 
    Save, 
    Upload, 
    Palette, 
    Layout as LayoutIcon, 
    Globe, 
    Link as LinkIcon, 
    HelpCircle, 
    Monitor, 
    Smartphone, 
    Zap,
    Image as ImageIcon,
    Type,
    MousePointer2,
    CheckCircle2,
    Activity
} from 'lucide-react';
import { LinksManager } from '../../components/admin/LinksManager';
import { FAQManager } from '../../components/admin/FAQManager';
import { useTranslation } from 'react-i18next';

interface MemberSettingsProps {
    area: MemberArea;
    onSave: (area: MemberArea) => Promise<void>;
    isNew: boolean;
}

export const MemberSettings: React.FC<MemberSettingsProps> = ({ area, onSave, isNew }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [settings, setSettings] = useState<MemberArea>(area);
    const [saving, setSaving] = useState(false);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
    
    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false, title: '', message: '', variant: 'info'
    });

    const primaryColor = settings.primary_color || '#8A2BE2';

    const handleSaveClick = async () => {
        setSaving(true);
        try {
            await onSave(settings);
            setAlertState({ 
                isOpen: true, 
                title: t('common.success', 'Sucesso'), 
                message: t('member_area_details.success_save', 'Configurações salvas no cockpit!'), 
                variant: 'success' 
            });
        } catch (error) {
            setAlertState({ 
                isOpen: true, 
                title: t('common.error', 'Erro'), 
                message: t('member_area_details.error_save', 'Erro ao salvar alterações.'), 
                variant: 'error' 
            });
        } finally {
            setSaving(false);
        }
    };

    const handleUpload = async (type: 'logo' | 'favicon' | 'banner', file: File) => {
        try {
            const areaId = settings.id || 'temp';
            let publicUrl = '';
            
            if (type === 'logo') publicUrl = await storage.uploadMemberAreaLogo(file, areaId);
            else if (type === 'favicon') publicUrl = await storage.uploadMemberAreaFavicon(file, areaId);
            else if (type === 'banner') publicUrl = await storage.uploadMemberAreaBanner(file, areaId);
            
            setSettings({ ...settings, [`${type}_url`]: publicUrl });
        } catch (error: any) {
            console.error(`${type} upload error:`, error);
            setAlertState({
                isOpen: true,
                title: t('member_area_details.upload_error', 'Erro no Upload'),
                message: error.message || t('common.unknown_error', 'Erro desconhecido'),
                variant: 'error'
            });
        }
    };

    const SectionHeader = ({ icon: Icon, title, subtitle, number }: { icon: any, title: string, subtitle: string, number: string }) => (
        <div className="flex items-start gap-4 mb-8">
            <div className="relative">
                <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center group-hover:border-purple-500/50 transition-colors">
                    <Icon className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
                </div>
                <div className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-black border border-white/10 rounded font-mono text-[8px] font-bold text-white/40 tracking-tighter">
                    {number}
                </div>
            </div>
            <div>
                <h3 className="text-lg font-black text-white italic uppercase tracking-tighter leading-none mb-1">{title}</h3>
                <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">{subtitle}</p>
            </div>
        </div>
    );

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Tactical Switcher Header (Internal) SLIM */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl"
                style={{ 
                    background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${primaryColor}20 100%)`,
                }}
            >
                <div className="flex items-center gap-4">
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: primaryColor }} />
                    <div>
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">
                            Appearance & <span style={{ color: primaryColor }}>UX Control</span>
                        </h2>
                        <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                            <Activity className="w-3.5 h-3.5" />
                            Fine-tune your academy identity
                        </div>
                    </div>
                </div>
                <Button 
                    onClick={handleSaveClick} 
                    isLoading={saving}
                    className="h-12 px-8 bg-white hover:bg-white/90 font-black uppercase italic tracking-tighter flex items-center gap-2 rounded-xl shadow-xl transition-all hover:scale-[1.02]"
                    style={{ color: '#0A0A1F' }}
                >
                    <Save className="w-4 h-4" /> 
                    <span className="text-xs">Commit UX Updates</span>
                </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
                {/* Left Side: Controls */}
                <div className="xl:col-span-12 2xl:col-span-8 space-y-12">
                    
                    {/* 01 // Identity */}
                    <div className="group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-white/10 transition-all relative overflow-hidden">
                        <SectionHeader 
                            icon={LayoutIcon} 
                            title="Visual Identity" 
                            subtitle="Core portal attributes and assets"
                            number="01 // IDENTITY"
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <div className="space-y-8">
                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 ml-1">
                                        <Type className="w-3 h-3" /> Academy Name
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:border-purple-500/50 transition-all font-bold placeholder:text-white/10"
                                        value={settings.name}
                                        onChange={e => setSettings({ ...settings, name: e.target.value })}
                                        placeholder="Ex: Academy Elite"
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 ml-1">
                                        <Zap className="w-3 h-3" /> Portal Slug URL
                                    </label>
                                    <div className="flex bg-black/40 border border-white/5 rounded-2xl overflow-hidden focus-within:border-purple-500/50 transition-all">
                                        <span className="flex items-center px-6 bg-white/5 font-mono text-[10px] text-white/20 border-r border-white/5">
                                            /app/
                                        </span>
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent px-6 py-4 text-white outline-none font-bold lowercase"
                                            value={settings.slug}
                                            onChange={e => setSettings({ ...settings, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                            placeholder="academy-slug"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Logo Upload */}
                                <div>
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block ml-1">Portal Logo</label>
                                    <div className="relative group/upload h-full">
                                        <div className="aspect-square rounded-3xl bg-black/40 border-2 border-dashed border-white/10 flex flex-col items-center justify-center overflow-hidden group-hover/upload:border-purple-500/30 transition-all">
                                            {settings.logo_url ? (
                                                <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain p-4" />
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-2">
                                                        <ImageIcon className="w-6 h-6 text-white/20" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">No Asset</span>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={e => e.target.files && handleUpload('logo', e.target.files[0])}
                                        />
                                    </div>
                                </div>

                                {/* Favicon Upload */}
                                <div>
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block ml-1">Favicon Asset</label>
                                    <div className="relative group/upload h-full">
                                        <div className="aspect-square rounded-3xl bg-black/40 border-2 border-dashed border-white/10 flex flex-col items-center justify-center overflow-hidden group-hover/upload:border-purple-500/30 transition-all">
                                            {settings.favicon_url ? (
                                                <img src={settings.favicon_url} alt="Favicon" className="w-12 h-12 object-contain" />
                                            ) : (
                                                <>
                                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-2">
                                                        <Globe className="w-6 h-6 text-white/20" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Default</span>
                                                </>
                                            )}
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={e => e.target.files && handleUpload('favicon', e.target.files[0])}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 02 // Portal Vitrine Banner */}
                    <div className="group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-white/10 transition-all relative overflow-hidden">
                        <SectionHeader 
                            icon={Zap} 
                            title="Portal Vitrine" 
                            subtitle="Main banner and call-to-action"
                            number="02 // VITRINE"
                        />

                        <div className="space-y-10">
                            {/* Banner Image Hero */}
                            <div className="relative group/banner rounded-[2rem] overflow-hidden border border-white/10 bg-black/60 aspect-[21/9] flex items-center justify-center">
                                {settings.banner_url ? (
                                    <img src={settings.banner_url} alt="Banner" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center gap-4 text-white/20">
                                        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                                            <Upload className="w-10 h-10" />
                                        </div>
                                        <p className="text-xs font-black uppercase italic tracking-widest">Deploy Banner Asset</p>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <div className="relative px-8 py-4 bg-white text-black font-black uppercase italic tracking-tighter rounded-2xl cursor-pointer">
                                        Upload New Discovery Banner
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={e => e.target.files && handleUpload('banner', e.target.files[0])}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-8">
                                    <div>
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block ml-1">Headline Text</label>
                                        <input
                                            type="text"
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:border-purple-500/50 transition-all font-bold"
                                            value={settings.banner_title || ''}
                                            onChange={e => setSettings({ ...settings, banner_title: e.target.value })}
                                            placeholder="Ex: Start your journey here"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block ml-1">Sub-headline Description</label>
                                        <textarea
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:border-purple-500/50 transition-all font-bold min-h-[120px] resize-none"
                                            value={settings.banner_description || ''}
                                            onChange={e => setSettings({ ...settings, banner_description: e.target.value })}
                                            placeholder="Tell your students what this community is regarding..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-[2rem]">
                                        <h4 className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-6 flex items-center gap-2">
                                            <MousePointer2 className="w-3 h-3" /> Call to Action Control
                                        </h4>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Button Label</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500/50 transition-all text-sm font-bold"
                                                    value={settings.banner_button_text || ''}
                                                    onChange={e => setSettings({ ...settings, banner_button_text: e.target.value })}
                                                    placeholder="EX: ACCESS NOW"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2 block">Destination URL / Deep Link</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500/50 transition-all text-sm font-bold"
                                                    value={settings.banner_button_link || ''}
                                                    onChange={e => setSettings({ ...settings, banner_button_link: e.target.value })}
                                                    placeholder="EX: /track/operational-strategy"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 03 // Custom Links & FAQ */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-white/10 transition-all">
                            <SectionHeader 
                                icon={LinkIcon} 
                                title="Macro Links" 
                                subtitle="External references & menu mapping"
                                number="03 // LINKS"
                            />
                            <div className="bg-black/20 rounded-3xl border border-white/5 p-1">
                                <LinksManager
                                    links={settings.custom_links || []}
                                    onChange={(links) => setSettings({ ...settings, custom_links: links })}
                                />
                            </div>
                        </div>

                        <div className="group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-white/10 transition-all">
                            <SectionHeader 
                                icon={HelpCircle} 
                                title="Intel Base" 
                                subtitle="Frequently Asked Questions"
                                number="04 // FAQ"
                            />
                            <div className="bg-black/20 rounded-3xl border border-white/5 p-1">
                                <FAQManager
                                    faqs={settings.faqs || []}
                                    onChange={(faqs) => setSettings({ ...settings, faqs: faqs })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Colors & Simulator */}
                <div className="xl:col-span-12 2xl:col-span-4 space-y-12">
                    {/* Accent Color Board */}
                    <div className="group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-10 hover:border-white/10 transition-all relative overflow-hidden">
                        <SectionHeader 
                            icon={Palette} 
                            title="Chrome Palette" 
                            subtitle="Primary accent & portal branding"
                            number="05 // COLOR"
                        />

                        <div className="space-y-6">
                            <div className="flex items-center gap-6 p-6 bg-black/40 border border-white/5 rounded-[2rem]">
                                <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0 group/color cursor-pointer">
                                    <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
                                    <input
                                        type="color"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        value={primaryColor}
                                        onChange={e => setSettings({ ...settings, primary_color: e.target.value })}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/color:opacity-100 bg-black/20 transition-opacity">
                                        <Zap className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1 block">Hex Code</label>
                                    <input
                                        type="text"
                                        className="w-full bg-transparent text-2xl font-black text-white outline-none uppercase italic tracking-tighter"
                                        value={primaryColor}
                                        onChange={e => setSettings({ ...settings, primary_color: e.target.value })}
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-5 gap-2">
                                {['#8A2BE2', '#00F2FF', '#FF007A', '#39FF14', '#FFD700'].map(preset => (
                                    <button
                                        key={preset}
                                        onClick={() => setSettings({ ...settings, primary_color: preset })}
                                        className="aspect-square rounded-xl border border-white/10 transition-transform hover:scale-110"
                                        style={{ backgroundColor: preset }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Portal Simulator */}
                    <div className="sticky top-12 group bg-[#0A0A1F] border border-white/10 rounded-[3rem] p-2 hover:border-white/20 transition-all overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
                        <div className="p-8 border-b border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                                        <Monitor className="w-4 h-4 text-white/40" />
                                    </div>
                                    <h4 className="text-sm font-black text-white italic uppercase tracking-tighter pb-1 border-b-2" style={{ borderColor: primaryColor }}>Portal Simulator</h4>
                                </div>
                                <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                                    <button 
                                        onClick={() => setPreviewMode('desktop')}
                                        className={`p-2 rounded-lg transition-all ${previewMode === 'desktop' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
                                    >
                                        <Monitor className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => setPreviewMode('mobile')}
                                        className={`p-2 rounded-lg transition-all ${previewMode === 'mobile' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
                                    >
                                        <Smartphone className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Actual Simulator Content */}
                            <div className={`mx-auto transition-all duration-500 overflow-hidden bg-[#050510] border border-white/5 shadow-inner ${previewMode === 'mobile' ? 'w-[240px] aspect-[9/18.5] rounded-[2.5rem]' : 'w-full aspect-[16/10] rounded-2xl'}`}>
                                <div className="h-full flex flex-col">
                                    {/* Mock Nav */}
                                    <div className="h-[12%] border-b border-white/5 flex items-center justify-between px-4">
                                        <div className="w-6 h-6 rounded bg-white/5 overflow-hidden flex items-center justify-center">
                                            {settings.logo_url ? (
                                                <img src={settings.logo_url} className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }} />
                                            )}
                                        </div>
                                        <div className="flex gap-1.5 align-middle">
                                            <div className="w-3 h-1 rounded-full bg-white/10"></div>
                                            <div className="w-3 h-1 rounded-full bg-white/10"></div>
                                            <div className="w-4 h-4 rounded-full bg-white/10 ml-2"></div>
                                        </div>
                                    </div>

                                    {/* Mock Body */}
                                    <div className="flex-1 overflow-hidden">
                                        {/* Mock Banner */}
                                        <div className="h-[40%] relative">
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#050510] to-transparent z-10" />
                                            {settings.banner_url ? (
                                                <img src={settings.banner_url} className="w-full h-full object-cover opacity-60" />
                                            ) : (
                                                <div className="w-full h-full" style={{ backgroundColor: `${primaryColor}22` }} />
                                            )}
                                            <div className="absolute bottom-4 left-4 z-20 space-y-1">
                                                <div className="h-2 w-20 bg-white/40 rounded-full" />
                                                <div className="h-1 w-12 bg-white/20 rounded-full" />
                                                <div className="mt-2 flex">
                                                    <div className="px-3 py-1 rounded-[4px] text-[6px] font-black italic uppercase tracking-tighter text-[#050510]" style={{ backgroundColor: primaryColor }}>
                                                        {settings.banner_button_text || 'ACTION'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mock Cards */}
                                        <div className="p-4 space-y-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="h-2 w-16 bg-white/10 rounded-full" />
                                                <div className="h-2 w-6 bg-white/5 rounded-full" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="aspect-[4/3] rounded-xl bg-white/[0.03] border border-white/5 group relative overflow-hidden">
                                                    <div className="absolute bottom-2 left-2 w-6 h-0.5" style={{ backgroundColor: primaryColor }} />
                                                </div>
                                                <div className="aspect-[4/3] rounded-xl bg-white/[0.03] border border-white/5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-8 flex items-center justify-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
                                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Reality Sync Active</span>
                                </div>
                                <div className="w-1 h-1 bg-white/10 rounded-full" />
                                <div className="flex items-center gap-2 text-green-500/60">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span className="text-[10px] font-mono uppercase tracking-widest">Assets Optimized</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div >

            <AlertModal
                isOpen={alertState.isOpen}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
                title={alertState.title}
                message={alertState.message}
                variant={alertState.variant}
            />
        </div >
    );
};
