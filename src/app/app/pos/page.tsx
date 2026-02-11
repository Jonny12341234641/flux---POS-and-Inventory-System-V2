'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { Item, StockLot, OutboxItem } from '@/types/phase0';
import { PosLayout } from '@/components/pos/PosLayout';
import { ProductSearch } from '@/components/pos/ProductSearch';
import { Cart, CartItem } from '@/components/pos/Cart';
import { PaymentModal, Payment } from '@/components/pos/PaymentModal';
import { toast } from 'sonner';

export default function PosPage() {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [locationId, setLocationId] = useState<string>('');
    const [userId, setUserId] = useState<string>(''); // For created_by
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);

    // Initialize: Get Location & User
    useEffect(() => {
        const init = async () => {
            // Ideally get from Auth Context. For offline demo, we get the first location.
            const loc = await db.locations.limit(1).first();
            if (loc) setLocationId(loc.id);

            // Mock user or try to find one
            const profile = await db.user_profiles.limit(1).first();
            if (profile) setUserId(profile.user_id);
            else setUserId('00000000-0000-0000-0000-000000000000'); // Fallback
        };
        init();
    }, []);

    const handleAddToCart = (item: Item, lot?: StockLot, maxQty: number = 9999) => {
        setCart(prev => {
            // Check if item+lot exists
            const existingIdx = prev.findIndex(i => i.item.id === item.id && i.lot?.id === lot?.id);
            if (existingIdx >= 0) {
                const newCart = [...prev];
                const currentQty = newCart[existingIdx].qty;
                if (currentQty < maxQty) {
                    newCart[existingIdx].qty += 1;
                } else {
                    toast.error('Max stock reached for current selection');
                }
                return newCart;
            }
            // Add new
            return [...prev, {
                item,
                lot,
                qty: 1,
                maxQty,
                unitPrice: item.sale_price,
                discountAmount: 0
            }];
        });
    };

    const handleUpdateQty = (index: number, newQty: number) => {
        setCart(prev => {
            const newCart = [...prev];
            newCart[index].qty = newQty;
            return newCart;
        });
    };

    const handleRemove = (index: number) => {
        setCart(prev => prev.filter((_, i) => i !== index));
    };

    const handleCompleteSale = async (payments: Payment[]) => {
        if (!locationId) {
            toast.error('Error: No Location ID found');
            return;
        }

        try {
            const invoiceId = crypto.randomUUID();
            const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`; // Simple check, real app needs better sequence

            const totalAmount = cart.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
            const discountAmount = cart.reduce((sum, i) => sum + (i.qty * i.discountAmount), 0);
            const netAmount = totalAmount - discountAmount;

            // 1. Construct Payload
            const payload = {
                invoice: {
                    id: invoiceId,
                    location_id: locationId,
                    customer_id: null, // Walk-in for now
                    invoice_number: invoiceNumber,
                    total_amount: totalAmount,
                    discount_amount: discountAmount,
                    net_amount: netAmount,
                    payment_status: 'paid', // Assuming full payment in POS
                    status: 'posted',
                    created_at: new Date().toISOString(),
                    created_by: userId
                },
                lines: cart.map(line => ({
                    id: crypto.randomUUID(),
                    invoice_id: invoiceId,
                    item_id: line.item.id,
                    lot_id: line.lot?.id || null,
                    qty: line.qty,
                    unit_price: line.unitPrice,
                    discount_amount: line.discountAmount,
                    total: (line.qty * line.unitPrice) - (line.qty * line.discountAmount)
                })),
                payments: payments.map(p => ({
                    id: crypto.randomUUID(),
                    invoice_id: invoiceId,
                    method: p.method,
                    amount: p.amount,
                    reference_note: p.reference_note,
                    created_at: new Date().toISOString()
                }))
            };

            // 2. Add to Outbox (Offline Queue)
            const outboxItem: OutboxItem = {
                id: crypto.randomUUID(),
                entity: 'sales_transaction',
                action: 'insert', // Action doesn't matter much for RPC, but 'insert' is logical
                location_id: locationId,
                payload: payload,
                status: 'pending',
                created_at: new Date().toISOString(),
                attempt_count: 0,
                last_error: null
            };

            await db.sales_queue.add(outboxItem);

            // 3. Clear Cart & Close Modal
            setCart([]);
            setIsPaymentOpen(false);
            toast.success(`Sale Completed! Invoice: ${invoiceNumber}`);

            // 4. Trigger Sync (if online)
            if (navigator.onLine) {
                // The sync hook listen to online events, but we can also trigger it?.
                // For now rely on auto-sync or manual.
            }

        } catch (error) {
            console.error('Sale Error:', error);
            toast.error('Failed to process sale');
        }
    };

    return (
        <div className="h-full bg-slate-50/50">
            <PosLayout
                leftPanel={
                    <ProductSearch
                        onAddToCart={handleAddToCart}
                        locationId={locationId}
                    />
                }
                rightPanel={
                    <Cart
                        items={cart}
                        onUpdateQty={handleUpdateQty}
                        onRemove={handleRemove}
                        onPayment={() => setIsPaymentOpen(true)}
                    />
                }
            />

            <PaymentModal
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                totalAmount={cart.reduce((sum, i) => sum + (i.qty * i.unitPrice) - (i.qty * i.discountAmount), 0)}
                onComplete={handleCompleteSale}
            />
        </div>
    );
}
