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
                            // Keep using RPC for complex sales transaction if needed
                            const res = await supabase.rpc('post_sale', { payload: item.payload });
                            error = res.error;

                        } else if (item.entity === 'grns') {
                            // Handle GRN Sync
                            if (item.action === 'insert' || item.action === 'update') {
                                // If it's a posted GRN, we need to call the RPC to finalize stock
                                // Check the payload status
                                if (item.payload.status === 'posted') {
                                    // Call safe RPC
                                    const { error: rpcError } = await supabase.rpc('post_grn', { grn_id: item.payload.id });
                                    error = rpcError;
                                    if (error && error.message.includes("already posted")) {
                                        // Idempotency: treat as success
                                        error = null;
                                    }
                                } else {
                                    const { error: upsertError } = await supabase.from('grns').upsert(item.payload);
                                    error = upsertError;
                                }
                            } else {
                                // Delete?
                                const { error: delError } = await supabase.from('grns').delete().eq('id', item.payload.id);
                                error = delError;
                            }

                        } else if (item.entity === 'grn_lines') {
                            // GRN Lines
                            if (item.action === 'insert' || item.action === 'update') {
                                const { error: lineError } = await supabase.from('grn_lines').upsert(item.payload);
                                error = lineError;
                            } else {
                                const { error: lineError } = await supabase.from('grn_lines').delete().eq('id', item.payload.id);
                                error = lineError;
                            }


                        } else if (item.entity === 'purchase_orders') {
                            // Purchase Orders
                            if (item.action === 'insert' || item.action === 'update') {
                                if (item.payload.status === 'approved') {
                                    // Call RPC
                                    const { error: rpcError } = await supabase.rpc('post_purchase_order', { po_id: item.payload.id });
                                    error = rpcError;
                                    // Idempotency check could be added here if needed
                                } else {
                                    const { error: upsertError } = await supabase.from('purchase_orders').upsert(item.payload);
                                    error = upsertError;
                                }
                            } else {
                                const { error: delError } = await supabase.from('purchase_orders').delete().eq('id', item.payload.id);
                                error = delError;
                            }

                        } else if (item.entity === 'purchase_order_lines') {
                            if (item.action === 'insert' || item.action === 'update') {
                                const { error: lineError } = await supabase.from('purchase_order_lines').upsert(item.payload);
                                error = lineError;
                            } else {
                                const { error: lineError } = await supabase.from('purchase_order_lines').delete().eq('id', item.payload.id);
                                error = lineError;
                            }

                        } else if (item.entity === 'stock_transfers') {
                            // Stock Transfers
                            if (item.action === 'insert' || item.action === 'update') {
                                if (item.payload.status === 'in_transit') {
                                    // Sending Transfer
                                    // Only call RPC if we are transitioning. Use upsert for properties, then RPC? 
                                    // Or RPC handles everything? The RPC updates status. 
                                    // We should probably ensure the record exists first if it's new, but typically it's created as pending first.
                                    // Logic: If it's a new 'in_transit' record (unlikely) or update.
                                    const { error: rpcError } = await supabase.rpc('post_stock_transfer_out', { transfer_id: item.payload.id });
                                    error = rpcError;
                                } else if (item.payload.status === 'completed') {
                                    // Receiving Transfer
                                    const { error: rpcError } = await supabase.rpc('receive_stock_transfer', { transfer_id: item.payload.id });
                                    error = rpcError;
                                } else {
                                    // Pending or other updates
                                    const { error: upsertError } = await supabase.from('stock_transfers').upsert(item.payload);
                                    error = upsertError;
                                }
                            } else {
                                const { error: delError } = await supabase.from('stock_transfers').delete().eq('id', item.payload.id);
                                error = delError;
                            }

                        } else if (item.entity === 'stock_transfer_lines') {
                            if (item.action === 'insert' || item.action === 'update') {
                                const { error: lineError } = await supabase.from('stock_transfer_lines').upsert(item.payload);
                                error = lineError;
                            } else {
                                const { error: lineError } = await supabase.from('stock_transfer_lines').delete().eq('id', item.payload.id);
                                error = lineError;
                            }

                        } else if (item.entity === 'sales_transaction') {
                            // Complex Sale Transaction via RPC
                            // Payload: { invoice, lines, payments }
                            const { error: rpcError } = await supabase.rpc('post_sale_transaction', { payload: item.payload });
                            error = rpcError;
                            // Idempotency is handled inside RPC (checks invoice_number + location)

                        } else if (item.entity === 'sales_return') {
                            // Sales Return Logic
                            // Payload: { return: Object, lines: Array }
                            // 1. Insert/Upsert Return Header & Lines
                            // 2. Call RPC to Post (Stock impact)
                            const returnData = item.payload.return;
                            const linesData = item.payload.lines;

                            // A. Upsert Header
                            const { error: headError } = await supabase.from('sales_returns').upsert(returnData);
                            if (headError) throw headError;

                            // B. Upsert Lines
                            if (linesData && linesData.length > 0) {
                                const { error: linesError } = await supabase.from('sales_return_lines').upsert(linesData);
                                if (linesError) throw linesError;
                            }

                            // C. Post (if status is 'posted' in payload, we assume we want to finalize it)
                            // If it was validly created, we post it.
                            if (returnData.status === 'posted') {
                                const { error: rpcError } = await supabase.rpc('post_sales_return', { return_id: returnData.id });
                                // Ignore "Already posted" error for idempotency
                                if (rpcError && !rpcError.message.includes('Already posted')) {
                                    throw rpcError;
                                }
                            }

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

            // Pull GRNs (Last 30 days maybe? For now all)
            const { data: grns, error: grnError } = await supabase.from('grns').select('*').limit(100);
            if (!grnError && grns) {
                await db.grns.bulkPut(grns);
            }

            // Pull Purchase Orders
            const { data: pos, error: poError } = await supabase.from('purchase_orders').select('*').limit(100);
            if (!poError && pos) {
                await db.purchase_orders.bulkPut(pos);
            }

            // Pull Purchase Order Lines
            // const { data: poLines, error: poLineError } = await supabase.from('purchase_order_lines').select('*').limit(500);
            // if (!poLineError && poLines) {
            //    await db.purchase_order_lines.bulkPut(poLines);
            // }

            // Pull Transfers
            const { data: transfers, error: trError } = await supabase.from('stock_transfers').select('*').limit(100);
            if (!trError && transfers) {
                await db.stock_transfers.bulkPut(transfers);
            }

            // Pull Sales History (Recent 100 for returns)
            const { data: sales, error: salesError } = await supabase.from('sales_invoices').select('*').order('created_at', { ascending: false }).limit(100);
            if (!salesError && sales) {
                await db.sales_invoices.bulkPut(sales);

                // Pull related lines
                const invoiceIds = sales.map(s => s.id);
                if (invoiceIds.length > 0) {
                    const { data: sLines, error: slError } = await supabase.from('sales_invoice_lines').select('*').in('invoice_id', invoiceIds);
                    if (!slError && sLines) {
                        await db.sales_invoice_lines.bulkPut(sLines);
                    }
                }
            }

            // Pull Sales Returns
            const { data: returns, error: retError } = await supabase.from('sales_returns').select('*').order('created_at', { ascending: false }).limit(50);
            if (!retError && returns) {
                await db.sales_returns.bulkPut(returns);
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



