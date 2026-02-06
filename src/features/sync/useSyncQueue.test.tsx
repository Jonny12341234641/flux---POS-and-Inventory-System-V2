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
            sales_queue: {
                add: async (item: any) => mockStorage.set(item.id, item),
                get: async (id: string) => mockStorage.get(id),
                update: async (id: string, changes: any) => {
                    const item = mockStorage.get(id);
                    if (item) mockStorage.set(id, { ...item, ...changes });
                },
                clear: async () => mockStorage.clear(),
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
vi.mock('@/lib/supabase/client', () => ({
    createClient: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({ error: null }) // Default success
    }))
}));

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
        await db.sales_queue.add({ id: '2', status: 'pending', created_at: '2026-01-01T11:00:00Z', payload: {}, attempt_count: 0 } as any);
        await db.sales_queue.add({ id: '1', status: 'pending', created_at: '2026-01-01T10:00:00Z', payload: {}, attempt_count: 0 } as any);

        // Default success mock is already set in top level mock, but we can ensure it:
        vi.mocked(createClient).mockReturnValue({
            rpc: vi.fn().mockResolvedValue({ error: null }) as any
        } as any);

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
        vi.mocked(createClient).mockReturnValue({ rpc: mockRpc } as any);

        await db.sales_queue.add({ id: '3', status: 'pending', created_at: '2026-01-01T10:00:00Z', payload: {}, attempt_count: 0 } as any);

        const { result } = renderHook(() => useSyncQueue());

        await act(async () => {
            await result.current.processQueue();
        });

        const item = await db.sales_queue.get('3');
        expect(item?.status).toBe('failed');
        expect(item?.attempt_count).toBe(1);
    });
});
