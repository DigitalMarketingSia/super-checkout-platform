import React from 'react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Code, Globe, Lock, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

export const WebhookDocs = () => {
    return (
        <Layout>
            <div className="max-w-5xl mx-auto py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Documentação de Webhooks</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Guia completo para integrar o Super Checkout com sistemas externos.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar Navigation */}
                    <div className="lg:col-span-1 space-y-2">
                        <a href="#intro" className="block text-sm font-medium text-gray-900 dark:text-white hover:text-primary transition-colors">Introdução</a>
                        <a href="#security" className="block text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Segurança & Assinatura</a>
                        <a href="#incoming" className="block text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Webhooks de Entrada</a>
                        <a href="#outgoing" className="block text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Webhooks de Saída</a>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-12">

                        {/* Introduction */}
                        <section id="intro" className="space-y-4">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Globe className="w-6 h-6 text-primary" /> Introdução
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                                Os Webhooks permitem que o Super Checkout se comunique em tempo real com outros sistemas.
                                Você pode configurar notificações para eventos como vendas aprovadas, carrinhos abandonados, ou receber comandos para liberar acessos e atualizar pedidos.
                            </p>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                <p className="text-blue-400 text-sm">
                                    <strong>Nota:</strong> Todas as requisições são enviadas como JSON e esperam um status 200 OK para confirmação.
                                </p>
                            </div>
                        </section>

                        {/* Security */}
                        <section id="security" className="space-y-4">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Lock className="w-6 h-6 text-primary" /> Segurança
                            </h2>
                            <p className="text-gray-600 dark:text-gray-300">
                                Para garantir que os dados recebidos vieram realmente do Super Checkout, nós enviamos um hash de assinatura no cabeçalho de cada requisição.
                            </p>

                            <Card>
                                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Cabeçalho de Assinatura</h3>
                                <code className="block bg-black/50 p-3 rounded text-sm text-green-400 font-mono mb-4">
                                    X-Super-Checkout-Signature: &lt;sua-chave-secreta&gt;
                                </code>
                                <p className="text-sm text-gray-500">
                                    Você pode (e deve) verificar se este cabeçalho corresponde à chave secreta configurada no painel do seu webhook.
                                </p>
                            </Card>
                        </section>

                        {/* Incoming Webhooks */}
                        <section id="incoming" className="space-y-6">
                            <div className="border-b border-gray-200 dark:border-white/10 pb-4">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <ArrowRight className="w-6 h-6 text-green-500" /> Webhooks de Entrada
                                </h2>
                                <p className="mt-2 text-gray-500">
                                    Use nossa API para enviar comandos para o Super Checkout.
                                </p>
                            </div>

                            <div className="space-y-6">
                                {/* Event: pedido.atualizar */}
                                <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center">
                                        <code className="text-primary font-bold">pedido.atualizar</code>
                                        <span className="text-xs text-gray-500">POST</span>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <p className="text-sm text-gray-300">Atualiza o status de um pedido existente.</p>
                                        <div className="bg-black/80 rounded-lg p-4">
                                            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{`{
  "event": "pedido.atualizar",
  "order_id": "ord_123456789",
  "status": "paid" // pending, paid, failed, canceled, refunded
}`}</pre>
                                        </div>
                                    </div>
                                </div>

                                {/* Event: acesso.liberar */}
                                <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center">
                                        <code className="text-primary font-bold">acesso.liberar</code>
                                        <span className="text-xs text-gray-500">POST</span>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <p className="text-sm text-gray-300">Libera acesso a um produto para um usuário específico.</p>
                                        <div className="bg-black/80 rounded-lg p-4">
                                            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{`{
  "event": "acesso.liberar",
  "email": "cliente@email.com",
  "product_id": "prod_abc123"
}`}</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Outgoing Webhooks */}
                        <section id="outgoing" className="space-y-6">
                            <div className="border-b border-gray-200 dark:border-white/10 pb-4">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <ArrowRight className="w-6 h-6 text-blue-500 transform rotate-180" /> Webhooks de Saída
                                </h2>
                                <p className="mt-2 text-gray-500">
                                    Eventos enviados pelo Super Checkout para o seu URL configurado.
                                </p>
                            </div>

                            <div className="space-y-6">
                                {/* Event: pagamento.aprovado */}
                                <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center">
                                        <code className="text-primary font-bold">pagamento.aprovado</code>
                                        <span className="text-xs text-gray-500">Enviado quando uma venda é confirmada</span>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="bg-black/80 rounded-lg p-4">
                                            <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{`{
  "event": "pagamento.aprovado",
  "order_id": "ord_987654",
  "amount": 197.00,
  "status": "paid",
  "customer": {
     "name": "João da Silva",
     "email": "joao@exemplo.com",
     "phone": "5511999998888",
     "cpf": "123.456.789-00"
  },
  "items": [
     { "name": "Curso React Pro", "qty": 1, "price": 197.00 }
  ],
  "created_at": "2023-10-27T14:30:00Z"
}`}</pre>
                                        </div>
                                    </div>
                                </div>

                                {/* Event: checkout.abandonado */}
                                <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex justify-between items-center">
                                        <code className="text-primary font-bold">checkout.abandonado</code>
                                        <span className="text-xs text-gray-500">Enviado 15min após abandono</span>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="bg-black/80 rounded-lg p-4">
                                            <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{`{
  "event": "checkout.abandonado",
  "checkout_id": "chk_123456",
  "recovered_url": "https://seu-checkout.com/r/abc123",
  "customer": {
     "email": "joao@exemplo.com",
     "name": "João"
  }
}`}</pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                    </div>
                </div>
            </div>
        </Layout>
    );
};
