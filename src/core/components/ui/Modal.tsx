import React from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '' }) => {
    useBodyScrollLock(isOpen);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto p-0 sm:p-4">
            <div className="flex min-h-full items-end justify-center sm:items-center">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />

                {/* Modal Content */}
                <div className={`relative flex h-[100dvh] w-full flex-col overflow-hidden border border-purple-500/20 bg-[#12121A]/80 shadow-2xl backdrop-blur-xl transition-all animate-in fade-in zoom-in-95 duration-200 sm:h-auto sm:max-h-[95vh] sm:rounded-2xl ${className.includes('max-w-') ? '' : 'sm:max-w-md'} ${className}`}>
                    {/* Purple glow effects */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    {/* Header */}
                    <div className="relative flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.02] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:p-6">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="relative flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:p-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>,
        document.body
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
                
                <div className={`flex flex-col-reverse gap-3 transition-opacity duration-300 sm:flex-row sm:justify-end ${loading ? 'opacity-20' : 'opacity-100'}`}>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={loading}
                        className="w-full sm:w-auto"
                    >
                        {finalCancelText}
                    </Button>
                    <Button
                        variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'warning' : 'primary'}
                        onClick={onConfirm}
                        isLoading={loading}
                        className="w-full sm:w-auto"
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
            <div className="flex">
                <Button
                    variant="primary"
                    onClick={onClose}
                    className="w-full sm:ml-auto sm:w-auto"
                >
                    {finalButtonText}
                </Button>
            </div>
        </Modal>
    );
};
