'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { usePosStore } from '@/features/pos/usePosStore';
import { useSyncMasters } from '@/features/pos/useSyncMasters';
import { SalesInvoice, SalesInvoiceLine, OutboxItem } from '@/types/phase0';
// using simple UI elements without lucide-react dependency to be safe

export default function PosPage() {
    const { syncing, error: syncError } = useSyncMasters();
    const searchInput = useSearchInput();

    // Catalog Data
    const items = useLiveQuery(async () => {
        let collection = db.items.orderBy('name');
        if (searchInput.value) {
            const q = searchInput.value.toLowerCase();
            // Simple client-side filter since we can't easily multi-index search in basic Dexie without specific setup
            // efficiently. For 1000 items, filtering in memory after fetching or using filter() is fine.
            return collection.filter(i =>
                i.name.toLowerCase().includes(q) ||
                (i.barcode?.toLowerCase().includes(q) ?? false)
            ).toArray();
        }
        return collection.toArray();
    }, [searchInput.value]);

    // Cart State
    const { cart, addToCart, removeFromCart, updateQty, clearCart, getTotalAmount, getItemCount } = usePosStore();

    const handleCharge = async () => {
        if (cart.length === 0) return;

        try {
            const invoiceId = self.crypto.randomUUID();
            const now = new Date().toISOString();
            // We need location_id. For offline, we might assume we have it in local storage or from the items (worst case).
            // Ideally we stored user profile in DB.
            // For this "Phase 0", let's take location_id from the first item in cart? 
            // Or we can just use a placeholder if offline and fix in sync.
            // But items have location_id. Let's use that.
            const locationId = cart[0].location_id;

            const total = getTotalAmount();

            const invoice: SalesInvoice = {
                id: invoiceId,
                location_id: locationId,
                invoice_number: `OFF-${Date.now()}`, // Temporary offline ID
                invoice_date: now,
                subtotal: total, // simplified, assuming no tax calc logic requested yet
                discount_total: 0,
                grand_total: total,
                created_at: now,
                updated_at: now,
                created_by: null // unknown offline
            };

            const lines: SalesInvoiceLine[] = cart.map(item => ({
                id: self.crypto.randomUUID(),
                location_id: locationId,
                sales_invoice_id: invoiceId,
                item_id: item.id,
                qty: item.qty,
                unit_price: item.sale_price,
                line_total: item.subtotal,
                created_at: now,
                updated_at: now,
                created_by: null
            }));

            const payload = {
                invoice,
                lines
            };

            const outboxItem: OutboxItem = {
                id: self.crypto.randomUUID(),
                entity: 'sales_invoices', // treating this as the aggregate root
                action: 'insert',
                location_id: locationId,
                payload: payload,
                status: 'pending',
                created_at: now,
                attempt_count: 0,
                last_error: null
            };

            // Add to sales_queue (sales_queue table in db.ts)
            await db.sales_queue.add(outboxItem); // 'add' inserts

            clearCart();
            alert('Sale saved to queue (Offline)');

        } catch (e: any) {
            console.error('Checkout failed', e);
            alert('Failed to save sale: ' + e.message);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] md:flex-row bg-gray-50 overflow-hidden">
            {/* Left Interface: Catalog */}
            <div className="flex-1 flex flex-col border-r h-full overflow-hidden">
                {/* Header / Search */}
                <div className="p-4 bg-white border-b shadow-sm z-10">
                    <h1 className="text-xl font-bold mb-2">POS Terminal</h1>
                    <div className="flex items-center gap-2">
                        <input
                            type="search"
                            placeholder="Search items by name or barcode..."
                            className="flex-1 p-2 border rounded-md"
                            value={searchInput.value}
                            onChange={e => searchInput.setValue(e.target.value)}
                        />
                        <div className="text-xs text-gray-500">
                            {syncing ? 'Syncing...' : 'Online'}
                        </div>
                    </div>
                    {syncError && <div className="text-red-500 text-xs mt-1">Sync Error: {syncError}</div>}
                </div>

                {/* Item Grid */}
                <div className="flex-1 overflow-y-auto p-4 content-start">
                    {!items ? (
                        <div className="text-center p-10 text-gray-400">Loading catalog...</div>
                    ) : items.length === 0 ? (
                        <div className="text-center p-10 text-gray-400">No items found. {searchInput.value ? 'Try a different search.' : 'Catalog is empty.'}</div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => addToCart(item)}
                                    className="bg-white p-3 rounded-lg shadow-sm border hover:shadow-md cursor-pointer transition-all active:scale-95 flex flex-col justify-between h-[120px]"
                                >
                                    <div className="font-medium line-clamp-2 text-sm">{item.name}</div>
                                    <div>
                                        <div className="text-xs text-gray-400">{item.barcode}</div>
                                        <div className="font-bold text-lg text-primary">${item.sale_price.toFixed(2)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Interface: Cart */}
            <div className="md:w-96 bg-white flex flex-col h-[40vh] md:h-full shadow-xl z-20 border-t md:border-t-0">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="font-bold">Current Sale</h2>
                    <button onClick={clearCart} className="text-red-500 text-sm hover:underline" disabled={cart.length === 0}>
                        Clear
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="text-center text-gray-400 mt-10">Cart is empty</div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                                <div className="flex-1">
                                    <div className="text-sm font-medium">{item.name}</div>
                                    <div className="text-xs text-gray-500">${item.sale_price.toFixed(2)} x {item.qty}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="font-bold text-sm">${item.subtotal.toFixed(2)}</div>
                                    <div className="flex items-center border bg-white rounded">
                                        <button
                                            className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                                            onClick={() => updateQty(item.id, item.qty - 1)}
                                        >-</button>
                                        <span className="text-xs w-6 text-center">{item.qty}</span>
                                        <button
                                            className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                                            onClick={() => updateQty(item.id, item.qty + 1)}
                                        >+</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50">
                    <div className="flex justify-between mb-2 text-sm">
                        <span className="text-gray-500">Items</span>
                        <span>{getItemCount()}</span>
                    </div>
                    <div className="flex justify-between mb-4 text-xl font-bold">
                        <span>Total</span>
                        <span>${getTotalAmount().toFixed(2)}</span>
                    </div>

                    <button
                        className="w-full bg-black text-white py-3 rounded-lg font-bold text-lg disabled:opacity-50 hover:bg-gray-800 transition-colors"
                        disabled={cart.length === 0}
                        onClick={handleCharge}
                    >
                        Charge ${getTotalAmount().toFixed(2)}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Simple hook for input state
function useSearchInput() {
    const [value, setValue] = useState('');
    return { value, setValue };
}
