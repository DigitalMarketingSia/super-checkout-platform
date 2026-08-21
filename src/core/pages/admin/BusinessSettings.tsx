import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { demoDataService, isDemoDataRuntime } from '../../services/demoDataService';
import {
  Building2,
  Mail,
  ShieldCheck,
  AlertCircle,
  FileText,
  Shield,
  CheckCircle,
  FileSignature,
  Check,
  ChevronRight,
  Globe,
  Settings,
  Loader2,
  Save
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
    BusinessLegalSettingsLike,
    buildLegalDocumentHistorySnapshot,
    buildDefaultPrivacyPolicy,
    buildDefaultTermsOfPurchase,
    buildNextCustomLegalVersion,
    getEffectiveLegalDocumentInfo,
} from '../../utils/legalDocuments';

const formatDocumentPublication = (value?: string | null) => {
    if (!value) return 'não publicado';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'não publicado';

    return date.toLocaleDateString('pt-BR');
};

const formatHistoryTimestamp = (value?: string | null) => {
    if (!value) return 'não registrado';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'não registrado';

    return date.toLocaleString('pt-BR');
};

const isMissingLegalHistoryTableError = (error?: { code?: string | null; message?: string | null; details?: string | null } | null) => {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return error?.code === '42P01'
        || error?.code === 'PGRST205'
        || message.includes('public.business_legal_document_versions')
        || message.includes('business_legal_document_versions does not exist');
};

type LegalHistoryEntry = {
    id: string;
    document_key: 'privacy_policy' | 'terms_of_purchase';
    source: 'custom' | 'default';
    version: string;
    published_at: string;
    legal_name: string | null;
    legal_contact: string | null;
    support_email: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
};

