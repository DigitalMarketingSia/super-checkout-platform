import { useEffect, useRef } from 'react';
import { useFunnelStore } from '../store/useFunnelStore';
import { saveFunnel } from '../lib/storage';
import { useParams } from 'react-router-dom';

export const useAutoSave = () => {
  const { nodes, edges, viewport } = useFunnelStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { id } = useParams();

  useEffect(() => {
    if (!id) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveFunnel(id, { nodes, edges, viewport }, undefined, false);
    }, 1500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nodes, edges, viewport, id]);
};

export const saveFunnelManually = async (id: string | undefined, data: any, name?: string) => {
  if (!id) return false;
  try {
    await saveFunnel(id, data, name, true);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};
