import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransferInList from './TransferInList';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';

// --- Mocks ---

// Mock Sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock Dexie hooks
// We mock the hook directly to control the data fed to the component
vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: vi.fn(),
}));

// Mock DB
vi.mock('@/lib/db', () => ({
    db: {
        stock_transfers: {
            update: vi.fn(),
        },
        sales_queue: {
            add: vi.fn(),
        },
        transaction: vi.fn(async (...args) => {
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
                return callback();
            }
            return undefined;
        }),
    },
}));

describe('TransferInList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('Render Empty State: shows message when no transfers found', () => {
        // Mock return empty array
        (useLiveQuery as any).mockReturnValue([]);

        render(<TransferInList />);

        expect(screen.getByText(/No incoming transfers/i)).toBeInTheDocument();
    });

    it('Render List: displays transfers with correct names', () => {
        // Mock return data
        const mockTransfers = [
            {
                id: 'transfer-1',
                transfer_date: '2023-11-01',
                sourceName: 'Branch A',
                targetName: 'Branch B',
                status: 'in_transit'
            }
        ];
        (useLiveQuery as any).mockReturnValue(mockTransfers);

        render(<TransferInList />);

        expect(screen.getByText('Branch A')).toBeInTheDocument();
        expect(screen.getByText('Branch B')).toBeInTheDocument();
        // Check date formatting if needed, 'PP' usually "Nov 1, 2023"
    });

    it('Receive Action: updates transfer status to completed', async () => {
        const user = userEvent.setup();
        const mockTransfers = [
            {
                id: 'transfer-1',
                transfer_date: '2023-11-01',
                sourceName: 'Branch A',
                targetName: 'Branch B',
                status: 'in_transit'
            }
        ];
        (useLiveQuery as any).mockReturnValue(mockTransfers);

        render(<TransferInList />);

        // Click Receive
        const receiveButton = screen.getByRole('button', { name: /Receive/i });
        await user.click(receiveButton);

        await waitFor(() => {
            expect(db.transaction).toHaveBeenCalled();
        });

        // Check DB Update
        expect(db.stock_transfers.update).toHaveBeenCalledWith('transfer-1', expect.objectContaining({
            status: 'completed'
        }));

        // Check Toast
        expect(toast.success).toHaveBeenCalledWith("Transfer Received!");
    });
});
