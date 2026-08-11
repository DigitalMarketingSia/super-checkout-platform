import React from 'react';
import { ArrowRight, Wrench, X } from 'lucide-react';

export type InstallationServiceOffer = {
  product_name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;
  currency: string;
  checkout_url: string;
  provider_type: 'partner' | 'platform_default';
};

const formatPrice = (price: number, currency: string) => {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
      minimumFractionDigits: 2,
    }).format(price || 0);
  } catch {
    return `${currency || 'BRL'} ${Number(price || 0).toFixed(2)}`;
  }
};

export const InstallationServiceOfferBanner: React.FC<{
  offer: InstallationServiceOffer;
  onDismiss: () => void;
  onPurchase: () => void;
}> = ({ offer, onDismiss, onPurchase }) => (
  <section className="relative overflow-hidden rounded-[2rem] border border-orange-300/25 bg-gradient-to-r from-orange-500/25 via-primary/20 to-amber-400/10 p-6 text-left shadow-2xl shadow-orange-500/10 md:p-8">
    <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-300/20 blur-3xl" />
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-400 text-black shadow-lg shadow-orange-300/30">
          <Wrench className="h-6 w-6" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-200">Instalação assistida</p>
          <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter text-white">Quer começar com ajuda?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-orange-50/80">
            Contrate <strong className="text-white">{offer.product_name}</strong> e tenha um especialista preparando sua instalação.
            {offer.description ? ` ${offer.description}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
        <span className="mr-1 text-lg font-black text-white">{formatPrice(offer.price, offer.currency)}</span>
        <button onClick={onDismiss} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-black/30">
          <X className="h-4 w-4" /> Agora não
        </button>
        <button onClick={onPurchase} className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-orange-400/30 transition hover:scale-[1.02] hover:bg-orange-300">
          Contratar instalação <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  </section>
);

export const InstallationServiceOfferCard: React.FC<{
  offer: InstallationServiceOffer;
  onPurchase: () => void;
}> = ({ offer, onPurchase }) => (
  <section className="relative overflow-hidden rounded-[2.5rem] border border-orange-300/20 bg-gradient-to-br from-orange-500/20 via-[#141117] to-[#0b0a0e] p-8 shadow-2xl shadow-orange-500/10 md:p-12">
    <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-orange-400/15 blur-[100px]" />
    <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-400 text-black shadow-xl shadow-orange-400/30"><Wrench className="h-7 w-7" /></div>
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-orange-200">Instalação assistida</p>
        <h1 className="mt-2 text-4xl font-black uppercase italic tracking-tighter text-white md:text-5xl">{offer.product_name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300">{offer.description || 'Tenha ajuda especializada para configurar e colocar seu sistema no ar.'}</p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-center md:min-w-[250px]">
        <p className="text-xs font-black uppercase tracking-widest text-white/45">Investimento</p>
        <p className="mt-2 text-3xl font-black text-white">{formatPrice(offer.price, offer.currency)}</p>
        <button onClick={onPurchase} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-400 px-5 py-4 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-orange-400/30 transition hover:scale-[1.02] hover:bg-orange-300">
          Contratar instalação <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  </section>
);
