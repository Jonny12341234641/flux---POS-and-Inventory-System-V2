import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock dependencies ---
vi.mock('lucide-react', () => ({
    Loader2: (props: any) => <span data-testid="loader" {...props} />,
    Download: (props: any) => <span {...props} />,
    WifiOff: (props: any) => <span data-testid="wifi-off" {...props} />,
    AlertTriangle: (props: any) => <span {...props} />,
}));

const mockExportToCSV = vi.fn();
vi.mock('@/lib/exportUtils', () => ({
    exportToCSV: (...args: any[]) => mockExportToCSV(...args),
}));

const mockRpc = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({
        auth: { getUser: mockGetUser },
        rpc: mockRpc,
    }),
}));

vi.mock('@/lib/db', () => ({
    db: {
        user_profiles: {
            get: vi.fn().mockResolvedValue({ location_id: 'loc-1' }),
        },
        stock_lots: {
            where: vi.fn(() => ({
                between: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
            })),
        },
        stock_balances: {
            where: vi.fn(() => ({
                first: vi.fn().mockResolvedValue(null),
            })),
        },
        items: {
            get: vi.fn().mockResolvedValue({ name: 'Cached Item' }),
        },
    },
}));

import BatchExpiryPage from './page';

describe('BatchExpiryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    });

    it('renders page with days threshold input', () => {
        render(<BatchExpiryPage />);
        expect(screen.getByText('Days Threshold')).toBeInTheDocument();
    });

    it('renders Generate button', () => {
        render(<BatchExpiryPage />);
        expect(screen.getByText('Generate')).toBeInTheDocument();
    });

    it('renders Batch Expiry Report card title', () => {
        render(<BatchExpiryPage />);
        expect(screen.getByText('Batch Expiry Report')).toBeInTheDocument();
    });

    it('shows "No expiring batches found" initially', () => {
        render(<BatchExpiryPage />);
        expect(screen.getByText('No expiring batches found.')).toBeInTheDocument();
    });

    it('fetches and displays batch expiry data', async () => {
        const mockData = [
            { item_name: 'Milk', batch_number: 'B-100', expiry_date: '2026-03-01', quantity_on_hand: 50, days_until_expiry: 17 },
            { item_name: 'Cheese', batch_number: 'B-200', expiry_date: '2025-12-01', quantity_on_hand: 10, days_until_expiry: -73 },
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<BatchExpiryPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('Milk')).toBeInTheDocument();
            expect(screen.getByText('Cheese')).toBeInTheDocument();
        });

        // Expired items show "Expired" badge
        expect(screen.getByText('Expired')).toBeInTheDocument();
        // Items near expiry show "Expiring Soon"
        expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
    });

    it('shows offline banner on RPC failure', async () => {
        mockRpc.mockRejectedValueOnce(new Error('Network error'));

        render(<BatchExpiryPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText(/Offline Mode/)).toBeInTheDocument();
        });
    });

    it('Export CSV button disabled when no data', () => {
        render(<BatchExpiryPage />);
        const exportBtn = screen.getByText('Export CSV').closest('button');
        expect(exportBtn).toBeDisabled();
    });

    it('calls exportToCSV with correct filename', async () => {
        const mockData = [
            { item_name: 'X', batch_number: 'B1', expiry_date: '2026-06-01', quantity_on_hand: 5, days_until_expiry: 100 },
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<BatchExpiryPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument());

        await user.click(screen.getByText('Export CSV'));
        expect(mockExportToCSV).toHaveBeenCalledWith(mockData, expect.stringContaining('BatchExpiry'));
    });

    it('has a search input for items', () => {
        render(<BatchExpiryPage />);
        expect(screen.getByPlaceholderText('Search item or batch...')).toBeInTheDocument();
    });
});