export const BusinessSettings = () => {
    const { user, refreshProfile } = useAuth();
    const { t } = useTranslation('admin');
    const demoRuntime = isDemoDataRuntime();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        business_name: '',
        support_email: user?.email || '',
        legal_name: '',
        legal_responsible_email: '',
        privacy_policy: '',
        privacy_policy_version: '',
        privacy_policy_published_at: '',
        terms_of_purchase: '',
        terms_of_purchase_version: '',
        terms_of_purchase_published_at: '',
        show_legal_footer: true,
        agree_terms: false
    });
    const [loadedDocumentState, setLoadedDocumentState] = useState({
        privacy_policy: '',
        privacy_policy_version: '',
        privacy_policy_published_at: '',
        terms_of_purchase: '',
        terms_of_purchase_version: '',
        terms_of_purchase_published_at: ''
    });
    const [editingDoc, setEditingDoc] = useState<'privacy' | 'terms' | null>(null);
    const [expandedDoc, setExpandedDoc] = useState<'privacy' | 'terms' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [documentHistory, setDocumentHistory] = useState<LegalHistoryEntry[]>([]);
    const isBusinessIdentityComplete = Boolean(formData.business_name.trim() && formData.support_email.trim());
    const privacyDocumentInfo = getEffectiveLegalDocumentInfo('privacy_policy', formData, buildDefaultPrivacyPolicy);
    const termsDocumentInfo = getEffectiveLegalDocumentInfo('terms_of_purchase', formData, buildDefaultTermsOfPurchase);
    const hasLegalDocuments = Boolean(
        privacyDocumentInfo.content.trim()
        && termsDocumentInfo.content.trim()
        && formData.business_name.trim()
        && formData.support_email.trim()
    );
    const privacyHistory = documentHistory.filter((entry) => entry.document_key === 'privacy_policy').slice(0, 3);
    const termsHistory = documentHistory.filter((entry) => entry.document_key === 'terms_of_purchase').slice(0, 3);

    const applyLoadedSettings = (settings: Partial<BusinessLegalSettingsLike & { show_legal_footer?: boolean | null }> | null | undefined) => {
        if (!settings) return;

        setFormData(prev => ({
            ...prev,
            business_name: settings.business_name || '',
            support_email: settings.support_email || user?.email || '',
            legal_name: settings.legal_name || '',
            legal_responsible_email: settings.legal_responsible_email || '',
            privacy_policy: settings.privacy_policy || '',
            privacy_policy_version: settings.privacy_policy_version || '',
            privacy_policy_published_at: settings.privacy_policy_published_at || '',
            terms_of_purchase: settings.terms_of_purchase || '',
            terms_of_purchase_version: settings.terms_of_purchase_version || '',
            terms_of_purchase_published_at: settings.terms_of_purchase_published_at || '',
            show_legal_footer: settings.show_legal_footer !== false,
            agree_terms: true,
        }));
        setLoadedDocumentState({
            privacy_policy: settings.privacy_policy || '',
            privacy_policy_version: settings.privacy_policy_version || '',
            privacy_policy_published_at: settings.privacy_policy_published_at || '',
            terms_of_purchase: settings.terms_of_purchase || '',
            terms_of_purchase_version: settings.terms_of_purchase_version || '',
            terms_of_purchase_published_at: settings.terms_of_purchase_published_at || '',
        });
    };

    const loadDocumentHistory = async (accountId?: string) => {
        setHistoryLoading(true);

        if (demoRuntime) {
            const history = await demoDataService.getBusinessSettingsHistory();
            setDocumentHistory((history || []) as LegalHistoryEntry[]);
            setHistoryLoading(false);
            return;
        }

        if (!accountId) {
            setDocumentHistory([]);
            setHistoryLoading(false);
            return;
        }

        const { data, error: historyError } = await supabase
            .from('business_legal_document_versions')
            .select('id, document_key, source, version, published_at, legal_name, legal_contact, support_email, created_at, metadata')
            .eq('account_id', accountId)
            .order('published_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(24);

        if (historyError) {
            if (!isMissingLegalHistoryTableError(historyError)) {
                console.warn('[BusinessSettings] Falha ao carregar histórico legal:', historyError);
            }
            setDocumentHistory([]);
            setHistoryLoading(false);
            return;
        }

        setDocumentHistory((data || []) as LegalHistoryEntry[]);
        setHistoryLoading(false);
    };

    useEffect(() => {
        const loadSettings = async () => {
            if (demoRuntime) {
                const settings = await demoDataService.getBusinessSettings();
                applyLoadedSettings(settings);
                await loadDocumentHistory();
                return;
            }

            if (!user) return;
            const { data: account } = await supabase
                .from('accounts')
                .select('id')
                .eq('owner_user_id', user.id)
                .maybeSingle();

            if (account?.id) {
                await loadDocumentHistory(account.id);

                const { data: settings } = await supabase
                    .from('business_settings')
                    .select('*')
                    .eq('account_id', account.id)
                    .maybeSingle();

                applyLoadedSettings(settings);
                return;
            }

            setDocumentHistory([]);
        };
        loadSettings();
    }, [demoRuntime, user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user && !demoRuntime) return;
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            if (demoRuntime) {
                if (!formData.agree_terms) {
                    throw new Error(t('business_settings.form.agree_error', 'Você precisa concordar com os termos.'));
                }

                const now = new Date();
                const normalizedLegalName = formData.legal_name.trim() || formData.business_name.trim();
                const normalizedLegalResponsibleEmail = formData.legal_responsible_email.trim() || formData.support_email.trim();
                const nextPrivacyDocument = (() => {
                    const content = formData.privacy_policy.trim();
                    if (!content) {
                        return { version: null, publishedAt: null };
                    }

                    if (
                        content === loadedDocumentState.privacy_policy.trim()
                        && formData.privacy_policy_version.trim()
                    ) {
                        return {
                            version: formData.privacy_policy_version.trim(),
                            publishedAt: formData.privacy_policy_published_at.trim() || now.toISOString(),
                        };
                    }

                    return {
                        version: buildNextCustomLegalVersion('privacy_policy', now),
                        publishedAt: now.toISOString(),
                    };
                })();

                const nextTermsDocument = (() => {
                    const content = formData.terms_of_purchase.trim();
                    if (!content) {
                        return { version: null, publishedAt: null };
                    }

                    if (
                        content === loadedDocumentState.terms_of_purchase.trim()
                        && formData.terms_of_purchase_version.trim()
                    ) {
                        return {
                            version: formData.terms_of_purchase_version.trim(),
                            publishedAt: formData.terms_of_purchase_published_at.trim() || now.toISOString(),
                        };
                    }

                    return {
                        version: buildNextCustomLegalVersion('terms_of_purchase', now),
                        publishedAt: now.toISOString(),
                    };
                })();

                const historySettings: BusinessLegalSettingsLike = {
                    business_name: formData.business_name,
                    legal_name: normalizedLegalName,
                    legal_responsible_email: normalizedLegalResponsibleEmail,
                    support_email: formData.support_email,
                    privacy_policy: formData.privacy_policy,
                    privacy_policy_version: nextPrivacyDocument.version || '',
                    privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                    terms_of_purchase: formData.terms_of_purchase,
                    terms_of_purchase_version: nextTermsDocument.version || '',
                    terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                    updated_at: now.toISOString(),
                };

                const historySnapshots = [
                    buildLegalDocumentHistorySnapshot('privacy_policy', historySettings, buildDefaultPrivacyPolicy),
                    buildLegalDocumentHistorySnapshot('terms_of_purchase', historySettings, buildDefaultTermsOfPurchase),
                ];

                const result = await demoDataService.saveBusinessSettings({
                    settings: {
                        business_name: formData.business_name,
                        legal_name: normalizedLegalName,
                        legal_responsible_email: normalizedLegalResponsibleEmail,
                        support_email: formData.support_email,
                        privacy_policy: formData.privacy_policy,
                        privacy_policy_version: nextPrivacyDocument.version || '',
                        privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                        terms_of_purchase: formData.terms_of_purchase,
                        terms_of_purchase_version: nextTermsDocument.version || '',
                        terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                        show_legal_footer: true,
                        business_email: formData.support_email,
                        is_ready_to_sell: true,
                        compliance_status: hasLegalDocuments ? 'verified' : 'pending',
                        updated_at: now.toISOString(),
                    },
                    historySnapshots,
                    savedByUserId: user?.id || null,
                });

                setFormData(prev => ({
                    ...prev,
                    privacy_policy_version: nextPrivacyDocument.version || '',
                    privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                    terms_of_purchase_version: nextTermsDocument.version || '',
                    terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                    show_legal_footer: true,
                }));
                setLoadedDocumentState({
                    privacy_policy: formData.privacy_policy,
                    privacy_policy_version: nextPrivacyDocument.version || '',
                    privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                    terms_of_purchase: formData.terms_of_purchase,
                    terms_of_purchase_version: nextTermsDocument.version || '',
                    terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                });
                setDocumentHistory((result.history || []) as LegalHistoryEntry[]);
                setSuccess(true);
                setTimeout(() => setSuccess(false), 5000);
                return;
            }

            let { data: account } = await supabase
                .from('accounts')
                .select('id')
                .eq('owner_user_id', user!.id)
                .maybeSingle();

            if (!account) {
                const { data: newAccount, error: createError } = await supabase
                    .from('accounts')
                    .insert({ owner_user_id: user!.id, plan_type: 'free' })
                    .select()
                    .single();
                if (createError) throw createError;
                account = newAccount;
            }

            if (!formData.agree_terms) {
                throw new Error(t('business_settings.form.agree_error', 'Você precisa concordar com os termos.'));
            }

            const now = new Date();
            const normalizedLegalName = formData.legal_name.trim() || formData.business_name.trim();
            const normalizedLegalResponsibleEmail = formData.legal_responsible_email.trim() || formData.support_email.trim();
            const nextPrivacyDocument = (() => {
                const content = formData.privacy_policy.trim();
                if (!content) {
                    return { version: null, publishedAt: null };
                }

                if (
                    content === loadedDocumentState.privacy_policy.trim()
                    && formData.privacy_policy_version.trim()
                ) {
                    return {
                        version: formData.privacy_policy_version.trim(),
                        publishedAt: formData.privacy_policy_published_at.trim() || now.toISOString(),
                    };
                }

                return {
                    version: buildNextCustomLegalVersion('privacy_policy', now),
                    publishedAt: now.toISOString(),
                };
            })();

            const nextTermsDocument = (() => {
                const content = formData.terms_of_purchase.trim();
                if (!content) {
                    return { version: null, publishedAt: null };
                }

                if (
                    content === loadedDocumentState.terms_of_purchase.trim()
                    && formData.terms_of_purchase_version.trim()
                ) {
                    return {
                        version: formData.terms_of_purchase_version.trim(),
                        publishedAt: formData.terms_of_purchase_published_at.trim() || now.toISOString(),
                    };
                }

                return {
                    version: buildNextCustomLegalVersion('terms_of_purchase', now),
                    publishedAt: now.toISOString(),
                };
            })();

            const { error: settingsError } = await supabase
                .from('business_settings')
                .upsert({
                    account_id: account.id,
                    business_name: formData.business_name,
                    legal_name: normalizedLegalName,
                    legal_responsible_email: normalizedLegalResponsibleEmail,
                    support_email: formData.support_email,
                    privacy_policy: formData.privacy_policy,
                    privacy_policy_version: nextPrivacyDocument.version,
                    privacy_policy_published_at: nextPrivacyDocument.publishedAt,
                    terms_of_purchase: formData.terms_of_purchase,
                    terms_of_purchase_version: nextTermsDocument.version,
                    terms_of_purchase_published_at: nextTermsDocument.publishedAt,
                    show_legal_footer: true,
                    sender_name: formData.business_name,
                    sender_email: formData.support_email,
                    compliance_status: 'pending',
                    is_ready_to_sell: true
                }, { onConflict: 'account_id' });

            if (settingsError) throw settingsError;

            const historySettings: BusinessLegalSettingsLike = {
                business_name: formData.business_name,
                legal_name: normalizedLegalName,
                legal_responsible_email: normalizedLegalResponsibleEmail,
                support_email: formData.support_email,
                privacy_policy: formData.privacy_policy,
                privacy_policy_version: nextPrivacyDocument.version || '',
                privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                terms_of_purchase: formData.terms_of_purchase,
                terms_of_purchase_version: nextTermsDocument.version || '',
                terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                updated_at: now.toISOString(),
            };

            const historySnapshots = [
                buildLegalDocumentHistorySnapshot('privacy_policy', historySettings, buildDefaultPrivacyPolicy),
                buildLegalDocumentHistorySnapshot('terms_of_purchase', historySettings, buildDefaultTermsOfPurchase),
            ];

            const { error: historyError } = await supabase
                .from('business_legal_document_versions')
                .upsert(
                    historySnapshots.map((snapshot) => ({
                        account_id: account.id,
                        document_key: snapshot.key,
                        version: snapshot.version,
                        published_at: snapshot.publishedAt,
                        source: snapshot.source,
                        template_content: snapshot.templateContent,
                        rendered_content: snapshot.renderedContent,
                        legal_name: snapshot.legalName,
                        legal_contact: snapshot.legalContact,
                        support_email: snapshot.supportEmail,
                        metadata: {
                            ...snapshot.metadata,
                            saved_at: now.toISOString(),
                            saved_by_user_id: user!.id,
                            saved_via: 'BusinessSettings',
                        },
                    })),
                    { onConflict: 'account_id,document_key,content_sha256', ignoreDuplicates: true },
                );

            if (historyError && !isMissingLegalHistoryTableError(historyError)) {
                throw historyError;
            }

            await supabase.from('system_events').insert({
                account_id: account.id,
                type: 'business_info_updated',
                metadata: {
                    business_name: formData.business_name,
                    compliance_status: 'pending',
                    has_legal_documents: hasLegalDocuments
                }
            });

            await refreshProfile();
            setFormData(prev => ({
                ...prev,
                privacy_policy_version: nextPrivacyDocument.version || '',
                privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                terms_of_purchase_version: nextTermsDocument.version || '',
                terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
                show_legal_footer: true,
            }));
            setLoadedDocumentState({
                privacy_policy: formData.privacy_policy,
                privacy_policy_version: nextPrivacyDocument.version || '',
                privacy_policy_published_at: nextPrivacyDocument.publishedAt || '',
                terms_of_purchase: formData.terms_of_purchase,
                terms_of_purchase_version: nextTermsDocument.version || '',
                terms_of_purchase_published_at: nextTermsDocument.publishedAt || '',
            });
            await loadDocumentHistory(account.id);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 5000);

        } catch (err: any) {
            console.error(err);
            setError(err.message || t('business_settings.error', 'Erro ao salvar configurações.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="space-y-8 pb-24 max-w-6xl mx-auto px-4 md:px-0 animate-in fade-in duration-500 relative">

                {/* Premium Design Glows */}
                <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse-slow" />
                <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

                {/* Dashboard-Style Title & Info Bar */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-portal-display text-white mb-1 leading-none uppercase italic tracking-tight">
                                {t('business_settings.header.title_prefix')} <span className="text-primary font-black">{t('business_settings.header.title_highlight')}</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-gray-400 font-medium uppercase tracking-[0.15em] text-[9px] font-mono">
                                    {t('business_settings.header.badge')}
                                </p>
                                <div className="h-1.5 w-1.5 rounded-full bg-primary/45"></div>
                                <span className="text-[9px] text-[#10B981] font-black uppercase tracking-[0.2em] font-mono">{t('coverage.business_settings.live_control')}</span>
                            </div>
                        </div>

                        {/* Tactical Status Tags */}
                        <div className="flex flex-row flex-wrap items-center gap-2.5 font-mono">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em] border ${hasLegalDocuments ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-[0_2px_10px_rgba(16,185,129,0.05)]' : 'bg-rose-500/10 text-rose-400 border-rose-500/25 shadow-[0_2px_10px_rgba(244,63,94,0.05)]'}`}>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {hasLegalDocuments ? t('coverage.business_settings.published_documents') : t('coverage.business_settings.pending_documents')}
                            </span>

                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em] border ${isBusinessIdentityComplete ? 'bg-[#8A2BE2]/10 text-[#C77DFF] border-[#8A2BE2]/30 shadow-[0_2px_10px_rgba(138,43,226,0.05)]' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                <Building2 className="w-3.5 h-3.5" />
                                {isBusinessIdentityComplete ? t('coverage.business_settings.identity_complete') : t('coverage.business_settings.identity_incomplete')}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-300 max-w-2xl leading-relaxed italic border-l border-primary/30 pl-4 font-medium">
                        {t('coverage.business_settings.description')}
                    </p>
                </div>

                <div className="max-w-6xl mx-auto">
                    {/* Feedback Messages */}
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/25 p-4 rounded-xl mb-6 flex items-center gap-3.5 animate-in zoom-in-95 duration-350 shadow-lg">
                            <div className="p-2 bg-rose-500/20 rounded-lg text-rose-500">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest font-mono">{t('coverage.business_settings.system_alert')}</p>
                                <p className="text-xs font-bold text-rose-500 tracking-tight">{error}</p>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-xl mb-6 flex items-center gap-3.5 animate-in zoom-in-95 duration-350 shadow-lg">
                            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                                <CheckCircle className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-emerald-500/50 uppercase tracking-widest font-mono">{t('coverage.business_settings.sync_complete')}</p>
                                <p className="text-xs font-bold text-emerald-400 tracking-tight">{t('business_settings.success', 'Processamento concluído com sucesso. A identidade do seu negócio foi propagada.')}</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="lg:grid lg:grid-cols-12 lg:gap-8 space-y-8 lg:space-y-0 animate-in fade-in duration-500">

                        {/* Left Column: Configuration Zone (col-span-5) */}
                        <div className="lg:col-span-5">
                            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6">
                                {/* Glass light reflection ray */}
                                <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                {/* Dash Indicators at the top */}
                                <div className="flex justify-center gap-1.5 mb-8">
                                    <div className="w-8 h-1 rounded-full bg-primary" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                </div>

                                {/* Central Illustration Header */}
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                        <Building2 className="w-9 h-9 text-white animate-pulse-slow" />
                                    </div>
                                    <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                        {t('coverage.business_settings.commercial_identity')}
                                    </h3>
                                    <p className="text-xs text-gray-400 max-w-sm font-medium">
                                        {t('coverage.business_settings.commercial_identity_description')}
                                    </p>
                                </div>

                                <div className="space-y-5 border-t border-white/5 pt-6">
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                            {t('business_settings.form.business_name', 'Nome Comercial')}
                                        </label>
                                        <div className="relative group/input">
                                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within/input:text-primary transition-colors duration-300" size={16} />
                                            <input
                                                type="text"
                                                required
                                                value={formData.business_name}
                                                onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                                                className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                placeholder={t('business_settings.form.business_name_placeholder', 'Nome da sua MARCA')}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1.5 italic px-1 flex items-center gap-1.5 font-medium leading-none">
                                            <AlertCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> {t('business_settings.form.business_name_hint', 'Exibido em faturas, checkout e remetente.')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                            {t('business_settings.form.support_email', 'Suporte Técnico')}
                                        </label>
                                        <div className="relative group/input">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within/input:text-primary transition-colors duration-300" size={16} />
                                            <input
                                                type="email"
                                                required
                                                value={formData.support_email}
                                                onChange={e => setFormData({ ...formData, support_email: e.target.value })}
                                                className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                placeholder={t('business_settings.form.support_email_placeholder', 'suporte@empresa.com')}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1.5 italic px-1 flex items-center gap-1.5 font-medium leading-none">
                                            <AlertCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> {t('business_settings.form.support_email_hint', 'Usado em e-mails, suporte e rodapé legal.')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                            {t('coverage.business_settings.legal_contact')}
                                        </label>
                                        <div className="relative group/input">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within/input:text-primary transition-colors duration-300" size={16} />
                                            <input
                                                type="email"
                                                value={formData.legal_responsible_email}
                                                onChange={e => setFormData({ ...formData, legal_responsible_email: e.target.value })}
                                                className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                placeholder={t('coverage.business_settings.legal_email_placeholder')}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1.5 italic px-1 flex items-center gap-1.5 font-medium leading-none">
                                            <AlertCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> {t('coverage.business_settings.legal_contact_hint')}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-4 bg-black/20 rounded-xl border border-white/10 flex items-center justify-between gap-4 transition-all duration-300 shadow-inner">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-[#8A2BE2]/15 border border-[#8A2BE2]/30 rounded-lg text-primary">
                                            <Globe className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-white leading-none">{t('coverage.business_settings.checkout_footer')}</p>
                                            <p className="text-[8px] text-gray-400 uppercase tracking-wider mt-1.5 font-mono">{t('coverage.business_settings.checkout_footer_description')}</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer scale-90 font-semibold">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked
                                            disabled
                                        />
                                        <div className="w-12 h-6 bg-white/5 border border-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-800 after:rounded-full after:h-5 after:w-5 after:transition-all duration-500 peer-checked:after:bg-white peer-checked:bg-primary shadow-inner"></div>
                                    </label>
                                </div>

                                <div className="p-4 bg-[#8A2BE2]/5 rounded-xl border border-[#8A2BE2]/20 cursor-pointer hover:bg-[#8A2BE2]/10 transition-all duration-300 relative group/agree shadow-sm" onClick={() => setFormData({ ...formData, agree_terms: !formData.agree_terms })}>
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300 ${formData.agree_terms ? 'bg-primary border-primary shadow-md shadow-primary/20 scale-105' : 'bg-[#07070F] border-white/15'}`}>
                                            {formData.agree_terms && <Check className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                        <span className="text-[11px] text-gray-300 font-medium leading-relaxed italic select-none">
                                            {t('coverage.business_settings.legal_declaration')}
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <Button
                                        type="submit"
                                        disabled={loading}
                                        className="group/save w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-[0_4px_16px_rgba(138,43,226,0.35)]"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        <span className="text-xs font-black uppercase tracking-wider">
                                            {loading ? t('coverage.business_settings.saving') : t('coverage.business_settings.save_changes')}
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Legal Documents and History Zone (col-span-7) */}
                        <div className="lg:col-span-7">

                            {/* Main Glass Card inspired by the mockup style */}
                            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl">
                                {/* Glass light reflection ray */}
                                <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                {/* Dash Indicators at the top */}
                                <div className="flex justify-center gap-1.5 mb-8">
                                    <div className="w-8 h-1 rounded-full bg-primary" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                </div>

                                {/* Central Illustration Header */}
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                        <ShieldCheck className="w-9 h-9 text-white animate-pulse-slow" />
                                    </div>
                                    <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                        {t('coverage.business_settings.legal_documents')}
                                    </h3>
                                    <p className="text-xs text-gray-400 max-w-sm font-medium">
                                        {t('coverage.business_settings.legal_documents_description')}
                                    </p>
                                </div>

                                {/* List of Documents as Rows */}
                                <div className="space-y-4 border-t border-white/5 pt-6">

                                    {/* Row 1: Privacy Policy */}
                                    <div className="space-y-4">
                                        <div
                                            onClick={() => setExpandedDoc(expandedDoc === 'privacy' ? null : 'privacy')}
                                            className="group flex items-center justify-between p-4 hover:bg-white/[0.02] rounded-2xl transition-all duration-300 cursor-pointer border border-transparent hover:border-white/5"
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Left Icon Container */}
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                                                    formData.privacy_policy
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                }`}>
                                                    <Shield className="w-5.5 h-5.5" />
                                                </div>

                                                {/* Text Info */}
                                                <div className="text-left">
                                                    <span className={`block text-[8px] font-black uppercase tracking-widest font-mono leading-none mb-1 ${
                                                        formData.privacy_policy ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                        {formData.privacy_policy ? t('coverage.business_settings.published') : t('coverage.business_settings.pending')}
                                                    </span>
                                                    <h4 className="text-sm font-bold text-white transition-colors group-hover:text-primary leading-tight">
                                                        {t('coverage.business_settings_meta.privacy_policy')}
                                                    </h4>
                                                    <p className="text-[11px] text-gray-400 mt-1 leading-normal font-mono uppercase tracking-wider text-[8px]">
                                                        {t('coverage.business_settings_meta.compliance_relationship')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right controls */}
                                            <div className="flex items-center gap-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border font-mono ${formData.privacy_policy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${formData.privacy_policy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    {formData.privacy_policy ? 'Configurada' : 'Pendente'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:border-white/20 transition-all duration-300 hover:bg-white/5"
                                                >
                                                    <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${expandedDoc === 'privacy' ? 'rotate-90 text-white' : ''}`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Privacy Area */}
                                        {expandedDoc === 'privacy' && (
                                            <div className="mx-4 p-5 bg-[#07070F]/50 border border-white/5 rounded-3xl space-y-5 animate-in slide-in-from-top-3 duration-300">
                                                {/* Status Banner */}
                                                <div className="flex items-center justify-between p-3.5 bg-[#07070F] border border-white/[0.12] rounded-xl hover:border-indigo-500/30 transition-all duration-300">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="relative flex h-2 w-2">
                                                            {formData.privacy_policy && (
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                            )}
                                                            <span className={`relative inline-flex rounded-full h-2 w-2 ${formData.privacy_policy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></span>
                                                        </div>
                                                        <span className="text-xs font-semibold text-white leading-none">
                                                            {formData.privacy_policy ? 'Configurada & Ativa' : 'Pendente de Configuração'}
                                                        </span>
                                                    </div>
                                                    <div className="text-right font-mono">
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                                            {t('coverage.business_settings.version')} {privacyDocumentInfo.version || '1.0.0'}
                                                        </span>
                                                        <span className="block text-[8px] text-gray-500 mt-1.5 leading-none">
                                                            {t('coverage.business_settings.published_at')} {formatDocumentPublication(privacyDocumentInfo.publishedAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Actions Bar */}
                                                <div className="flex justify-end pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setEditingDoc('privacy'); }}
                                                        className="px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-xs font-bold text-primary transition-all duration-300 flex items-center gap-1.5"
                                                    >
                                                        <FileSignature className="w-3.5 h-3.5 text-primary" />
                                                        {t('coverage.business_settings.edit_content')}
                                                    </button>
                                                </div>

                                                {/* History Section */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between px-1">
                                                        <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono">{t('coverage.business_settings_meta.snapshot_history')}</h4>
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest font-mono">
                                                            {historyLoading ? 'Carregando' : `${privacyHistory.length} registros`}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/5 pr-1.5 text-left">
                                                        {historyLoading && (
                                                            <div className="rounded-xl border border-white/10 bg-[#07070F] px-4 py-3 text-[11px] text-gray-400 font-medium">
                                                                {t('coverage.business_settings.syncing_history')}
                                                            </div>
                                                        )}

                                                        {!historyLoading && privacyHistory.length === 0 && (
                                                            <div className="rounded-xl border border-dashed border-white/5 bg-[#07070F] px-4 py-4 text-[11px] text-gray-500 text-center leading-relaxed italic">
                                                                {t('coverage.business_settings.no_snapshot')}
                                                            </div>
                                                        )}

                                                        {!historyLoading && privacyHistory.map((entry) => (
                                                            <div key={entry.id} className="rounded-xl border border-white/10 bg-[#07070F] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/[0.02] hover:border-white/20 transition-all duration-300 shadow-sm">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-white font-mono">{entry.version}</span>
                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${entry.source === 'custom' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' : 'bg-sky-500/10 text-sky-400 border border-sky-500/25'}`}>
                                                                            {entry.source}
                                                                        </span>
                                                                    </div>
                                                                    <span className="block text-[10px] text-gray-400 font-medium font-sans">
                                                                        {t('coverage.business_settings.owner')} {entry.legal_name || t('coverage.business_settings.not_provided')} | {t('coverage.business_settings.contact')} {entry.legal_contact || entry.support_email || t('coverage.business_settings.not_provided')}
                                                                    </span>
                                                                </div>
                                                                <div className="text-left sm:text-right text-[10px] text-gray-500 whitespace-nowrap leading-relaxed font-mono">
                                                                    <span className="block">{t('coverage.business_settings.published_at')} {formatHistoryTimestamp(entry.published_at)}</span>
                                                                    <span className="block text-[9px] text-gray-600 font-bold">{t('coverage.business_settings.recorded_at')} {formatHistoryTimestamp(entry.created_at)}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Row 2: Terms of Purchase */}
                                    <div className="space-y-4 border-t border-white/5 pt-4">
                                        <div
                                            onClick={() => setExpandedDoc(expandedDoc === 'terms' ? null : 'terms')}
                                            className="group flex items-center justify-between p-4 hover:bg-white/[0.02] rounded-2xl transition-all duration-300 cursor-pointer border border-transparent hover:border-white/5"
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Left Icon Container */}
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                                                    formData.terms_of_purchase
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                }`}>
                                                    <FileText className="w-5.5 h-5.5" />
                                                </div>

                                                {/* Text Info */}
                                                <div className="text-left">
                                                    <span className={`block text-[8px] font-black uppercase tracking-widest font-mono leading-none mb-1 ${
                                                        formData.terms_of_purchase ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                        {formData.terms_of_purchase ? t('coverage.business_settings.published') : t('coverage.business_settings.pending')}
                                                    </span>
                                                    <h4 className="text-sm font-bold text-white transition-colors group-hover:text-primary leading-tight">
                                                        {t('coverage.business_settings.terms_of_purchase')}
                                                    </h4>
                                                    <p className="text-[11px] text-gray-400 mt-1 leading-normal font-mono uppercase tracking-wider text-[8px]">
                                                        {t('coverage.business_settings.terms_description')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right controls */}
                                            <div className="flex items-center gap-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border font-mono ${formData.terms_of_purchase ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${formData.terms_of_purchase ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                    {formData.terms_of_purchase ? 'Configurado' : 'Pendente'}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:border-white/20 transition-all duration-300 hover:bg-white/5"
                                                >
                                                    <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${expandedDoc === 'terms' ? 'rotate-90 text-white' : ''}`} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Terms Area */}
                                        {expandedDoc === 'terms' && (
                                            <div className="mx-4 p-5 bg-[#07070F]/50 border border-white/5 rounded-3xl space-y-5 animate-in slide-in-from-top-3 duration-300">
                                                {/* Status Banner */}
                                                <div className="flex items-center justify-between p-3.5 bg-[#07070F] border border-white/[0.12] rounded-xl hover:border-primary/30 transition-all duration-300">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="relative flex h-2 w-2">
                                                            {formData.terms_of_purchase && (
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                            )}
                                                            <span className={`relative inline-flex rounded-full h-2 w-2 ${formData.terms_of_purchase ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></span>
                                                        </div>
                                                        <span className="text-xs font-semibold text-white leading-none">
                                                            {formData.terms_of_purchase ? 'Configurado & Ativo' : 'Pendente de Configuração'}
                                                        </span>
                                                    </div>
                                                    <div className="text-right font-mono">
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                                            {t('coverage.business_settings.version')} {termsDocumentInfo.version || '1.0.0'}
                                                        </span>
                                                        <span className="block text-[8px] text-gray-500 mt-1.5 leading-none">
                                                            {t('coverage.business_settings.published_at')} {formatDocumentPublication(termsDocumentInfo.publishedAt)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Actions Bar */}
                                                <div className="flex justify-end pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setEditingDoc('terms'); }}
                                                        className="px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 text-xs font-bold text-primary transition-all duration-300 flex items-center gap-1.5"
                                                    >
                                                        <FileSignature className="w-3.5 h-3.5 text-primary" />
                                                        {t('coverage.business_settings.edit_content')}
                                                    </button>
                                                </div>

                                                {/* History Section */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between px-1">
                                                        <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-widest font-mono">{t('coverage.business_settings_meta.snapshot_history')}</h4>
                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest font-mono">
                                                            {historyLoading ? 'Carregando' : `${termsHistory.length} registros`}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-2 max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/5 pr-1.5 text-left">
                                                        {historyLoading && (
                                                            <div className="rounded-xl border border-white/10 bg-[#07070F] px-4 py-3 text-[11px] text-gray-400 font-medium">
                                                                {t('coverage.business_settings.syncing_history')}
                                                            </div>
                                                        )}

                                                        {!historyLoading && termsHistory.length === 0 && (
                                                            <div className="rounded-xl border border-dashed border-white/5 bg-[#07070F] px-4 py-4 text-[11px] text-gray-500 text-center leading-relaxed italic">
                                                                {t('coverage.business_settings.no_snapshot')}
                                                            </div>
                                                        )}

                                                        {!historyLoading && termsHistory.map((entry) => (
                                                            <div key={entry.id} className="rounded-xl border border-white/10 bg-[#07070F] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white/[0.02] hover:border-white/20 transition-all duration-300 shadow-sm">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-white font-mono">{entry.version}</span>
                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${entry.source === 'custom' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' : 'bg-sky-500/10 text-sky-400 border border-sky-500/25'}`}>
                                                                            {entry.source}
                                                                        </span>
                                                                    </div>
                                                                    <span className="block text-[10px] text-gray-400 font-medium font-sans">
                                                                        {t('coverage.business_settings.owner')} {entry.legal_name || t('coverage.business_settings.not_provided')} | {t('coverage.business_settings.contact')} {entry.legal_contact || entry.support_email || t('coverage.business_settings.not_provided')}
                                                                    </span>
                                                                </div>
                                                                <div className="text-left sm:text-right text-[10px] text-gray-500 whitespace-nowrap leading-relaxed font-mono">
                                                                    <span className="block">{t('coverage.business_settings.published_at')} {formatHistoryTimestamp(entry.published_at)}</span>
                                                                    <span className="block text-[9px] text-gray-600 font-bold">{t('coverage.business_settings.recorded_at')} {formatHistoryTimestamp(entry.created_at)}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                </div>

                            </div>

                        </div>
                    </form>
                </div>

                {/* Modal do Editor de Documento */}
                <Modal
                    isOpen={!!editingDoc}
                    onClose={() => setEditingDoc(null)}
                    title={editingDoc === 'privacy' ? 'EDITAR POLÍTICA DE PRIVACIDADE' : 'EDITAR TERMOS DE COMPRA'}
                    className="max-w-4xl"
                >
                    <div className="space-y-6 p-1">
                        <div className="relative bg-[#07070F] border border-white/10 p-5 rounded-2xl flex items-start gap-4 overflow-hidden shadow-xl">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 blur-[50px] -translate-y-1/2 -translate-x-1/2" />
                            <div className="p-2.5 bg-primary/15 border border-primary/30 rounded-xl text-primary">
                                <Settings className="w-5 h-5" />
                            </div>
                            <div className="relative z-10 space-y-1.5">
                                <p className="text-[9px] text-primary font-black uppercase tracking-widest italic">{t('coverage.business_settings_meta.dynamic_content_sync')}</p>
                                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                                    {t('coverage.business_settings.variable_hint_before')} <code className="bg-white/5 px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">{"{{business_name}}"}</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">{"{{legal_name}}"}</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">{"{{support_email}}"}</code> {t('coverage.business_settings.variable_hint_or')} <code className="bg-white/5 px-1.5 py-0.5 rounded text-primary font-mono text-[10px]">{"{{legal_contact}}"}</code> {t('coverage.business_settings.variable_hint_after')}
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <textarea
                                className="w-full h-[400px] bg-[#05050A] border border-white/[0.12] rounded-2xl p-6 text-white focus:border-primary focus:ring-0 outline-none transition-all font-mono text-xs leading-relaxed shadow-inner scrollbar-thin scrollbar-thumb-white/5"
                                placeholder={t('coverage.business_settings.editor_placeholder')}
                                value={editingDoc === 'privacy' ? formData.privacy_policy : formData.terms_of_purchase}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    [editingDoc === 'privacy' ? 'privacy_policy' : 'terms_of_purchase']: e.target.value
                                })}
                            />
                            <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-[#0C0C14] border border-white/10 text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                {t('coverage.business_settings.live_editor')}
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                type="button"
                                onClick={() => setEditingDoc(null)}
                                className="px-8 h-12 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs uppercase tracking-wider shadow-[0_4px_16px_rgba(138,43,226,0.35)] active:scale-95 transition-all duration-300"
                            >
                                {t('coverage.business_settings.save_close')}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Layout>
    );
};
