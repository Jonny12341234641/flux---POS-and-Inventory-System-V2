'use client';

import React, { ReactNode } from 'react';

interface PosLayoutProps {
    leftPanel: ReactNode;
    rightPanel: ReactNode;
}

export function PosLayout({ leftPanel, rightPanel }: PosLayoutProps) {
    return (
        <div className="flex flex-col lg:flex-row h-full gap-4 p-4 overflow-hidden" style={{ maxHeight: 'calc(100vh - 64px)' }}>
            {/* Left Panel: Product Search & Grid */}
            <div className="w-full lg:w-2/3 flex flex-col gap-4 overflow-hidden h-full">
                {leftPanel}
            </div>

            {/* Right Panel: Cart & Payment */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-hidden h-full">
                {rightPanel}
            </div>
        </div>
    );
}
