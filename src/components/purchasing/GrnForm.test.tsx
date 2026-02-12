import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GrnForm from './GrnForm';
import { db } from '@/lib/db';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
    useSearchParams: () => ({
        get: vi.fn().mockReturnValue(null),
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock Dexie Hooks to provide Master Data
const { mockUseLiveQuery } = vi.hoisted(() => {
    return { mockUseLiveQuery: vi.fn() };
});

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: mockUseLiveQuery
}));

describe('Purchasing Flow (Offline-First)', () => {

    const mockSuppliers = [
        { id: 'sup-1', name: 'Test Supplier', location_id: 'loc-1' }
    ];

    const mockItems = [
        { id: 'item-1', name: 'Standard Item', is_batch_tracked: false, cost: 50 },
        { id: 'item-2', name: 'Batched Item', is_batch_tracked: true, cost: 100 }
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        mockUseLiveQuery.mockImplementation((fn: any) => {
            // Basic logic to guess what data to return
            // We can't easily see the fn logic string reliably in all envs, but let's try or return everything
            return [...mockSuppliers, ...mockItems]; // Hack: Return both for any query? 
            // Arrays are compatible-ish? 
            // If GrnForm maps suppliers, it expects { id, name }.
            // If it maps items, it expects { id, name, is_batch_tracked }.
            // Let's implement switching based on simple heuristic or just return undefined and let test logic set it?

            // Better: Return a large set of mixed objects. 
            // Components map them.
            // Supplier select maps `suppliers`. Item select maps `items`.
            // If we return mixed list to both, supplier map will work (has name/id). Item map will work.
            // This is a dirty hack but effective for this unit test context where we lack a real DB.
        });

        // Refined Mock Logic:
        // Identify caller? No.
        mockUseLiveQuery.mockReturnValue([...mockSuppliers, ...mockItems]);

        // Mock DB Tables
        (db.grns as any) = {
            put: vi.fn().mockResolvedValue('grn-id'),
            add: vi.fn(),
            get: vi.fn(),
            where: vi.fn().mockReturnThis(),
            delete: vi.fn(),
            toArray: vi.fn()
        };
        (db.grn_lines as any) = {
            add: vi.fn(),
            where: vi.fn().mockReturnThis(),
            delete: vi.fn(),
            toArray: vi.fn()
        };
        (db.stock_lots as any) = {
            where: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null), // No existing lot
            add: vi.fn().mockResolvedValue('lot-id'),
            get: vi.fn()
        };
        (db.sales_queue as any) = {
            add: vi.fn().mockResolvedValue('q-id')
        };
        (db.purchase_orders as any) = {
            get: vi.fn().mockResolvedValue(null)
        };
        (db.purchase_order_lines as any) = {
            where: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([])
        };
        (db.locations as any) = {
            toArray: vi.fn().mockResolvedValue([{ id: 'loc-1', name: 'Main Store' }]),
        };
        (db.transaction as any) = vi.fn((...args) => {
            const callback = args[args.length - 1];
            return callback();
        });
    });

    it('requires Batch/Expiry fields for Batch Tracked items', async () => {
        const user = userEvent.setup();
        render(<GrnForm />);

        // 1. Select Supplier
        await user.selectOptions(screen.getByTestId('supplier-select'), 'sup-1');

        // 2. Select Batched Item
        await user.selectOptions(screen.getByTestId('item-select-0'), 'item-2');

        // 3. Try to Save Draft
        await user.click(screen.getByText('Save Draft'));

        // 4. Verify Error Toast or message
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalled();
        });
    });

    it('saves as draft when Batch Tracked item has all fields', async () => {
        const user = userEvent.setup();
        render(<GrnForm />);

        // 1. Fill Form
        await user.selectOptions(screen.getByTestId('supplier-select'), 'sup-1');
        await user.selectOptions(screen.getByTestId('item-select-0'), 'item-2');

        // Fill Batch & Expiry
        const batchInput = screen.getByPlaceholderText('Batch #');
        await waitFor(() => expect(batchInput).not.toBeDisabled());
        await user.type(batchInput, 'BATCH-001');

        // Expiry (date input)
        // Finding date input might be tricky if not labeled explicitly in table.
        // It's the last input in the row typically.
        const expiryInput = document.querySelector('input[name="lines.0.expiry_date"]');
        if (expiryInput) {
            await waitFor(() => expect(expiryInput).not.toBeDisabled());
            await fireEvent.change(expiryInput, { target: { value: '2026-12-31' } }); // date input typing is tricky with userEvent, use fireEvent for date
        }

        // 2. Save Draft
        await user.click(screen.getByText('Save Draft'));

        // 3. Verify DB Calls
        await waitFor(() => {
            expect(db.grns.put).toHaveBeenCalledWith(expect.objectContaining({
                status: 'draft',
                supplier_id: 'sup-1'
            }));

            // Verify Queue (Drafts are queued for sync? Our code does queue them in handleSave)
            expect(db.sales_queue.add).toHaveBeenCalled(); // For GRN
        });
    });

    it('processes Post & Sync correctly', async () => {
        const user = userEvent.setup();
        render(<GrnForm />);

        // 1. Fill Form (Non-batched for simplicity)
        await user.selectOptions(screen.getByTestId('supplier-select'), 'sup-1');
        await user.selectOptions(screen.getByTestId('item-select-0'), 'item-1');

        // 2. Click Post & Sync
        await user.click(screen.getByTestId('post-btn'));

        // 3. Verify DB Calls
        await waitFor(() => {
            expect(db.grns.put).toHaveBeenCalledWith(expect.objectContaining({
                status: 'posted'
            }));

            // Verify Queue
            expect(db.sales_queue.add).toHaveBeenCalledWith(expect.objectContaining({
                entity: 'grns',
                payload: expect.objectContaining({ status: 'posted' })
            }));

            // Success Toast
            expect(toast.success).toHaveBeenCalledWith('GRN Posted!');
        });
    });
});
