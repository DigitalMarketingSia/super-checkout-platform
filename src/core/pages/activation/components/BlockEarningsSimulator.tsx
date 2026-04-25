import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Users, 
    Target, 
    ShoppingCart, 
    Zap, 
    TrendingUp, 
    DollarSign, 
    Calendar, 
    Clock, 
    Info, 
    MousePointer2,
    ShieldAlert,
    ShieldCheck,
    ArrowRight
} from 'lucide-react';
import './BlockEarningsSimulator.css';

interface SimulationValues {
    impactedPerWeek: number;
    leadConversionRate: number;
    installConversionRate: number;
    installPrice: number;
    configPrice: number;
    upgradeConversionRate: number;
    upgradePrice: number;
    commissionRate: number;
}

type InputMode = 'percent' | 'absolute';

const PRESETS: Record<string, SimulationValues> = {
    conservador: {
        impactedPerWeek: 1000,
        leadConversionRate: 10,
        installConversionRate: 3,
        installPrice: 47,
        configPrice: 0,
        upgradeConversionRate: 10,
        upgradePrice: 147,
        commissionRate: 25
    },
    moderado: {
        impactedPerWeek: 3000,
        leadConversionRate: 10,
        installConversionRate: 8,
        installPrice: 97,
        configPrice: 47,
        upgradeConversionRate: 20,
        upgradePrice: 147,
        commissionRate: 25
    },
    agressivo: {
        impactedPerWeek: 10000,
        leadConversionRate: 15,
        installConversionRate: 15,
        installPrice: 97,
        configPrice: 97,
        upgradeConversionRate: 30,
        upgradePrice: 147,
        commissionRate: 25
    }
};
interface BlockEarningsSimulatorProps {
    onNavigate?: (tab: string) => void;
}

