// 'use client';

// import { useEffect, useState, useCallback, useRef } from 'react';
// import { db } from '@/lib/db';
// import { createClient } from '@/lib/supabase/client';
// import { OutboxItem } from '@/types/phase0';

// export function useSyncQueue() {
//     const [isProcessing, setIsProcessing] = useState(false);
//     const processingRef = useRef(false); // Ref to avoid closure stale state issues if called rapidly

//     const processQueue = useCallback(async () => {
//         if (processingRef.current || !navigator.onLine) return;

//         processingRef.current = true;
//         setIsProcessing(true);

//         try {
//             const supabase = createClient();

//             // Fetch pending items sorted by created_at (FIFO)
//             // Dexie: use toArray() then sort or use orderBy if index exists. 
//             // We indexed 'status' and 'created_at' in db.ts? check db.ts
//             // Actually we indexed 'sales_queue: id, status, created_at'

//             const pendingItems = await db.sales_queue
//                 .where('status').equals('PENDING') // Note: Case sensitive check 'pending' vs 'PENDING', need to match insertion
//                 // Actually earlier POS inserted 'pending' (lowercase) or 'PENDING'?
//                 // The Plan said 'PENDING', but let's check what I wrote in POS page. 
//                 // POS page used: status: 'pending' (lowercase) in the correction step.
//                 // Wait, I need to check the file content or stick to what I wrote. 
//                 // The user edit showed: status: 'pending'. 
//                 // So I must look for 'pending'.
//                 // Actually, let's look for both to be safe or normalize? No, better stick to one.
//                 // I will use 'pending' as per the latest user edit.
//                 .or('status').equals('PENDING') // Just in case
//                 .toArray();

//             // Sort in memory since we can't easily compound index sort with 'OR' in basic dexie without generated index
//             pendingItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

//             if (pendingItems.length === 0) {
//                 setIsProcessing(false);
//                 processingRef.current = false;
//                 return;
//             }

//             console.log(`Processing ${pendingItems.length} offline items...`);

//             for (const item of pendingItems) {
//                 // Double check online status before each request
//                 if (!navigator.onLine) break;

//                 try {
//                     // RPC Call
//                     const { error } = await supabase.rpc('post_sale', { payload: item.payload });

//                     if (error) throw error;

//                     // Success: Mark as synced
//                     await db.sales_queue.update(item.id, {
//                         status: 'synced', // Let's use UPPERCASE for status normally, but user used lowercase pending. 
//                         // I'll stick to 'SYNCED' for final state.
//                         last_error: null,
//                         attempt_count: (item.attempt_count || 0) + 1
//                     });

//                 } catch (err: any) {
//                     console.error('Sync failed for item', item.id, err);

//                     // Failure: Update status
//                     await db.sales_queue.update(item.id, {
//                         status: 'failed',
//                         last_error: err.message || 'Unknown error',
//                         attempt_count: (item.attempt_count || 0) + 1
//                     });

//                     // If network error, maybe stop processing loop? 
//                     // Supabase JS often returns error object even for network, but let's verify if generic fetch error.
//                     // For now, continue to try next or stop? Safer to stop if it's a connection issue.
//                     // Getting detailed error code from supabase can be tricky.
//                     // We'll just continue for now unless we detect offline.
//                 }
//             }

//         } catch (error) {
//             console.error('Sync Queue Global Error:', error);
//         } finally {
//             setIsProcessing(false);
//             processingRef.current = false;
//         }
//     }, []);

//     // Auto-sync on online event
//     useEffect(() => {
//         const handleOnline = () => {
//             console.log('App is online. Triggering sync...');
//             processQueue();
//         };

//         window.addEventListener('online', handleOnline);

//         // Also trigger once on mount if already online
//         if (navigator.onLine) {
//             processQueue();
//         }

//         return () => window.removeEventListener('online', handleOnline);
//     }, [processQueue]);

//     return { processQueue, isProcessing };
// }


'use client';

import { useEffect } from 'react';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';

export function useSyncQueue() {
    const supabase = createClient();

    // The worker function - Defined outside state to avoid closure staleness
    const processQueue = async () => {
        // 1. Direct check: If browser says offline, stop immediately.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log('Device is offline. Skipping sync.');
            return;
        }

        try {
            // 2. Fetch all PENDING items
            const pendingItems = await db.sales_queue
                .where('status')
                .equals('pending')
                .toArray();

            if (pendingItems.length === 0) return;

            console.log(`🔌 Sync Engine: Found ${pendingItems.length} pending items.`);

            for (const item of pendingItems) {
                try {
                    console.log(`Processing item ${item.id}...`);

                    // 3. Send to Server via RPC
                    const { error } = await supabase.rpc('post_sale', {
                        payload: item.payload
                    });

                    if (error) throw error;

                    // 4. Success! Update status to SYNCED
                    console.log(`✅ Item ${item.id} synced successfully.`);
                    await db.sales_queue.update(item.id, {
                        status: 'synced',
                        last_error: null
                    });

                } catch (err: any) {
                    console.error(`❌ Sync failed for item ${item.id}:`, err);

                    // 5. Failure! Update status to FAILED so user sees red badge
                    await db.sales_queue.update(item.id, {
                        status: 'failed',
                        last_error: err.message || 'Unknown RPC error'
                    });
                }
            }
        } catch (error) {
            console.error('🔥 Critical Sync Engine Error:', error);
        }
    };

    useEffect(() => {
        // 1. Try to sync immediately when the app loads
        processQueue();

        // 2. Listen for "Online" event (when Wi-Fi comes back)
        const handleOnline = () => {
            console.log('📡 Network is Online. Triggering sync...');
            processQueue();
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, []);
}