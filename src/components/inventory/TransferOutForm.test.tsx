import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransferOutForm from './TransferOutForm';
import { db } from '@/lib/db';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

// --- Mocks ---

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Robust mock: execute the callback to get data from db mocks
vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: (fn: Function) => {
        try {
            return fn();
        } catch (e) {
            return undefined;
        }
    },
}));

// Mock DB
vi.mock('@/lib/db', () => ({
    db: {
        locations: {
            toArray: vi.fn(),
        },
        items: {
            toArray: vi.fn(),
        },
        stock_balances: {
            toArray: vi.fn(),
        },
        stock_transfers: {
            add: vi.fn(),
        },
        stock_transfer_lines: {
            add: vi.fn(),
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

// Setup crypto
beforeAll(() => {
    if (!global.crypto) {
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: () => 'test-uuid-transfer',
            },
        });
    }
});

describe('TransferOutForm', () => {
    const mockLocations = [
        { id: 'loc-1', name: 'Branch A' },
        { id: 'loc-2', name: 'Branch B' },
    ];

    const mockItems = [
        { id: 'item-1', name: 'Widget X' },
    ];

    // Default balances (sufficient stock)
    // loc-1 has 100
    const mockBalancesSufficient = [
        { location_id: 'loc-1', item_id: 'item-1', quantity_on_hand: 100 },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock returns
        (db.locations.toArray as any).mockReturnValue(mockLocations);
        (db.items.toArray as any).mockReturnValue(mockItems);
        (db.stock_balances.toArray as any).mockReturnValue(mockBalancesSufficient);
    });

    afterEach(() => {
        cleanup();
    });

    it('Same Location Error: checks that Source and Target cannot be the same', async () => {
        const user = userEvent.setup();
        render(<TransferOutForm />);

        // Select Source: Branch A
        const selects = screen.getAllByRole('combobox');
        const sourceSelect = selects[0];
        await user.selectOptions(sourceSelect, 'loc-1');

        // Select Target: Branch A
        const targetSelect = selects[1];
        await user.selectOptions(targetSelect, 'loc-1');

        // Select Item (to ensure form is valid otherwise)
        // 0: Source, 1: Target, 2: Item in row
        await user.selectOptions(selects[2], 'item-1');

        // Submit
        const sendButton = screen.getByText(/Send Transfer/i);
        await user.click(sendButton);

        // Expect toast error
        expect(toast.error).toHaveBeenCalledWith("Source and Target locations must be different");
        expect(db.stock_transfers.add).not.toHaveBeenCalled();
    });

    it('Insufficient Stock Error: checks available stock against transfer quantity', async () => {
        // Mock 0 stock
        (db.stock_balances.toArray as any).mockReturnValue([
            { location_id: 'loc-1', item_id: 'item-1', quantity_on_hand: 0 }
        ]);

        const user = userEvent.setup();
        render(<TransferOutForm />);

        // Source A, Target B
        const selects = screen.getAllByRole('combobox');
        const sourceSelect = selects[0];
        await user.selectOptions(sourceSelect, 'loc-1');

        const targetSelect = selects[1];
        await user.selectOptions(targetSelect, 'loc-2');

        // Item X, Qty 10
        // checks selects[2]
        await user.selectOptions(selects[2], 'item-1');

        const qtyInput = screen.getByRole('spinbutton'); // quantity input in row
        await user.clear(qtyInput);
        await user.type(qtyInput, '10');

        // Submit
        const sendButton = screen.getByText(/Send Transfer/i);
        await user.click(sendButton);

        // Expect error
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Insufficient stock/));
        expect(db.stock_transfers.add).not.toHaveBeenCalled();
    });

    it('Successful Transfer: validates and submits valid transfer', async () => {
        // Mock sufficient stock (100)
        (db.stock_balances.toArray as any).mockReturnValue(mockBalancesSufficient);

        const user = userEvent.setup();
        render(<TransferOutForm />);

        // Source A -> Target B
        const selects = screen.getAllByRole('combobox');
        const sourceSelect = selects[0]; // Source
        const targetSelect = selects[1]; // Target

        await user.selectOptions(sourceSelect, 'loc-1');
        await user.selectOptions(targetSelect, 'loc-2');

        // Item X, Qty 10
        // Item is selects[2]
        await user.selectOptions(selects[2], 'item-1');

        const qtyInput = screen.getByRole('spinbutton');
        await user.clear(qtyInput);
        await user.type(qtyInput, '10');

        // Input Date
        // Label not associated, find by type
        // const { container } returned by render, but need to grab it.
        // Actually, render return destructuring.
        // Let's assume we can query by type using generic queries or just expect only one date input.
        // Since we can't easily access container unless we change render call, let's use:
        // document.querySelector inside the test since jsdom sets global document.
        const dateInput = document.querySelector('input[type="date"]');
        if (!dateInput) throw new Error("Date input not found");

        await fireEvent.change(dateInput, { target: { value: '2023-10-25' } });

        // Submit
        const sendButton = screen.getByText(/Send Transfer/i);
        await user.click(sendButton);

        await waitFor(() => {
            expect(db.transaction).toHaveBeenCalled();
        });

        // Check DB calls
        expect(db.stock_transfers.add).toHaveBeenCalledWith(expect.objectContaining({
            source_location_id: 'loc-1',
            target_location_id: 'loc-2',
            status: 'in_transit',
            transfer_date: '2023-10-25'
        }));

        expect(db.stock_transfer_lines.add).toHaveBeenCalledWith(expect.objectContaining({
            item_id: 'item-1',
            quantity_sent: 10
        }));

        expect(toast.success).toHaveBeenCalledWith("Transfer Sent!");
        expect(mockPush).toHaveBeenCalledWith('/app/inventory/transfers');
    });
});
