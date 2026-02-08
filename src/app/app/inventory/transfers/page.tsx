'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import TransferOutForm from '@/components/inventory/TransferOutForm';
import TransferInList from '@/components/inventory/TransferInList';

export default function TransfersPage() {
    const [tab, setTab] = useState<'out' | 'in'>('out');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight">Stock Transfers</h1>
                <div className="flex space-x-2">
                    <Button
                        variant={tab === 'out' ? 'default' : 'outline'}
                        onClick={() => setTab('out')}
                    >
                        New Transfer (Out)
                    </Button>
                    <Button
                        variant={tab === 'in' ? 'default' : 'outline'}
                        onClick={() => setTab('in')}
                    >
                        Incoming Transfers
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg p-6 bg-card">
                {tab === 'out' ? (
                    <TransferOutForm />
                ) : (
                    <TransferInList />
                )}
            </div>
        </div>
    );
}
