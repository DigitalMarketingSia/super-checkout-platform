import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }: ConfirmationModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md glass rounded-[32px] border border-white/10 p-8 shadow-2xl overflow-hidden"
          >
            {/* Decorative background */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#27CBEF]/10 blur-[80px] rounded-full" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <AlertTriangle size={24} />
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">
                {title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                {message}
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="flex-1 px-6 py-3 rounded-2xl bg-[#27CBEF] text-black text-xs font-black uppercase tracking-widest hover:bg-[#27CBEF]/80 transition-all shadow-lg shadow-[#27CBEF]/20"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
