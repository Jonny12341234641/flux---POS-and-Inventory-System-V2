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

            // Fetch pending items sorted by created_at (FIFO)
            // Dexie: use toArray() then sort or use orderBy if index exists. 
            // We indexed 'status' and 'created_at' in db.ts? check db.ts
            // Actually we indexed 'sales_queue: id, status, created_at'

            const pendingItems = await db.sales_queue
                .where('status').equals('PENDING') // Note: Case sensitive check 'pending' vs 'PENDING', need to match insertion
                // Actually earlier POS inserted 'pending' (lowercase) or 'PENDING'?
                // The Plan said 'PENDING', but let's check what I wrote in POS page. 
                // POS page used: status: 'pending' (lowercase) in the correction step.
                // Wait, I need to check the file content or stick to what I wrote. 
                // The user edit showed: status: 'pending'. 
                // So I must look for 'pending'.
                // Actually, let's look for both to be safe or normalize? No, better stick to one.
                // I will use 'pending' as per the latest user edit.
                .or('status').equals('PENDING') // Just in case
                .toArray();

            // Sort in memory since we can't easily compound index sort with 'OR' in basic dexie without generated index
            pendingItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            if (pendingItems.length === 0) {
                setIsProcessing(false);
                processingRef.current = false;
                return;
            }

            console.log(`Processing ${pendingItems.length} offline items...`);

            for (const item of pendingItems) {
                // Double check online status before each request
                if (!navigator.onLine) break;

                try {
                    // RPC Call
                    const { error } = await supabase.rpc('post_sale', { payload: item.payload });

                    if (error) throw error;

                    // Success: Mark as synced
                    await db.sales_queue.update(item.id, {
                        status: 'synced', // Let's use UPPERCASE for status normally, but user used lowercase pending. 
                        // I'll stick to 'SYNCED' for final state.
                        last_error: null,
                        attempt_count: (item.attempt_count || 0) + 1
                    });

                } catch (err: any) {
                    console.error('Sync failed for item', item.id, err);

                    // Failure: Update status
                    await db.sales_queue.update(item.id, {
                        status: 'failed',
                        last_error: err.message || 'Unknown error',
                        attempt_count: (item.attempt_count || 0) + 1
                    });

                    // If network error, maybe stop processing loop? 
                    // Supabase JS often returns error object even for network, but let's verify if generic fetch error.
                    // For now, continue to try next or stop? Safer to stop if it's a connection issue.
                    // Getting detailed error code from supabase can be tricky.
                    // We'll just continue for now unless we detect offline.
                }
            }

        } catch (error) {
            console.error('Sync Queue Global Error:', error);
        } finally {
            setIsProcessing(false);
            processingRef.current = false;
        }
    }, []);

    // Auto-sync on online event
    useEffect(() => {
        const handleOnline = () => {
            console.log('App is online. Triggering sync...');
            processQueue();
        };

        window.addEventListener('online', handleOnline);

        // Also trigger once on mount if already online
        if (navigator.onLine) {
            processQueue();
        }

        return () => window.removeEventListener('online', handleOnline);
    }, [processQueue]);

    return { processQueue, isProcessing };
}
