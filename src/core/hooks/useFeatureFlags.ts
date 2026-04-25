
import { useState, useEffect } from 'react';
import { SystemManager } from '../services/systemManager';
import { SystemFeature } from '../types';

export const useFeatureFlags = () => {
  const [features, setFeatures] = useState<SystemFeature[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeatures = async () => {
    setLoading(true);
    const data = await SystemManager.getFeatures();
    setFeatures(data);
    setLoading(false);
  };

  useEffect(() => {
    loadFeatures();
  }, []);

  const isEnabled = (key: string): boolean => {
    const feat = features.find(f => f.feature_key === key);
    return !!feat?.is_enabled;
  };

  const getSettings = (key: string): any => {
    const feat = features.find(f => f.feature_key === key);
    return feat?.settings || {};
  };

  return { features, isEnabled, getSettings, loading, refresh: loadFeatures };
};
