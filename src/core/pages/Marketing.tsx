import React from 'react';
import { Mail, Megaphone, BarChart3 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';

export const Marketing: React.FC = () => {
    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Marketing & E-mail</h1>
                        <p className="text-gray-500 dark:text-gray-400">Gerencie suas campanhas e automações.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4">
                            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Campanhas de E-mail</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Crie e envie e-mails para sua base de clientes.</p>
                    </Card>

                    <Card className="p-6">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4">
                            <Megaphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Automações</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Configure fluxos automáticos de recuperação e boas-vindas.</p>
                    </Card>

                    <Card className="p-6">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mb-4">
                            <BarChart3 className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Relatórios</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Acompanhe o desempenho das suas campanhas.</p>
                    </Card>
                </div>

                <Card className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <Mail className="w-10 h-10 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Em Breve</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">
                        Estamos construindo uma suíte completa de marketing para você vender mais.
                    </p>
                </Card>
            </div>
        </Layout>
    );
};
