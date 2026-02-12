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
    FileText: (props: any) => <span {...props} />,
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
        suppliers: {
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

import SuppliersPage from './page';
import { db } from '@/lib/db';

describe('SuppliersPage', () => {
    const mockSuppliers = [
        { id: 'sup-1', name: 'Acme Corp', supplier_no: 'SUP-001', contact_info: 'acme@test.com', credit_days: 30, location_id: 'loc-1', created_at: '', updated_at: '', created_by: null },
        { id: 'sup-2', name: 'Beta Ltd', supplier_no: 'SUP-002', contact_info: null, credit_days: null, location_id: 'loc-1', created_at: '', updated_at: '', created_by: null },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseLiveQuery.mockReturnValue(mockSuppliers);
    });

    it('renders page heading', () => {
        render(<SuppliersPage />);
        expect(screen.getByText('Suppliers')).toBeInTheDocument();
    });

    it('displays supplier list from useLiveQuery', () => {
        render(<SuppliersPage />);
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
        expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
    });

    it('displays supplier number and contact info', () => {
        render(<SuppliersPage />);
        expect(screen.getByText('SUP-001')).toBeInTheDocument();
        expect(screen.getByText('acme@test.com')).toBeInTheDocument();
    });

    it('filters suppliers by search term', async () => {
        const user = userEvent.setup();
        render(<SuppliersPage />);

        const searchInput = screen.getByPlaceholderText('Search suppliers...');
        await user.type(searchInput, 'Acme');

        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
        expect(screen.queryByText('Beta Ltd')).not.toBeInTheDocument();
    });

    it('opens new supplier form when "New Supplier" clicked', async () => {
        const user = userEvent.setup();
        render(<SuppliersPage />);

        await user.click(screen.getByText('New Supplier'));

        expect(screen.getByText('New Supplier', { selector: 'h2' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. Acme Corp')).toBeInTheDocument();
    });

    it('saves new supplier to local DB and outbox', async () => {
        const user = userEvent.setup();
        render(<SuppliersPage />);

        await user.click(screen.getByText('New Supplier'));

        // Fill name
        await user.type(screen.getByPlaceholderText('e.g. Acme Corp'), 'New Supplier Inc');

        // Click save
        await user.click(screen.getByText('Save Supplier'));

        await waitFor(() => {
            expect(db.suppliers.add).toHaveBeenCalledWith(expect.objectContaining({
                name: 'New Supplier Inc',
                location_id: 'loc-1',
            }));
        });

        expect(db.sales_queue.add).toHaveBeenCalledWith(expect.objectContaining({
            entity: 'suppliers',
            action: 'insert',
        }));
    });

    it('shows validation error when name is empty', async () => {
        const user = userEvent.setup();
        render(<SuppliersPage />);

        await user.click(screen.getByText('New Supplier'));
        await user.click(screen.getByText('Save Supplier'));

        await waitFor(() => {
            expect(screen.getByText('Name is required.')).toBeInTheDocument();
        });

        expect(db.suppliers.add).not.toHaveBeenCalled();
    });

    it('opens edit form with existing data', async () => {
        const user = userEvent.setup();
        render(<SuppliersPage />);

        // Click first Edit button
        const editButtons = screen.getAllByText('Edit');
        await user.click(editButtons[0]);

        await waitFor(() => {
            expect(screen.getByText('Edit Supplier')).toBeInTheDocument();
        });

        // Name field should be pre-filled
        const nameInput = screen.getByPlaceholderText('e.g. Acme Corp');
        expect(nameInput).toHaveValue('Acme Corp');
    });

    it('shows "No suppliers found" when list is empty', () => {
        mockUseLiveQuery.mockReturnValue([]);
        render(<SuppliersPage />);

        expect(screen.getByText('No suppliers found.')).toBeInTheDocument();
    });
});
