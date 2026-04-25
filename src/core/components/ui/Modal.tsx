import React, { useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '' }) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className={`relative w-full bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 transform transition-all animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[95vh] ${className.includes('max-w-') ? '' : 'max-w-md'} ${className}`}>
                {/* Purple glow effects */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                {/* Header */}
                <div className="relative flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02]">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="relative p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: React.ReactNode;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    variant = 'primary',
    loading = false
}) => {
    const { t } = useTranslation('common');
    const finalConfirmText = confirmText || t('confirm', 'Confirmar');
    const finalCancelText = cancelText || t('cancel', 'Cancelar');
    const processingText = t('processing', 'Processando...');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="relative">
                {/* Loading Grid/Animation overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-[#12121A]/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center rounded-xl animate-in fade-in duration-300">
                        <div className="relative w-16 h-16">
                            <RefreshCw className="w-12 h-12 text-primary animate-spin absolute inset-0 m-auto" />
                            <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping" />
                        </div>
                        <p className="mt-4 text-sm font-bold text-primary animate-pulse">{processingText}</p>
                    </div>
                )}

                <p className={`text-gray-300 mb-8 leading-relaxed transition-opacity duration-300 ${loading ? 'opacity-20' : 'opacity-100'}`}>
                    {message}
                </p>
                
                <div className={`flex justify-end gap-3 transition-opacity duration-300 ${loading ? 'opacity-20' : 'opacity-100'}`}>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={loading}
                    >
                        {finalCancelText}
                    </Button>
                    <Button
                        variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'primary'}
                        onClick={onConfirm}
                        isLoading={loading}
                    >
                        {finalConfirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    message: string;
    buttonText?: string;
    variant?: 'success' | 'error' | 'info';
}

export const AlertModal: React.FC<AlertModalProps> = ({
    isOpen,
    onClose,
    title,
    message,
    buttonText,
    variant = 'info'
}) => {
    const { t } = useTranslation('common');
    const finalButtonText = buttonText || t('ok', 'OK');

    const getTitle = () => {
        if (title) return title;
        switch (variant) {
            case 'success': return t('success_title', 'Sucesso');
            case 'error': return t('error_title', 'Erro');
            default: return t('info_title', 'Informação');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={getTitle()}>
            <p className="text-gray-300 mb-8 leading-relaxed">
                {message}
            </p>
            <div className="flex justify-end">
                <Button
                    variant="primary"
                    onClick={onClose}
                >
                    {finalButtonText}
                </Button>
            </div>
        </Modal>
    );
};
