import React from 'react';
import { Users, BookOpen, Video } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';

export const MembersArea: React.FC = () => {
    return (
        <Layout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Área de Membros</h1>
                        <p className="text-gray-500 dark:text-gray-400">Gerencie seus alunos e conteúdo.</p>
                    </div>
                    <button className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors">
                        Novo Curso
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Alunos Ativos</h3>
                            <Users className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">0</p>
                        <p className="text-sm text-gray-500 mt-1">Total de alunos matriculados</p>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cursos</h3>
                            <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">0</p>
                        <p className="text-sm text-gray-500 mt-1">Cursos publicados</p>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aulas Assistidas</h3>
                            <Video className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">0</p>
                        <p className="text-sm text-gray-500 mt-1">Visualizações totais</p>
                    </Card>
                </div>

                <Card className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <BookOpen className="w-10 h-10 text-gray-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Nenhum curso criado</h2>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
                        Comece criando seu primeiro curso para vender e entregar conteúdo aos seus alunos.
                    </p>
                    <button className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors font-medium">
                        Criar Primeiro Curso
                    </button>
                </Card>
            </div>
        </Layout>
    );
};
