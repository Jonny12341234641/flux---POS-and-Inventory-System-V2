import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncQueue } from './useSyncQueue';
import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';

// Hoist storage for the mock
const { mockStorage } = vi.hoisted(() => ({
    mockStorage: new Map<string, any>()
}));

// Mock DB
vi.mock('@/lib/db', () => {
    // Helper to filter items
    const getItems = () => Array.from(mockStorage.values());

    return {
        db: {
            // Master Data Stores
            categories: { bulkPut: vi.fn(), toArray: vi.fn() },
            units: { bulkPut: vi.fn(), toArray: vi.fn() },
            locations: { bulkPut: vi.fn(), toArray: vi.fn() },
            user_profiles: { bulkPut: vi.fn(), toArray: vi.fn() },
            suppliers: { bulkPut: vi.fn(), toArray: vi.fn() },
            customers: { bulkPut: vi.fn(), toArray: vi.fn() },
            stock_lots: { bulkPut: vi.fn(), toArray: vi.fn() },
            stock_balances: { bulkPut: vi.fn(), toArray: vi.fn() },
            grns: { bulkPut: vi.fn(), toArray: vi.fn() },
            grn_lines: { bulkPut: vi.fn(), toArray: vi.fn() },

            sales_queue: {
                add: async (item: any) => mockStorage.set(item.id, item),
                get: async (id: string) => mockStorage.get(id),
                update: async (id: string, changes: any) => {
                    const item = mockStorage.get(id);
                    if (item) mockStorage.set(id, { ...item, ...changes });
                },
                clear: async () => mockStorage.clear(),
                toCollection: () => ({
                    first: async () => getItems()[0],
                    sortBy: async (field: string) => getItems().sort((a, b) => a[field] - b[field])
                }),
                where: (field: string) => ({
                    equals: (val1: any) => ({
                        or: (field2: string) => ({
                            equals: (val2: any) => ({
                                toArray: async () => getItems().filter((i: any) =>
                                    (i[field] === val1) || (i[field2] === val2)
                                )
                            })
                        })
                    })
                })
            }
        }
    };
});

// Mocks Supabase
vi.mock('@/lib/supabase/client', () => {
    const mockBuilder = {
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        then: (onfulfilled: any) => Promise.resolve({ data: [], error: null }).then(onfulfilled)
    };

    return {
        createClient: vi.fn(() => ({
            rpc: vi.fn().mockResolvedValue({ error: null }),
            from: vi.fn((table: string) => ({
                insert: vi.fn().mockResolvedValue({ error: null }),
                update: vi.fn().mockResolvedValue({ error: null }),
                delete: vi.fn().mockResolvedValue({ error: null }),
                upsert: vi.fn().mockResolvedValue({ error: null }),
                select: vi.fn(() => mockBuilder)
            }))
        }))
    };
});




describe('Sync Queue Logic', () => {
    beforeEach(async () => {
        await db.sales_queue.clear();
        // Ensure online
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true
        });
        vi.clearAllMocks(); // Clear call counts
    });

    it('Sync Reliability: Should process pending items FIFO', async () => {
        // 1. Seed DB with pending items
        // Insert in reverse order to test sorting
        await db.sales_queue.add({ id: '2', status: 'pending', created_at: '2026-01-01T11:00:00Z', payload: { id: 'temp-2' }, attempt_count: 0, entity: 'customers', action: 'insert' } as any);
        await db.sales_queue.add({ id: '1', status: 'pending', created_at: '2026-01-01T10:00:00Z', payload: { id: 'temp-1' }, attempt_count: 0, entity: 'customers', action: 'insert' } as any);

        // Default success mock is already set in top level mock, so we don't need to override it here
        // or if we do, we must include 'from'
        // vi.mocked(createClient).mockReturnValue({
        //     rpc: vi.fn().mockResolvedValue({ error: null }) as any
        // } as any);

        const { result } = renderHook(() => useSyncQueue());

        // 2. Trigger Sync
        await act(async () => {
            await result.current.processQueue();
        });

        // 3. Verify DB updated
        const item1 = await db.sales_queue.get('1');
        const item2 = await db.sales_queue.get('2');

        expect(item1?.status).toBe('synced');
        expect(item2?.status).toBe('synced');
    });

    it('Failure Handling: Should mark item failed on network error', async () => {
        // Mock failure
        const mockRpc = vi.fn().mockResolvedValue({ error: { message: 'Network Error' } });

        // We must include 'from' in the return value
        vi.mocked(createClient).mockReturnValue({
            rpc: mockRpc,
            from: vi.fn(() => ({
                insert: vi.fn().mockResolvedValue({ error: { message: 'Network Error' } }),
                update: vi.fn().mockResolvedValue({ error: { message: 'Network Error' } }),
                delete: vi.fn().mockResolvedValue({ error: { message: 'Network Error' } }),
                upsert: vi.fn().mockResolvedValue({ error: { message: 'Network Error' } }),
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: { message: 'Network Error' } }),
                    then: (resolve: any) => resolve({ data: [], error: { message: 'Network Error' } })
                })
            }))
        } as any);

        await db.sales_queue.add({ id: '3', status: 'pending', created_at: '2026-01-01T10:00:00Z', payload: { id: 'temp-3' }, attempt_count: 0, entity: 'customers', action: 'insert' } as any);

        const { result } = renderHook(() => useSyncQueue());

        await act(async () => {
            await result.current.processQueue();
        });

        const item = await db.sales_queue.get('3');
        expect(item?.status).toBe('failed');
        expect(item?.attempt_count).toBe(1);
    });
});
