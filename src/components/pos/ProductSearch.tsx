'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Item, StockLot, StockBalance } from '@/types/phase0';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Scan, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ProductSearchProps {
    onAddToCart: (item: Item, lot?: StockLot, maxQty?: number) => void;
    locationId: string;
}

export function ProductSearch({ onAddToCart, locationId }: ProductSearchProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Fetch items matching search
    const items = useLiveQuery(async () => {
        if (!locationId) return [];
        let collection = db.items.where('location_id').equals(locationId);

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const allItems = await collection.toArray();
            return allItems.filter(i =>
                i.name.toLowerCase().includes(term) ||
                (i.barcode && i.barcode.includes(term))
            ).slice(0, 20);
        }
        return collection.limit(20).toArray();
    }, [searchTerm, locationId]);

    const checkStockAndAdd = async (item: Item) => {
        // Check balance for non-tracked items
        const balance = await db.stock_balances
            .where({ location_id: locationId, item_id: item.id })
            .filter(b => b.lot_id === null) // Only look at lot-less entries? 
            // Wait, non-tracked items should have null lot_id in balance.
            // If tracked, we use modal.
            .first();

        const qtyOnHand = balance?.quantity_on_hand || 0;

        if (qtyOnHand <= 0) {
            alert(`Out of Stock! (Available: ${qtyOnHand})`);
            return;
        }

        onAddToCart(item, undefined, qtyOnHand);
        setSearchTerm('');
        if (searchInputRef.current) searchInputRef.current.focus();
    };

    const handleItemClick = (item: Item) => {
        if (item.is_batch_tracked) {
            setSelectedItem(item);
            setIsBatchModalOpen(true);
        } else {
            checkStockAndAdd(item);
        }
    };

    return (
        <Card className="flex-1 flex flex-col overflow-hidden bg-white/50 backdrop-blur-sm border-slate-200/60 shadow-sm h-full">
            <div className="p-4 border-b border-slate-100 bg-white/50 sticky top-0 z-10">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        ref={searchInputRef}
                        placeholder="Search by name or scan barcode..."
                        className="pl-9 bg-white border-slate-200 focus-visible:ring-indigo-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && items && items.length > 0) {
                                handleItemClick(items[0]);
                            }
                        }}
                    />
                    <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 opacity-50" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
                {items?.map(item => (
                    <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="flex flex-col items-start p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30 transition-all text-left group h-auto"
                    >
                        <div className="w-full flex justify-between items-start mb-2">
                            <div className="h-8 w-8 rounded bg-indigo-100 flex items-center justify-center text-indigo-600">
                                <Package className="h-4 w-4" />
                            </div>
                            <span className="font-semibold text-slate-700">${item.sale_price}</span>
                        </div>
                        <h3 className="font-medium text-slate-900 text-sm line-clamp-2 mb-1 group-hover:text-indigo-700">
                            {item.name}
                        </h3>
                        {item.barcode && <p className="text-xs text-slate-400 font-mono">{item.barcode}</p>}
                        {item.is_batch_tracked && (
                            <Badge variant="secondary" className="mt-2 text-[10px] h-5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none">
                                Batch Tracked
                            </Badge>
                        )}
                    </button>
                ))}

                {items?.length === 0 && searchTerm && (
                    <div className="col-span-full flex flex-col items-center justify-center py-10 text-slate-400">
                        <Search className="h-8 w-8 mb-2 opacity-50" />
                        <p>No items found matching "{searchTerm}"</p>
                    </div>
                )}
            </div>

            {selectedItem && (
                <BatchSelectionModal
                    isOpen={isBatchModalOpen}
                    onClose={() => { setIsBatchModalOpen(false); setSelectedItem(null); }}
                    item={selectedItem}
                    locationId={locationId}
                    onSelect={(lot, maxQty) => {
                        onAddToCart(selectedItem, lot, maxQty);
                        setIsBatchModalOpen(false);
                        setSelectedItem(null);
                        setSearchTerm('');
                    }}
                />
            )}
        </Card>
    );
}

function BatchSelectionModal({ isOpen, onClose, item, locationId, onSelect }: { isOpen: boolean, onClose: () => void, item: Item, locationId: string, onSelect: (lot: StockLot, maxQty: number) => void }) {
    const lots = useLiveQuery(async () => {
        if (!isOpen || !item) return [];

        const balances = await db.stock_balances
            .where({ location_id: locationId, item_id: item.id })
            .toArray();

        const lotsWithDetails = await Promise.all(balances.map(async b => {
            if (!b.lot_id) return null;
            if (b.quantity_on_hand <= 0) return null; // Logic: Hide zero stock?

            const lot = await db.stock_lots.get(b.lot_id);
            if (!lot) return null;
            return { lot, balance: b.quantity_on_hand };
        }));

        return lotsWithDetails.filter((l): l is { lot: StockLot, balance: number } => l !== null);
    }, [isOpen, item, locationId]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Select Batch for {item?.name}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 py-4">
                    {!lots || lots.length === 0 ? (
                        <div className="text-center py-4 text-slate-500">
                            No active batches with stock found.
                        </div>
                    ) : (
                        lots.map((l) => {
                            const isExpired = l.lot.expiry_date ? new Date(l.lot.expiry_date) < new Date() : false;
                            return (
                                <Button
                                    key={l.lot.id}
                                    variant="outline"
                                    className={`justify-between h-auto py-3 ${isExpired ? 'opacity-50' : ''}`}
                                    onClick={() => !isExpired && onSelect(l.lot, l.balance)}
                                    disabled={isExpired}
                                >
                                    <div className="flex flex-col items-start text-left">
                                        <span className="font-semibold text-slate-900">{l.lot.batch_number}</span>
                                        <span className="text-xs text-slate-500">Expires: {l.lot.expiry_date ? new Date(l.lot.expiry_date).toLocaleDateString() : 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={isExpired ? "destructive" : "secondary"}>
                                            {l.balance} Available
                                        </Badge>
                                        {isExpired && <Badge variant="destructive">Expired</Badge>}
                                    </div>
                                </Button>
                            );
                        })
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
