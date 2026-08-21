import React from 'react';
import { Mail, Megaphone, BarChart3 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { useTranslation } from 'react-i18next';

export const Marketing: React.FC = () => {
    const { t } = useTranslation();
    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('coverage.marketing.title')}</h1>
                        <p className="text-gray-500 dark:text-gray-400">{t('coverage.marketing.subtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
                            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('coverage.marketing.email_campaigns')}</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('coverage.marketing.email_campaigns_description')}</p>
                    </Card>

                    <Card className="p-6">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4">
                            <Megaphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('coverage.marketing.automations')}</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('coverage.marketing.automations_description')}</p>
                    </Card>

                    <Card className="p-6">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mb-4">
                            <BarChart3 className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('coverage.marketing.reports')}</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('coverage.marketing.reports_description')}</p>
                    </Card>
                </div>

                <Card className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <Mail className="w-10 h-10 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('coverage.marketing.coming_soon')}</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">
                        {t('coverage.marketing.coming_soon_description')}
                    </p>
                </Card>
            </div>
        </Layout>
    );
};
