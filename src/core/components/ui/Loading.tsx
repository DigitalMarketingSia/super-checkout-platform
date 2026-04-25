import React from 'react';

export const Loading = () => {
    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05050A] text-white">
            <div className="relative flex items-center justify-center">
                <div className="relative">
                    <img
                        src="/logo.png"
                        alt="Logo"
                        className="w-16 h-16 object-contain animate-pulse"
                    />
                </div>
            </div>
            <p className="mt-4 text-gray-500 text-xs font-medium animate-pulse">Carregando...</p>
        </div>
    );
};
