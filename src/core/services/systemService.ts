import { supabase } from './supabase';

export interface SystemConfig {
    id: string;
    default_locale: string;
    default_currency: string;
    translation_version: string;
    timezone: string;
    created_at?: string;
    updated_at?: string;
}

class SystemService {
    private config: SystemConfig | null = null;

    async getConfig(): Promise<SystemConfig | null> {
        if (this.config) return this.config;

        try {
            const { data, error } = await supabase
                .from('system_config')
                .select('*')
                .eq('is_singleton', true)
                .single();

            if (error) throw error;
            this.config = data;
            return data;
        } catch (error) {
            console.error('[SystemService] Error fetching config:', error);
            return null;
        }
    }

    async updateLocale(locale: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('system_config')
                .update({ default_locale: locale, updated_at: new Date().toISOString() })
                .eq('is_singleton', true);

            if (error) throw error;
            if (this.config) {
                this.config.default_locale = locale;
            }
            return true;
        } catch (error) {
            console.error('[SystemService] Error updating locale:', error);
            return false;
        }
    }

    async updateCurrency(currency: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('system_config')
                .update({ default_currency: currency, updated_at: new Date().toISOString() })
                .eq('is_singleton', true);

            if (error) throw error;
            if (this.config) {
                this.config.default_currency = currency;
            }
            return true;
        } catch (error) {
            console.error('[SystemService] Error updating currency:', error);
            return false;
        }
    }
}

export const systemService = new SystemService();
