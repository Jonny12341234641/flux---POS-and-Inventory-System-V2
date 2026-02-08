'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, CheckCircle, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function GrnListPage() {
    const [filter, setFilter] = useState<'all' | 'draft' | 'posted'>('all');

    const grns = useLiveQuery(async () => {
        let collection = db.grns.orderBy('received_date').reverse();
        if (filter !== 'all') {
            collection = collection.filter(g => g.status === filter);
        }
        const results = await collection.toArray();

        // Enrich with supplier names (could be optimized)
        const enriched = await Promise.all(results.map(async (grn) => {
            const supplier = grn.supplier_id ? await db.suppliers.get(grn.supplier_id) : null;
            return { ...grn, supplierName: supplier?.name || 'Unknown' };
        }));
        return enriched;
    }, [filter]);

    if (!grns) return <div className="p-6">Loading...</div>;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Goods Received Notes (GRN)</h1>
                <Link href="/app/purchasing/grn/new">
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        New GRN
                    </Button>
                </Link>
            </div>

            <div className="flex gap-2">
                <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilter('all')}
                >
                    All
                </Button>
                <Button
                    variant={filter === 'draft' ? 'default' : 'outline'}
                    onClick={() => setFilter('draft')}
                >
                    Drafts
                </Button>
                <Button
                    variant={filter === 'posted' ? 'default' : 'outline'}
                    onClick={() => setFilter('posted')}
                >
                    Posted
                </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Received Date</th>
                            <th className="px-4 py-3">Reference</th>
                            <th className="px-4 py-3">Supplier</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {grns.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                    No GRNs found.
                                </td>
                            </tr>
                        )}
                        {grns.map((grn) => (
                            <tr key={grn.id} className="hover:bg-muted/10">
                                <td className="px-4 py-3">
                                    {grn.received_date ? format(new Date(grn.received_date), 'dd MMM yyyy') : '-'}
                                </td>
                                <td className="px-4 py-3 font-medium">{grn.reference_number || 'N/A'}</td>
                                <td className="px-4 py-3">{grn.supplierName}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium 
                    ${grn.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {grn.status === 'posted' ? <CheckCircle className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                                        {grn.status.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {grn.status === 'draft' && (
                                        <Link href={`/app/purchasing/grn/${grn.id}/edit`}>
                                            <Button variant="ghost" size="sm">Edit</Button>
                                        </Link>
                                    )}
                                    {grn.status === 'posted' && (
                                        <Button variant="ghost" size="sm" disabled>View</Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
