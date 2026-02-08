'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, isBefore } from 'date-fns';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

const PAGE_SIZE = 20;

export default function InventoryPage() {
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');

    const stockData = useLiveQuery(async () => {
        // Note: Complex search + pagination + joins in IndexedDB/Dexie is non-trivial efficiently.
        // For this sprint, we'll fetch a larger chunk or implement basic offset.
        // If search is present, we might have to scan.

        let collection = db.stock_balances.orderBy('item_id'); // Just an order

        // Total count for pagination
        const totalCount = await collection.count();

        // Fetch page
        // Optimization: If search is active, we can't easily use offset/limit on DB without index on name (which is in `items` table, not `stock_balances`).
        // Multi-table filter is hard.
        // Strategy: Load balances, join, then filter? Or Load items matching name, then get balances?
        // "Load items matching name, then get balances" is better for search.

        let results = [];

        if (search) {
            // Find items matching search
            const items = await db.items
                .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
                .toArray();
            const itemIds = items.map(i => i.id);

            // Find balances for these items
            // This could be slow if many items match.
            const allBalances = await db.stock_balances
                .where('item_id').anyOf(itemIds)
                .toArray();

            results = allBalances;
            // We'll handle pagination in JS for search results for now to keep it simple
        } else {
            results = await collection
                .offset(page * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .toArray();
        }

        // Enrich
        const enriched = await Promise.all(results.map(async (b) => {
            const item = await db.items.get(b.item_id);
            const lot = b.lot_id ? await db.stock_lots.get(b.lot_id) : null;
            return {
                ...b,
                itemName: item?.name || 'Unknown',
                batchNumber: lot?.batch_number || '-',
                expiryDate: lot?.expiry_date ? new Date(lot.expiry_date) : null
            };
        }));

        // If search was active, we need to slice for pagination here
        if (search) {
            const start = page * PAGE_SIZE;
            return {
                total: enriched.length,
                data: enriched.slice(start, start + PAGE_SIZE)
            };
        }

        return {
            total: totalCount,
            data: enriched
        };

    }, [page, search]);

    if (!stockData) return <div className="p-6">Loading Inventory...</div>;

    const totalPages = Math.ceil(stockData.total / PAGE_SIZE);

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold">Inventory Stock Levels</h1>

            <div className="flex gap-4">
                <div className="relative max-w-sm flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search items..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3">Item Name</th>
                            <th className="px-4 py-3">Batch No</th>
                            <th className="px-4 py-3">Expiry Date</th>
                            <th className="px-4 py-3 text-right">Qty On Hand</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {stockData.data.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                    No stock records found.
                                </td>
                            </tr>
                        )}
                        {stockData.data.map((row) => {
                            const isExpired = row.expiryDate && isBefore(row.expiryDate, new Date());
                            return (
                                <tr key={row.id} className={`hover:bg-muted/10 ${isExpired ? 'bg-red-50' : ''}`}>
                                    <td className="px-4 py-3 font-medium">{row.itemName}</td>
                                    <td className="px-4 py-3">{row.batchNumber}</td>
                                    <td className={`px-4 py-3 ${isExpired ? 'text-red-600 font-bold' : ''}`}>
                                        {row.expiryDate ? format(row.expiryDate, 'dd MMM yyyy') : '-'}
                                        {isExpired && <span className="ml-2 text-xs bg-red-100 text-red-600 px-1 rounded">EXPIRED</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{row.quantity_on_hand}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages || 1} ({stockData.total} items)
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
