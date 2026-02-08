'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import { OutboxItem } from '@/types/phase0';

export function useSyncQueue() {
    const [isProcessing, setIsProcessing] = useState(false);
    const processingRef = useRef(false); // Ref to avoid closure stale state issues if called rapidly

    const processQueue = useCallback(async () => {
        if (processingRef.current || !navigator.onLine) return;

        processingRef.current = true;
        setIsProcessing(true);

        try {
            const supabase = createClient();

            const pendingItems = await db.sales_queue
                .where('status').equals('pending')
                .or('status').equals('PENDING')
                .toArray();

            pendingItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            if (pendingItems.length === 0) {
                // Even if nothing to push, we might want to pull? 
                // Usually push first then pull to get latest state including our own if we want.
                // But let's keep them separate or sequential.
            } else {
                console.log(`Processing ${pendingItems.length} offline items...`);

                for (const item of pendingItems) {
                    if (!navigator.onLine) break;

                    try {
                        let error = null;

                        // Switch logic based on entity
                        if (item.entity === 'sales_invoices') {
                            // Keep using RPC for complex sales transaction if needed, 
                            // or switch to direct insert if backend supports it.
                            // Assuming 'post_sale' is still the way for sales.
                            const res = await supabase.rpc('post_sale', { payload: item.payload });
                            error = res.error;
                        } else {
                            // Generic handler for other entities (Suppliers, Customers, etc.)
                            if (item.action === 'insert') {
                                const res = await supabase.from(item.entity).insert(item.payload);
                                error = res.error;
                            } else if (item.action === 'update') {
                                const res = await supabase.from(item.entity).update(item.payload).eq('id', item.payload.id);
                                error = res.error;
                            } else if (item.action === 'delete') {
                                const res = await supabase.from(item.entity).delete().eq('id', item.payload.id);
                                error = res.error;
                            } else {
                                console.warn(`Unknown action ${item.action} for item ${item.id}`);
                                continue; // Skip unknown actions
                            }
                        }

                        if (error) throw error;

                        await db.sales_queue.update(item.id, {
                            status: 'synced',
                            last_error: null,
                            attempt_count: (item.attempt_count || 0) + 1
                        });

                    } catch (err: any) {
                        console.error(`Sync failed for item ${item.id} (${item.entity})`, err);
                        await db.sales_queue.update(item.id, {
                            status: 'failed',
                            last_error: err.message || 'Unknown error',
                            attempt_count: (item.attempt_count || 0) + 1
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Sync Queue Global Error:', error);
        } finally {
            setIsProcessing(false);
            processingRef.current = false;
        }
    }, []);

    // New Pull Logic
    const pullMasterData = useCallback(async () => {
        if (!navigator.onLine) return;
        console.log('Pulling master data...');
        const supabase = createClient();

        try {
            // Pull Suppliers
            const { data: suppliers, error: supError } = await supabase.from('suppliers').select('*');
            if (!supError && suppliers) {
                await db.suppliers.bulkPut(suppliers);
            }

            // Pull Customers
            const { data: customers, error: custError } = await supabase.from('customers').select('*');
            if (!custError && customers) {
                await db.customers.bulkPut(customers);
            }

            // Pull Stock Lots (Optional: might be heavy, filter by active?)
            const { data: lots, error: lotError } = await supabase.from('stock_lots').select('*');
            if (!lotError && lots) {
                await db.stock_lots.bulkPut(lots);
            }

            // Pull Stock Balances
            const { data: balances, error: balError } = await supabase.from('stock_balances').select('*');
            if (!balError && balances) {
                await db.stock_balances.bulkPut(balances);
            }

            console.log('Master data pulled successfully.');

        } catch (error) {
            console.error('Error pulling master data:', error);
        }
    }, []);

    // Auto-sync on online event and mount
    useEffect(() => {
        const handleOnline = () => {
            console.log('App is online. Triggering sync...');
            processQueue().then(() => pullMasterData());
        };

        window.addEventListener('online', handleOnline);

        if (navigator.onLine) {
            // Initial sync: Push pending, then pull latest
            processQueue().then(() => pullMasterData());
        }

        return () => window.removeEventListener('online', handleOnline);
    }, [processQueue, pullMasterData]);

    return { processQueue, pullMasterData, isProcessing };
}



