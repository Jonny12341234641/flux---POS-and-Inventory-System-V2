import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// --- Hoisted mock data ---
const { mockUseLiveQuery } = vi.hoisted(() => ({
    mockUseLiveQuery: vi.fn(),
}));

// --- Mock dependencies ---
vi.mock('dexie-react-hooks', () => ({
    useLiveQuery: mockUseLiveQuery,
}));

vi.mock('lucide-react', () => ({
    Users: (props: any) => <span {...props} />,
    Plus: (props: any) => <span {...props} />,
    Search: (props: any) => <span {...props} />,
    RefreshCw: (props: any) => <span {...props} />,
    AlertCircle: (props: any) => <span {...props} />,
    Save: (props: any) => <span {...props} />,
    X: (props: any) => <span {...props} />,
}));

const mockProcessQueue = vi.fn();
vi.mock('@/features/sync/useSyncQueue', () => ({
    useSyncQueue: () => ({ processQueue: mockProcessQueue }),
}));

vi.mock('@/lib/supabase/browser', () => ({
    createSupabaseBrowserClient: () => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'user-1', user_metadata: { location_id: 'loc-1' } } },
            }),
        },
        from: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { location_id: 'loc-1' } }),
        })),
    }),
}));

vi.mock('@/lib/db', () => ({
    db: {
        customers: {
            toArray: vi.fn().mockResolvedValue([]),
            add: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
        },
        user_profiles: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ location_id: 'loc-1' }),
                })),
            })),
        },
        sales_queue: {
            add: vi.fn().mockResolvedValue(undefined),
        },
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

import CustomersPage from './page';
import { db } from '@/lib/db';

describe('CustomersPage', () => {
    const mockCustomers = [
        { id: 'cust-1', name: 'John Doe', mobile: '0712345678', email: 'john@test.com', credit_limit: 5000, credit_days: 30, location_id: 'loc-1', created_at: '', updated_at: '', created_by: null },
        { id: 'cust-2', name: 'Jane Smith', mobile: null, email: null, credit_limit: null, credit_days: null, location_id: 'loc-1', created_at: '', updated_at: '', created_by: null },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseLiveQuery.mockReturnValue(mockCustomers);
    });

    it('renders page heading', () => {
        render(<CustomersPage />);
        expect(screen.getByText('Customers')).toBeInTheDocument();
    });

    it('displays customer list', () => {
        render(<CustomersPage />);
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('displays mobile and email', () => {
        render(<CustomersPage />);
        expect(screen.getByText('0712345678')).toBeInTheDocument();
        expect(screen.getByText('john@test.com')).toBeInTheDocument();
    });

    it('displays credit limit and credit days', () => {
        render(<CustomersPage />);
        expect(screen.getByText(/Limit: 5000/)).toBeInTheDocument();
        expect(screen.getByText(/30 days/)).toBeInTheDocument();
    });

    it('filters customers by search term', async () => {
        const user = userEvent.setup();
        render(<CustomersPage />);

        const searchInput = screen.getByPlaceholderText('Search customers...');
        await user.type(searchInput, 'John');

        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });

    it('opens new customer form when "New Customer" clicked', async () => {
        const user = userEvent.setup();
        render(<CustomersPage />);

        await user.click(screen.getByText('New Customer'));

        expect(screen.getByText('New Customer', { selector: 'h2' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. John Doe')).toBeInTheDocument();
    });

    it('saves new customer to local DB and outbox', async () => {
        const user = userEvent.setup();
        render(<CustomersPage />);

        await user.click(screen.getByText('New Customer'));

        // Fill name
        await user.type(screen.getByPlaceholderText('e.g. John Doe'), 'New Customer');

        // Click save
        await user.click(screen.getByText('Save Customer'));

        await waitFor(() => {
            expect(db.customers.add).toHaveBeenCalledWith(expect.objectContaining({
                name: 'New Customer',
                location_id: 'loc-1',
            }));
        });

        expect(db.sales_queue.add).toHaveBeenCalledWith(expect.objectContaining({
            entity: 'customers',
            action: 'insert',
        }));
    });

    it('shows validation error when name is empty', async () => {
        const user = userEvent.setup();
        render(<CustomersPage />);

        await user.click(screen.getByText('New Customer'));
        await user.click(screen.getByText('Save Customer'));

        await waitFor(() => {
            expect(screen.getByText('Name is required.')).toBeInTheDocument();
        });

        expect(db.customers.add).not.toHaveBeenCalled();
    });

    it('has credit limit and credit days input fields', async () => {
        const user = userEvent.setup();
        render(<CustomersPage />);

        await user.click(screen.getByText('New Customer'));

        expect(screen.getByPlaceholderText('e.g. 5000')).toBeInTheDocument(); // credit limit
        expect(screen.getByPlaceholderText('e.g. 30')).toBeInTheDocument(); // credit days
    });

    it('shows "No customers found" when list is empty', () => {
        mockUseLiveQuery.mockReturnValue([]);
        render(<CustomersPage />);

        expect(screen.getByText('No customers found.')).toBeInTheDocument();
    });
});
