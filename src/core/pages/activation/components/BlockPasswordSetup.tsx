import React, { useState } from 'react';
import { Lock, Save, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../services/supabase';

export const BlockPasswordSetup = () => {
    const { t } = useTranslation('portal');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (password.length < 6) {
            setError(t('security.password_min_length'));
            return;
        }

        setSaving(true);
        setError('');
        try {
            const { error: err } = await supabase.auth.updateUser({ password });
            if (err) throw err;
            setSaved(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || t('security.save_error'));
        } finally {
            setSaving(false);
        }
    };

    if (saved) {
        return (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 flex items-center gap-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                    <h3 className="text-white font-bold text-lg">{t('security.password_set')}</h3>
                    <p className="text-gray-400 text-sm">{t('security.password_set_desc')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#0F0F13] border border-white/10 rounded-2xl p-6">
            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">{t('security.title')}</h3>

            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="w-full">
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('security.set_password')}</label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder={t('security.password_placeholder')}
                        />
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full md:w-auto bg-white text-black font-bold h-[48px] px-6 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 min-w-[140px]"
                >
                    {saving ? t('security.saving') : <><Save className="w-4 h-4" /> {t('security.save_password')}</>}
                </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

            <p className="text-gray-500 text-xs mt-3">
                {t('security.security_advice')}
            </p>
        </div>
    );
};
