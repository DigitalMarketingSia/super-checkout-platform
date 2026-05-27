import React from 'react';
import { useConsent } from '../../context/ConsentContext';

export const ConsentPreferencesButton: React.FC<{
  className?: string;
  children?: React.ReactNode;
}> = ({ className, children }) => {
  const { openPreferences } = useConsent();

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={className}
    >
      {children || 'Preferencias de privacidade'}
    </button>
  );
};
