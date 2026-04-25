import React, { useState, useEffect } from 'react';
import { MemberArea, Domain, DomainUsage } from '../../types';
import { storage } from '../../services/storageService';
import { Globe, Check, AlertCircle, Lightbulb, Zap, Activity } from 'lucide-react';

interface MemberDomainsProps {
    area: MemberArea;
    onSave: (area: MemberArea) => Promise<void>;
    onDomainChange: (domainId: string) => void;
}

export const MemberDomains: React.FC<MemberDomainsProps> = ({ area, onDomainChange }) => {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDomainId, setSelectedDomainId] = useState<string>(area.domain_id || '');

    useEffect(() => {
        loadDomains();
    }, []);

    useEffect(() => {
        setSelectedDomainId(area.domain_id || '');
    }, [area.domain_id]);

    const loadDomains = async () => {
        setLoading(true);
        try {
            const data = await storage.getDomains();
            setDomains(data.filter(d => d.status === 'active' && d.usage === DomainUsage.MEMBER_AREA));
        } catch (error) {
            console.error('Error loading domains:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDomainChange = (domainId: string) => {
        setSelectedDomainId(domainId);
        onDomainChange(domainId);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Resolving DNS Nodes...</p>
            </div>
        );
    }

    const primaryColor = area.primary_color || '#8A2BE2';

    return (
        <div className="animate-in fade-in duration-500">
            <div className="bg-black/40 border border-white/5 rounded-[2rem] p-8 lg:p-10 relative overflow-hidden group hover:border-white/10 transition-all">
                {/* Background Glow */}
                <div 
                    className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[100px] opacity-10 pointer-events-none transition-all duration-1000 group-hover:opacity-20"
                    style={{ backgroundColor: primaryColor }}
                />

                <div className="flex flex-col lg:flex-row gap-10 relative z-10">
                    <div className="lg:w-1/3">
                        <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mb-6">
                            <Globe className="w-6 h-6 text-white/60" />
                        </div>
                        <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">Custom <span style={{ color: primaryColor }}>Domain</span></h3>
                        <p className="text-white/30 text-xs font-medium leading-relaxed">
                            Connect a verified external mapping to provide a white-label experience for your students.
                        </p>
                    </div>

                    <div className="lg:w-2/3 space-y-8">
                        <div>
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block ml-1">Mapping Node Configuration</label>
                            <div className="relative group/select">
                                <select
                                    value={selectedDomainId}
                                    onChange={(e) => handleDomainChange(e.target.value)}
                                    className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-purple-500/50 appearance-none font-bold transition-all cursor-pointer"
                                >
                                    <option value="">System Default Gateway (super-checkout.net)</option>
                                    {domains.map(domain => (
                                        <option key={domain.id} value={domain.id}>
                                            {domain.domain}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover/select:text-white/40 transition-colors">
                                    <Zap className="w-4 h-4" />
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 mt-4 px-2">
                                <div className="w-1 h-1 rounded-full bg-white/20" />
                                <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                                    <Lightbulb className="w-3 h-3 text-yellow-500/60" />
                                    <span>Commit changes via the global SAVE button above</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedDomainId ? (
                                <div className="flex items-center gap-4 p-5 bg-green-500/5 border border-green-500/20 rounded-2xl group/status">
                                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center border border-green-500/20 group-hover/status:scale-110 transition-transform">
                                        <Check className="w-5 h-5 text-green-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white uppercase italic tracking-tighter">Status: Active</p>
                                        <p className="text-[10px] font-medium text-green-500/60 uppercase tracking-widest">Node Verified</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl group/status opacity-40">
                                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 group-hover/status:scale-110 transition-transform">
                                        <Globe className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white uppercase italic tracking-tighter">Status: Passive</p>
                                        <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest">Using Core Domain</p>
                                    </div>
                                </div>
                            )}

                            {domains.length === 0 && (
                                <div className="flex items-center gap-4 p-5 bg-yellow-500/5 border border-yellow-500/20 rounded-2xl group/status">
                                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 group-hover/status:scale-110 transition-transform">
                                        <AlertCircle className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white uppercase italic tracking-tighter">No Nodes Found</p>
                                        <p className="text-[10px] font-medium text-yellow-500/60 uppercase tracking-widest leading-tight">Configure in Domains tab</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tactical Footer Overlay */}
                <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-3 h-3 text-purple-500" />
                        <span className="text-[8px] font-mono text-white/10 uppercase tracking-[0.2em]">Network Mapping Engine v4.0</span>
                    </div>
                    <div className="flex gap-1">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/5 border border-white/10" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
