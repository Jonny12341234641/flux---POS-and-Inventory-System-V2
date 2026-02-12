import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// --- Mock dependencies ---
vi.mock('lucide-react', () => ({
    Search: (props: any) => <span {...props} />,
    Scan: (props: any) => <span {...props} />,
    Package: (props: any) => <span {...props} />,
    Minus: (props: any) => <span {...props} />,
    Plus: (props: any) => <span {...props} />,
    Trash2: (props: any) => <span {...props} />,
    Tag: (props: any) => <span {...props} />,
    CreditCard: (props: any) => <span {...props} />,
    Wallet: (props: any) => <span {...props} />,
    Banknote: (props: any) => <span {...props} />,
    Smartphone: (props: any) => <span {...props} />,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock dexie-react-hooks
const { mockUseLiveQuery } = vi.hoisted(() => ({
    mockUseLiveQuery: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: mockUseLiveQuery,
}));

// Mock DB - with proper chained methods including .filter()
vi.mock('@/lib/db', () => ({
    db: {
        locations: {
            limit: vi.fn(() => ({
                first: vi.fn().mockResolvedValue({ id: 'loc-1', name: 'Main Store' }),
            })),
        },
        user_profiles: {
            limit: vi.fn(() => ({
                first: vi.fn().mockResolvedValue({ user_id: 'user-1', location_id: 'loc-1' }),
            })),
        },
        items: {
            toArray: vi.fn().mockResolvedValue([]),
        },
        stock_balances: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ quantity_on_hand: 50 }),
                })),
                toArray: vi.fn().mockResolvedValue([]),
                // ProductSearch calls .where({...}).filter(fn)
                filter: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ quantity_on_hand: 50 }),
                })),
            })),
        },
        stock_lots: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
            })),
        },
        sales_queue: {
            add: vi.fn().mockResolvedValue('q-id'),
        },
        sales_invoices: { add: vi.fn() },
        sales_invoice_lines: { add: vi.fn() },
        payments: { add: vi.fn() },
    },
}));

// Setup crypto
beforeAll(() => {
    if (!global.crypto || !global.crypto.randomUUID) {
        Object.defineProperty(global, 'crypto', {
            value: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2) },
            configurable: true,
        });
    }
});

import PosPage from './page';
import { db } from '@/lib/db';
import { toast } from 'sonner';

describe('PosPage — Full POS Sale Flow', () => {
    const mockItems = [
        {
            id: 'item-1', name: 'Widget', barcode: '111', sale_price: 25, cost: 10,
            location_id: 'loc-1', category_id: null, unit_id: null,
            is_batch_tracked: false, expiry_warning_days: null,
            created_at: '', updated_at: '', created_by: null
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        // ProductSearch uses useLiveQuery for items
        mockUseLiveQuery.mockReturnValue(mockItems);
    });

    it('renders POS page with ProductSearch and Cart', () => {
        render(<PosPage />);
        // Cart should show empty state
        expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    });

    it('renders the Charge button (disabled when cart empty)', () => {
        render(<PosPage />);
        const chargeBtn = screen.getByRole('button', { name: /charge/i });
        expect(chargeBtn).toBeDisabled();
    });

    it('renders search input from ProductSearch', () => {
        render(<PosPage />);
        expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    it('adds item to cart when search result is clicked', async () => {
        render(<PosPage />);

        // Items should be rendered in the search results (from useLiveQuery)
        await waitFor(() => {
            expect(screen.getByText('Widget')).toBeInTheDocument();
        });

        const user = userEvent.setup();
        // Click on the item in search results
        await user.click(screen.getByText('Widget'));

        // After clicking, stock_balances.where().filter().first() will be called
        // Cart should now show the item
        await waitFor(() => {
            // should no longer show empty cart
            expect(screen.queryByText('Cart is empty')).not.toBeInTheDocument();
        });
    });

    it('adds sale to outbox queue when payment is completed', async () => {
        render(<PosPage />);

        await waitFor(() => {
            expect(screen.getByText('Widget')).toBeInTheDocument();
        });

        const user = userEvent.setup();

        // Add item to cart
        await user.click(screen.getByText('Widget'));

        await waitFor(() => {
            expect(screen.queryByText('Cart is empty')).not.toBeInTheDocument();
        });

        // Open payment modal by clicking Charge button
        const chargeBtn = screen.getByRole('button', { name: /charge/i });
        await user.click(chargeBtn);

        // Payment modal should appear
        await waitFor(() => {
            expect(screen.getByText('Payment')).toBeInTheDocument();
        });

        // Add full payment (amount is pre-filled) and click Add Payment
        const addPaymentBtn = screen.getByRole('button', { name: /add payment/i });
        await user.click(addPaymentBtn);

        // Complete Sale should now be enabled
        await waitFor(() => {
            const completeBtn = screen.getByRole('button', { name: /complete sale/i });
            expect(completeBtn).not.toBeDisabled();
        });

        await user.click(screen.getByRole('button', { name: /complete sale/i }));

        // Verify outbox was called
        await waitFor(() => {
            expect(db.sales_queue.add).toHaveBeenCalledWith(expect.objectContaining({
                entity: 'sales_transaction',
                action: 'insert',
                status: 'pending',
            }));
        });

        // Cart should be cleared
        await waitFor(() => {
            expect(screen.getByText('Cart is empty')).toBeInTheDocument();
        });

        // Success toast
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sale Completed'));
    });
});
