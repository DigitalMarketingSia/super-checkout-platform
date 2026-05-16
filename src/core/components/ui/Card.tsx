import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', noPadding = false, ...props }) => {
  return (
    <div className={`glass-panel rounded-[2rem] ${noPadding ? '' : 'p-6'} ${className}`} {...props}>
      {children}
    </div>
  );
};