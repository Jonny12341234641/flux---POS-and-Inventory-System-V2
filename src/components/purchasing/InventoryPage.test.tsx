import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InventoryPage from '@/app/app/inventory/page';
import { db } from '@/lib/db';

// Mock Dexie Hooks
const { mockUseLiveQuery } = vi.hoisted(() => {
    return { mockUseLiveQuery: vi.fn() };
});

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: (fn: any) => mockUseLiveQuery(fn)
}));

// Mock DB (though useLiveQuery mock bypasses it for the main data, search might use it)
vi.mock('@/lib/db', () => ({
    db: {
        stock_balances: {
            orderBy: vi.fn().mockReturnThis(),
            count: vi.fn().mockResolvedValue(2),
            offset: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([])
        },
        items: {
            get: vi.fn(),
            filter: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([])
        },
        stock_lots: {
            get: vi.fn()
        }
    }
}));

// Mock Navigation/Lucide
vi.mock('lucide-react', () => ({
    ChevronLeft: () => <span>Left</span>,
    ChevronRight: () => <span>Right</span>,
    Search: () => <span>Search</span>,
    // Add others if needed
}));

describe('Inventory View', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseLiveQuery.mockReturnValue({
            total: 2,
            data: [
                { id: '1', itemName: 'Good Item', batchNumber: 'B1', expiryDate: new Date('2030-01-01'), quantity_on_hand: 10 },
                { id: '2', itemName: 'Expired Item', batchNumber: 'B2', expiryDate: new Date('2020-01-01'), quantity_on_hand: 5 }
            ]
        });
    });

    it('displays stock items correctly', async () => {
        render(<InventoryPage />);

        // Wait for rendering
        await waitFor(() => {
            expect(screen.getByText('Good Item')).toBeDefined();
            expect(screen.getByText('Expired Item')).toBeDefined();
            expect(screen.getByText('10')).toBeDefined(); // Qty
        });
    });

    it('highlights expired items', async () => {
        render(<InventoryPage />);

        await waitFor(() => {
            // Check for "EXPIRED" badge or class
            expect(screen.getByText('EXPIRED')).toBeDefined();

            // Check if Expired Item has red text class (integration check on class)
            // This is harder with testing-library unless we look at the row
            const expiredBadge = screen.getByText('EXPIRED');
            expect(expiredBadge.className).toContain('bg-red-100');
        });
    });
});
