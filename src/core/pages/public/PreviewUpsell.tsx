import React from 'react';
import { Link2, MonitorSmartphone, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { UpsellModal } from '../../components/ui/UpsellModal';

type OfferSlug = 'unlimited_domains' | 'partner_rights' | 'whitelabel';

const OFFER_OPTIONS: Array<{ slug: OfferSlug; label: string; note: string }> = [
    {
        slug: 'unlimited_domains',
        label: 'Licenca Vitalicia Elite',
        note: 'Ancora comercial de upgrade_domains.',
    },
    {
        slug: 'partner_rights',
        label: 'Licenca Comercial / Parceiro',
        note: 'Versao focada em operacao comercial.',
    },
    {
        slug: 'whitelabel',
        label: 'Upgrade White Label Elite',
        note: 'Camada premium para validacao de copy e CTA.',
    },
];

const DEFAULT_OFFER: OfferSlug = 'unlimited_domains';

const normalizeOfferSlug = (value: string | null): OfferSlug => {
    if (value === 'partner_rights' || value === 'whitelabel') {
        return value;
    }

    return DEFAULT_OFFER;
};

export const PreviewUpsell = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const offerSlug = normalizeOfferSlug(searchParams.get('offer'));
    const isOpen = searchParams.get('open') !== '0';

    const updatePreview = (next: Partial<{ offer: OfferSlug; open: boolean }>) => {
        const params = new URLSearchParams(searchParams);

        const nextOffer = next.offer ?? offerSlug;
        const nextOpen = next.open ?? isOpen;

        params.set('offer', nextOffer);
        params.set('open', nextOpen ? '1' : '0');

        setSearchParams(params, { replace: true });
    };

    const previewUrl = `/preview/upsell?offer=${offerSlug}&open=${isOpen ? '1' : '0'}`;

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#060912] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.14),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,8,18,0.25),rgba(4,8,18,0.92))]" />

            <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:gap-10 lg:px-10">
                <section className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-7">
                    <div className="flex items-center gap-2 text-emerald-300">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-[10px] font-black uppercase tracking-[0.28em]">
                            Preview Publico
                        </span>
                    </div>

                    <h1 className="mt-4 text-3xl font-black italic tracking-[-0.04em] text-white sm:text-4xl">
                        Laboratorio do Modal de Upgrade
                    </h1>

                    <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
                        Esta pagina replica o design atual do modal para voce validar alteracoes sem depender de sincronizar a conta do cliente.
                    </p>

                    <div className="mt-6 rounded-[1.5rem] border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
                        <div className="flex items-start gap-3">
                            <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200/80">
                                    Como usar
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-white/70">
                                    Abra esta rota localmente em <span className="font-mono text-white">/preview/upsell</span> e, se quiser, publique o mesmo caminho no deploy para revisar o layout em producao.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        {OFFER_OPTIONS.map((option) => {
                            const active = option.slug === offerSlug;

                            return (
                                <button
                                    key={option.slug}
                                    onClick={() => updatePreview({ offer: option.slug, open: true })}
                                    className={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition-all ${
                                        active
                                            ? 'border-emerald-400/25 bg-emerald-400/[0.08] shadow-[0_18px_40px_rgba(16,185,129,0.12)]'
                                            : 'border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-black text-white sm:text-base">
                                                {option.label}
                                            </p>
                                            <p className="mt-1 text-xs text-white/55 sm:text-sm">
                                                {option.note}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
                                            active ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/8 text-white/50'
                                        }`}>
                                            {active ? 'Ativo' : 'Visualizar'}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <button
                            onClick={() => updatePreview({ open: true })}
                            className="flex-1 rounded-[1.2rem] bg-gradient-to-r from-emerald-500 via-green-400 to-lime-300 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#07110c] transition hover:brightness-105"
                        >
                            Abrir modal
                        </button>
                        <button
                            onClick={() => updatePreview({ open: false })}
                            className="flex-1 rounded-[1.2rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                        >
                            Fechar modal
                        </button>
                    </div>

                    <div className="mt-6 rounded-[1.4rem] border border-white/8 bg-black/20 p-4">
                        <div className="flex items-center gap-2 text-white/70">
                            <Link2 className="h-4 w-4" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                Link de validacao
                            </span>
                        </div>
                        <p className="mt-3 break-all rounded-xl bg-white/[0.04] px-3 py-3 font-mono text-xs text-emerald-200/90">
                            {previewUrl}
                        </p>
                    </div>
                </section>

                <section className="hidden min-h-[640px] flex-1 rounded-[2rem] border border-white/8 bg-black/20 lg:block">
                    <div className="flex h-full items-center justify-center px-10 py-12">
                        <div className="w-full max-w-2xl rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">
                                Canvas de contexto
                            </p>
                            <h2 className="mt-4 text-2xl font-black italic tracking-[-0.04em] text-white/90">
                                O modal abre sobre este plano de fundo
                            </h2>
                            <p className="mt-3 text-sm leading-relaxed text-white/55">
                                Mantive esta area propositalmente limpa para facilitar sua leitura de espacamento, contraste, corte lateral e hierarquia visual.
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            <UpsellModal
                isOpen={isOpen}
                onClose={() => updatePreview({ open: false })}
                offerSlug={offerSlug}
            />
        </div>
    );
};
