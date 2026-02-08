'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default function PurchaseOrderList() {
    const orders = useLiveQuery(async () => {
        const pos = await db.purchase_orders.toArray();
        const suppliers = await db.suppliers.toArray();

        // Sort by created_at desc
        return pos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map(po => {
                const supplier = suppliers.find(s => s.id === po.supplier_id);
                return { ...po, supplierName: supplier?.name || 'Unknown' };
            });
    });

    if (!orders) return <div>Loading...</div>;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'bg-gray-500';
            case 'approved': return 'bg-blue-600';
            case 'received': return 'bg-green-600';
            case 'closed': return 'bg-black';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div className="rounded-md border">
            <table className="w-full text-sm text-left">
                <thead className="bg-muted">
                    <tr>
                        <th className="p-3">Reference</th>
                        <th className="p-3">Supplier</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {orders.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-4 text-center text-muted-foreground">No purchase orders found.</td>
                        </tr>
                    )}
                    {orders.map(po => (
                        <tr key={po.id} className="hover:bg-muted/50">
                            <td className="p-3 font-medium">{po.reference_number || '-'}</td>
                            <td className="p-3">{po.supplierName}</td>
                            <td className="p-3">{po.expected_date ? format(new Date(po.expected_date), 'PP') : '-'}</td>
                            <td className="p-3">
                                <Badge className={getStatusColor(po.status)}>{po.status.toUpperCase()}</Badge>
                            </td>
                            <td className="p-3 text-right">
                                <Link href={`/app/purchasing/orders/${po.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                    View
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
