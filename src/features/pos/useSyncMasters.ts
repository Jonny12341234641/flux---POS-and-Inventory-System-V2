'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { db } from '@/lib/db';
import { Item } from '@/types/phase0';

export function useSyncMasters() {
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const sync = async () => {
            // Only sync if online
            if (!navigator.onLine) return;

            setSyncing(true);
            try {
                const supabase = createClient();

                // 1. Get current user's location
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return; // or handle auth check differently

                // Ideally, we get location_id from user metadata or a profile table.
                // For now, let's assume we can fetch all items or filter by the user's location if available in metadata.
                // If user metadata has location_id:
                const locationId = user.user_metadata.location_id;

                let query = supabase.from('items').select('*');
                if (locationId) {
                    query = query.eq('location_id', locationId);
                }

                const { data: items, error: fetchError } = await query.limit(1000);

                if (fetchError) throw fetchError;

                if (items) {
                    // Bulk put into IndexedDB
                    await db.items.bulkPut(items as Item[]);
                    console.log(`Synced ${items.length} items to offline cache.`);
                }

            } catch (err: any) {
                console.error('Sync failed:', err);
                setError(err.message);
            } finally {
                setSyncing(false);
            }
        };

        sync();

        // specific window event listener for online status could be added here
        const onOnline = () => sync();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);

    }, []);

    return { syncing, error };
}
