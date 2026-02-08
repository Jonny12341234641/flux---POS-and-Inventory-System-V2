'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

export default function TransferInList() {
    const incomingTransfers = useLiveQuery(async () => {
        const transfers = await db.stock_transfers
            .where('status').equals('in_transit')
            .toArray();
        const locations = await db.locations.toArray();

        return transfers.map(t => {
            const source = locations.find(l => l.id === t.source_location_id);
            const target = locations.find(l => l.id === t.target_location_id);
            return {
                ...t,
                sourceName: source?.name || 'Unknown',
                targetName: target?.name || 'Unknown'
            };
        });
    });

    const handleReceive = async (transferId: string) => {
        try {
            await db.transaction('rw', db.stock_transfers, db.sales_queue, async () => {
                // Update local status
                await db.stock_transfers.update(transferId, {
                    status: 'completed',
                    updated_at: new Date().toISOString()
                });

                // Trigger Sync (calls receive_stock_transfer RPC)
                await db.sales_queue.add({
                    id: crypto.randomUUID(),
                    entity: 'stock_transfers',
                    action: 'update',
                    location_id: 'UNKNOWN',
                    payload: {
                        id: transferId,
                        status: 'completed'
                    },
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    attempt_count: 0,
                    last_error: null
                });
            });
            toast.success("Transfer Received!");
        } catch (e) {
            console.error(e);
            toast.error("Failed to receive transfer");
        }
    };

    if (!incomingTransfers) return <div>Loading...</div>;

    return (
        <div className="rounded-md border">
            <table className="w-full text-sm text-left">
                <thead className="bg-muted">
                    <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">From</th>
                        <th className="p-3">To</th>
                        <th className="p-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {incomingTransfers.length === 0 && (
                        <tr>
                            <td colSpan={4} className="p-4 text-center text-muted-foreground">No incoming transfers.</td>
                        </tr>
                    )}
                    {incomingTransfers.map(t => (
                        <tr key={t.id} className="hover:bg-muted/50">
                            <td className="p-3">{t.transfer_date ? format(new Date(t.transfer_date), 'PP') : '-'}</td>
                            <td className="p-3">{t.sourceName}</td>
                            <td className="p-3">{t.targetName}</td>
                            <td className="p-3 text-right">
                                <Button size="sm" onClick={() => handleReceive(t.id)} className="bg-green-600 hover:bg-green-700">
                                    <Check className="w-4 h-4 mr-2" /> Receive
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
