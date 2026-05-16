import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Settings, X, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useFunnelStore } from '../store/useFunnelStore';
import { useTranslation } from 'react-i18next';

export const ContextMenu: React.FC = () => {
  const { t } = useTranslation('admin');
  const { 
    nodes, 
    edges,
    contextMenu, 
    setContextMenu, 
    deleteNode, 
    setSelectedNodeId, 
    setIsConfigModalOpen,
    unlinkNote
  } = useFunnelStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const node = nodes.find(n => n.id === contextMenu?.nodeId);
  const isLinked = node ? edges.some(e => e.source === node.id || e.target === node.id) : false;
  const isNote = node?.data.isNote;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const handleDelete = () => {
    deleteNode(contextMenu.nodeId);
    setContextMenu(null);
  };

  const handleSettings = () => {
    setSelectedNodeId(contextMenu.nodeId);
    setIsConfigModalOpen(true);
    setContextMenu(null);
  };

  const handleOpenLink = () => {
    if (node?.data.url) {
      window.open(node.data.url, '_blank');
    }
    setContextMenu(null);
  };

  const handleUnlink = () => {
    if (node) {
      unlinkNote(node.id);
      setContextMenu(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        className="fixed z-[100] w-52 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden p-1.5"
        style={{ top: contextMenu.y, left: contextMenu.x }}
      >
        <div className="flex flex-col gap-1">
          {node?.data.url && (
            <>
              <button
                onClick={handleOpenLink}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                  <ExternalLink size={16} />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">{t('flow.context_menu.open_link')}</span>
              </button>
              <div className="h-px bg-white/5 mx-2" />
            </>
          )}

          <button
            onClick={handleSettings}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
              <Settings size={16} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{t('flow.context_menu.settings')}</span>
          </button>

          {isNote && isLinked && (
            <>
              <div className="h-px bg-white/5 mx-2" />
              <button
                onClick={handleUnlink}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-amber-500 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <LinkIcon size={16} className="rotate-45" />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">{t('flow.context_menu.unlink')}</span>
              </button>
            </>
          )}

          <div className="h-px bg-white/5 mx-2" />

          <button
            onClick={handleDelete}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-slate-300 hover:text-red-500 transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
              <Trash2 size={16} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{t('flow.context_menu.delete')}</span>
          </button>
        </div>

        <button
          onClick={() => setContextMenu(null)}
          className="absolute top-2 right-2 p-1 text-slate-600 hover:text-slate-400 transition-colors"
        >
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