export const BlockEarningsSimulator: React.FC<BlockEarningsSimulatorProps> = ({ onNavigate }) => {
    const [t] = useTranslation(['portal', 'common']);
    const [values, setValues] = useState<SimulationValues>(PRESETS.moderado);
    const [activePreset, setActivePreset] = useState<string>('moderado');

    // Modos de entrada para cada etapa
    const [leadMode, setLeadMode] = useState<InputMode>('percent');
    const [installMode, setInstallMode] = useState<InputMode>('percent');
    const [upgradeMode, setUpgradeMode] = useState<InputMode>('percent');

    // Cálculos
    const leadsPerWeek = Math.floor(values.impactedPerWeek * (values.leadConversionRate / 100));
    const clientsPerWeek = Math.floor(leadsPerWeek * (values.installConversionRate / 100));
    const totalByClient = values.installPrice + values.configPrice;
    const revenueServices = clientsPerWeek * totalByClient;

    const clientsUpgrade = Math.floor(clientsPerWeek * (values.upgradeConversionRate / 100));
    const totalSalesUpgrade = clientsUpgrade * values.upgradePrice;
    
    // Comissão Fixa em 25% conforme solicitado pelo usuário
    const FIXED_COMMISSION = 25;
    const commissionWeekly = totalSalesUpgrade * (FIXED_COMMISSION / 100);

    const weeklyGain = revenueServices + commissionWeekly;
    const monthlyGain = weeklyGain * 4;
    const yearlyGain = weeklyGain * 52;

    const handleChange = (field: keyof SimulationValues, value: number) => {
        setValues(prev => ({ ...prev, [field]: value }));
        setActivePreset(''); 
    };

    const applyPreset = (presetName: string) => {
        setValues(PRESETS[presetName]);
        setActivePreset(presetName);
    };

    return (
        <div className="earnings-simulator-container animate-in fade-in duration-1000">
            {/* Header: Presets & Info */}
            <div className="flex flex-col items-center justify-center gap-8 mb-16 text-center">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Simulador Partner</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black italic text-white uppercase tracking-tighter leading-[0.9] mb-6">
                        {t('simulator.title', 'Simulador de Ganhos')}
                    </h1>
                    <p className="text-gray-500 font-medium max-w-lg mx-auto">
                        Configure seu cenário de atuação em um único lugar e veja seu potencial de lucro.
                    </p>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-2 flex gap-1">
                    {['conservador', 'moderado', 'agressivo'].map(preset => (
                        <button
                            key={preset}
                            onClick={() => applyPreset(preset)}
                            className={`px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all duration-500 ${
                                activePreset === preset 
                                ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-105' 
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {t(`simulator.presets.${preset}`, preset)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                
                {/* SINGLE CONFIG CARD */}
                <div className="xl:col-span-8 bg-white/[0.02] border border-white/10 rounded-[3rem] p-8 md:p-12 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                    
                    <div className="space-y-16 relative z-10">
                        
                        {/* Seção 1: Audiência */}
                        <div>
                            <div className="flex flex-col items-center justify-center gap-4 mb-12 text-center">
                                <div className="w-12 h-1.5 bg-blue-500 rounded-full mb-2" />
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">
                                    {t('simulator.blocks.audience.title', 'Atração & Leads')}
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <InputRange
                                    label={t('simulator.blocks.audience.impacted', 'Alcance Semanal')}
                                    value={values.impactedPerWeek}
                                    min={100}
                                    max={50000}
                                    step={100}
                                    onChange={(val) => handleChange('impactedPerWeek', val)}
                                    icon={<MousePointer2 className="w-3 h-3" />}
                                />
                                <InputRange
                                    label={t('simulator.blocks.audience.conversion', 'Taxa de Conversão')}
                                    value={values.leadConversionRate}
                                    absoluteValue={leadsPerWeek}
                                    mode={leadMode}
                                    toggleMode={() => setLeadMode(prev => prev === 'percent' ? 'absolute' : 'percent')}
                                    min={1}
                                    max={50}
                                    step={0.5}
                                    suffix="%"
                                    onChange={(val) => handleChange('leadConversionRate', val)}
                                    onAbsoluteChange={(abs) => {
                                        const pct = values.impactedPerWeek > 0 ? (abs / values.impactedPerWeek) * 100 : 0;
                                        handleChange('leadConversionRate', Math.min(100, pct));
                                    }}
                                    icon={<Target className="w-3 h-3" />}
                                />
                            </div>
                            <div className="mt-10 flex justify-center">
                                <div className="bg-blue-500/10 border border-blue-500/20 px-8 py-4 rounded-3xl flex items-center gap-4 hover:scale-105 transition-transform duration-500 shadow-xl shadow-blue-500/5">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">Total:</span>
                                    <span className="text-3xl font-black text-white italic tracking-tighter leading-none">{leadsPerWeek.toLocaleString()} LEADS</span>
                                </div>
                            </div>
                        </div>

                        {/* Seção 2: Serviços */}
                        <div className="pt-20 border-t border-white/5">
                            <div className="flex flex-col items-center justify-center gap-4 mb-12 text-center">
                                <div className="w-12 h-1.5 bg-emerald-500 rounded-full mb-2" />
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">
                                    {t('simulator.blocks.conversion.title', 'Vendas e Serviços')}
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <InputRange
                                    label={t('simulator.blocks.conversion.rate', 'Taxa de Fechamento')}
                                    value={values.installConversionRate}
                                    absoluteValue={clientsPerWeek}
                                    mode={installMode}
                                    toggleMode={() => setInstallMode(prev => prev === 'percent' ? 'absolute' : 'percent')}
                                    min={1}
                                    max={50}
                                    step={0.5}
                                    suffix="%"
                                    onChange={(val) => handleChange('installConversionRate', val)}
                                    onAbsoluteChange={(abs) => {
                                        const pct = leadsPerWeek > 0 ? (abs / leadsPerWeek) * 100 : 0;
                                        handleChange('installConversionRate', Math.min(100, pct));
                                    }}
                                    icon={<Zap className="w-3 h-3" />}
                                />
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                        <DollarSign className="w-3 h-3" />
                                        {t('simulator.blocks.conversion.pricing', 'Quanto você vai cobrar? (R$)')}
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 transition-all focus-within:border-emerald-500/50 hover:bg-emerald-500/[0.15]">
                                            <span className="text-[9px] text-gray-500 uppercase font-black block mb-1">{t('simulator.blocks.conversion.install_val', 'Instalação')}</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-emerald-500 font-black text-xs">R$</span>
                                                <input 
                                                    type="number" 
                                                    value={values.installPrice}
                                                    onChange={(e) => handleChange('installPrice', Number(e.target.value))}
                                                    className="bg-transparent text-white font-black text-xl w-full focus:outline-none italic"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 transition-all focus-within:border-emerald-500/50 hover:bg-emerald-500/[0.15]">
                                            <span className="text-[9px] text-gray-500 uppercase font-black block mb-1">{t('simulator.blocks.conversion.config_val', 'Config.')}</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-emerald-500 font-black text-xs">R$</span>
                                                <input 
                                                    type="number" 
                                                    value={values.configPrice}
                                                    onChange={(e) => handleChange('configPrice', Number(e.target.value))}
                                                    className="bg-transparent text-white font-black text-xl w-full focus:outline-none italic"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-10 flex justify-center">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 px-8 py-4 rounded-3xl flex items-center gap-4 hover:scale-105 transition-transform duration-500 shadow-xl shadow-emerald-500/5">
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Total:</span>
                                    <span className="text-3xl font-black text-white italic tracking-tighter leading-none">{clientsPerWeek.toLocaleString()} INSTALARAM</span>
                                </div>
                            </div>
                        </div>

                        {/* Seção 3: Upgrade - Fixed Commission Note */}
                        <div className="pt-20 border-t border-white/5">
                            <div className="flex flex-col items-center justify-center gap-4 mb-12 text-center">
                                <div className="w-12 h-1.5 bg-amber-500 rounded-full mb-2" />
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">
                                    {t('simulator.blocks.upgrade.title', 'Conversão para Recorrente')}
                                </h3>
                                <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-2xl flex items-center gap-2 mt-2">
                                    <ShieldCheck className="w-4 h-4 text-amber-500" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Comissão Fixa: 25%</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <InputRange
                                    label={t('simulator.blocks.upgrade.rate', 'Cliente fez upgrade')}
                                    value={values.upgradeConversionRate}
                                    absoluteValue={clientsUpgrade}
                                    mode={upgradeMode}
                                    toggleMode={() => setUpgradeMode(prev => prev === 'percent' ? 'absolute' : 'percent')}
                                    min={1}
                                    max={100}
                                    step={1}
                                    suffix="%"
                                    onChange={(val) => handleChange('upgradeConversionRate', val)}
                                    onAbsoluteChange={(abs) => {
                                        const pct = clientsPerWeek > 0 ? (abs / clientsPerWeek) * 100 : 0;
                                        handleChange('upgradeConversionRate', Math.min(100, pct));
                                    }}
                                    icon={<Target className="w-3 h-3" />}
                                />
                                <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 flex items-center gap-4">
                                    <Info className="w-6 h-6 text-gray-600 shrink-0" />
                                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-tight leading-normal">
                                        A taxa de comissão sobre upgrades para o plano Ilimitado (R$ 147) é fixada em 25% para todos os parceiros credenciados.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-10 flex justify-center">
                                <div className="bg-amber-500/10 border border-amber-500/20 px-8 py-4 rounded-3xl flex items-center gap-4 hover:scale-105 transition-transform duration-500 shadow-xl shadow-amber-500/5">
                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest leading-none">Total:</span>
                                    <span className="text-3xl font-black text-white italic tracking-tighter leading-none">{clientsUpgrade.toLocaleString()} UPGRADES</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Sticky Side Summary: Final Result Card */}
                <div className="xl:col-span-4 sticky top-24">
                    <div className="bg-gradient-to-br from-[#101015] to-[#05050A] border border-primary/20 rounded-[3rem] p-1 shadow-2xl shadow-primary/10 group">
                        <div className="bg-[#05050A] rounded-[2.8rem] p-10 relative overflow-hidden">
                            {/* Decorative elements */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-[80px] group-hover:blur-[100px] transition-all duration-700" />
                            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px]" />
                            
                            <div className="relative z-10">
                                <div className="text-center mb-10">
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-2 block">{t('simulator.result.total_potential', 'Projeção Estendida')}</span>
                                    <div className="h-px w-12 bg-primary/30 mx-auto" />
                                </div>

                                <div className="space-y-10">
                                    <ResultItem 
                                        label={t('simulator.result.weekly', 'Ganho Semanal')}
                                        value={weeklyGain}
                                        icon={<Calendar className="w-4 h-4" />}
                                        size="md"
                                    />
                                    <ResultItem 
                                        label={t('simulator.result.monthly', 'Ganho Mensal')}
                                        value={monthlyGain}
                                        icon={<Clock className="w-4 h-4" />}
                                        size="lg"
                                    />
                                    
                                    <div className="pt-10 border-t border-white/5 relative">
                                        <div className="flex items-center justify-center gap-2 mb-4">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                                            <span className="text-xs font-black uppercase tracking-widest text-gray-500">{t('simulator.result.yearly', 'Ganho Anual Total')}</span>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-primary font-black text-xs uppercase tracking-widest mb-1">R$</div>
                                            <div className="text-4xl md:text-5xl font-black italic tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,90,31,0.3)]">
                                                {Math.floor(yearlyGain).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => onNavigate?.('opportunity')}
                                    className="w-full mt-12 py-6 bg-primary text-white rounded-3xl font-black uppercase tracking-tighter italic text-xl shadow-xl shadow-primary/20 hover:scale-[1.03] active:scale-[0.98] transition-all duration-500 flex items-center justify-center gap-3 group/btn"
                                >
                                    <span>{t('simulator.result.cta', 'Ativar Agora')}</span>
                                    <ArrowRight className="w-6 h-6 group-hover/btn:translate-x-2 transition-transform" />
                                </button>

                                <div className="mt-10 pt-8 border-t border-white/5 opacity-50 flex gap-4">
                                    <Info className="w-5 h-5 shrink-0 text-amber-500" />
                                    <p className="text-[10px] font-medium leading-relaxed text-gray-400">
                                        {t('simulator.legal_disclaimer', 'Esta é uma simulação baseada em projeções. Os resultados dependem do esforço e estratégia do parceiro.')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ResultItem = ({ label, value, icon, size }: any) => (
    <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 text-gray-500 mb-2">
            {icon}
            <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        </div>
        <div className={`font-black italic tracking-tighter text-white ${size === 'lg' ? 'text-4xl' : 'text-3xl'} opacity-90`}>
            R$ {value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
    </div>
);

interface InputRangeProps {
    label: string;
    value: number;
    absoluteValue?: number;
    mode?: InputMode;
    toggleMode?: () => void;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (val: number) => void;
    onAbsoluteChange?: (val: number) => void;
    icon?: React.ReactNode;
}

const InputRange: React.FC<InputRangeProps> = ({ 
    label, value, absoluteValue, mode = 'percent', toggleMode, 
    min, max, step, suffix = '', onChange, onAbsoluteChange, icon 
}) => {
    const isAbsolute = mode === 'absolute' && absoluteValue !== undefined;
    const displayValue = isAbsolute ? absoluteValue : value;

    return (
        <div className="space-y-6">
            <div className="flex flex-col items-center justify-center text-center gap-4">
                <div className="flex flex-col items-center gap-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        {icon}
                        {label}
                    </label>
                    {toggleMode && (
                        <button 
                            onClick={toggleMode}
                            className="bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1 rounded-full text-[9px] font-black text-primary uppercase tracking-tighter flex items-center gap-1 transition-all duration-300"
                        >
                            {isAbsolute ? '👉 Alternar para %' : '👉 Alternar p/ Número'}
                        </button>
                    )}
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-3 min-w-[140px] justify-center transition-all focus-within:border-primary/50 group-within:shadow-[0_0_20px_rgba(255,90,31,0.1)]">
                    <input 
                        type="number" 
                        value={displayValue} 
                        onChange={(e) => {
                            const val = Number(e.target.value);
                            if (isAbsolute && onAbsoluteChange) {
                                onAbsoluteChange(val);
                            } else {
                                onChange(val);
                            }
                        }}
                        className="bg-transparent text-white font-black text-3xl text-center w-full focus:outline-none italic"
                    />
                    <span className="text-gray-500 text-sm font-black uppercase opacity-50">{isAbsolute ? '' : suffix}</span>
                </div>
            </div>
            <div className="relative group/range h-10 flex items-center">
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-md opacity-0 group-hover/range:opacity-100 transition-opacity" />
                <input 
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                />
            </div>
        </div>
    );
};
