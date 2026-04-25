import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, Mail, Save, Plus, Check } from 'lucide-react';
import { memberService } from '../../../services/memberService';
import { storage } from '../../../services/storageService';
import { Product } from '../../../types';

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadProducts();
            resetForm();
        }
    }, [isOpen]);

    const loadProducts = async () => {
        try {
            const data = await storage.getProducts();
            setProducts(data);
        } catch (err) {
            console.error('Error loading products:', err);
        }
    };

    const resetForm = () => {
        setEmail('');
        setName('');
        setSelectedProducts([]);
        setError('');
        setSuccess(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Create Member (Auth + Profile)
            // Note: In client-side, we can't easily create a user without signing them up (which logs us out).
            // We need a server-side function.
            // Assuming we have implemented a backend function or using the mocked service.
            // For now, let's try the memberService.createMember which we defined to call an API.

            // As a fallback/simulation (since we don't have the API endpoint 'api/admin/create-member' strictly implemented in backend yet),
            // We can try to use storage.addProduct but that's for products.

            // If we are strictly client-side without edge functions for admin, we CANNOT create a user without using 'inviteUserByEmail' (requires SMTP).
            // However, we added 'createMember' in memberService.ts as a fetch call.

            // Let's implement that fetch call to hit our 'mercadopago' webhook? No, that expects a payment.
            // We need a dedicated endpoint or we must simulate it.

            // Given the constraints, I will assume memberService.createMember is valid or I will implement a workaround 
            // where I simply create the profile row if the user happens to exist, OR I will call the `api/admin/members` if I created it.
            // Wait, I haven't created `api/admin/members.ts` yet! 
            // I should create that API route first or simulate it.

            // PROCEEDING: I will call memberService.createMember. 
            // I need to ensure `memberService.ts` has the logic to call a VALID endpoint.
            // I will create `api/admin/members.ts` next.

            await memberService.createMember(email, name, selectedProducts);

            setSuccess(true);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            console.error('Error creating member:', err);
            setError(err.message || 'Erro ao criar membro.');
        } finally {
            setLoading(false);
        }
    };

    const toggleProduct = (productId: string) => {
        setSelectedProducts(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    if (!isOpen) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 z-50 p-0 flex flex-col max-h-[90vh] outline-none animate-in zoom-in-95 duration-200 overflow-hidden">
                    {/* Purple glow effects */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    <div className="relative p-6 border-b border-white/10 bg-white/[0.02] flex justify-between items-center shrink-0">
                        <h2 className="text-lg font-bold text-white">Adicionar Novo Membro</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="relative p-6 space-y-6 overflow-y-auto">
                        {error && (
                            <div className="p-3 bg-red-100 text-red-700 text-sm rounded-lg border border-red-200">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="p-3 bg-green-100 text-green-700 text-sm rounded-lg border border-green-200 flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                Membro adicionado com sucesso!
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome Completo</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-black/30 border border-purple-500/20 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder:text-gray-600"
                                        placeholder="Ex: João Silva"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-black/30 border border-purple-500/20 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder:text-gray-600"
                                        placeholder="Ex: joao@email.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Liberar Acesso aos Produtos</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                    {products.map(product => (
                                        <label key={product.id} className="flex items-center gap-3 p-3 rounded-lg border border-purple-500/20 hover:bg-white/5 cursor-pointer transition-colors">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedProducts.includes(product.id) ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-600'}`}>
                                                {selectedProducts.includes(product.id) && <Check className="w-3.5 h-3.5" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={selectedProducts.includes(product.id)}
                                                onChange={() => toggleProduct(product.id)}
                                            />
                                            <span className="text-sm font-medium text-gray-300">{product.name}</span>
                                        </label>
                                    ))}
                                    {products.length === 0 && (
                                        <div className="text-sm text-gray-500 italic">Nenhum produto cadastrado.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading || success}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all shadow-lg shadow-purple-500/25 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Salvar Membro
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-center text-gray-500 mt-3">
                                Um email de boas-vindas será enviado automaticamente.
                            </p>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
