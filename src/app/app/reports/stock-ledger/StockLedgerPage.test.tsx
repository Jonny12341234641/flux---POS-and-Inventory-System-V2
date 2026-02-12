import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock dependencies ---
vi.mock('lucide-react', () => ({
    Loader2: (props: any) => <span data-testid="loader" {...props} />,
    Download: (props: any) => <span {...props} />,
    AlertTriangle: (props: any) => <span {...props} />,
    WifiOff: (props: any) => <span data-testid="wifi-off" {...props} />,
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
        stock_moves: {
            where: vi.fn(() => ({
                between: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
            })),
        },
        items: {
            get: vi.fn().mockResolvedValue({ name: 'Offline Item' }),
        },
    },
}));

import StockLedgerPage from './page';

describe('StockLedgerPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    });

    it('renders Generate Report button', () => {
        render(<StockLedgerPage />);
        expect(screen.getByText('Generate Report')).toBeInTheDocument();
    });

    it('renders date range inputs', () => {
        render(<StockLedgerPage />);
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
    });

    it('renders Export CSV button (disabled when no data)', () => {
        render(<StockLedgerPage />);
        const exportBtn = screen.getByText('Export CSV').closest('button');
        expect(exportBtn).toBeDisabled();
    });

    it('shows "No records found" initially', () => {
        render(<StockLedgerPage />);
        expect(screen.getByText('No records found.')).toBeInTheDocument();
    });

    it('displays Stock Movements card title', () => {
        render(<StockLedgerPage />);
        expect(screen.getByText('Stock Movements')).toBeInTheDocument();
    });

    it('fetches and displays data on Generate Report click', async () => {
        const mockData = [
            {
                move_id: 'm-1', created_at: '2026-01-15T10:00:00Z',
                item_name: 'Widget A', batch_number: 'B001',
                move_type: 'grn', quantity: 10, reference_id: 'ref-1',
                user_name: 'Admin'
            }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<StockLedgerPage />);

        // Wait for location to be set
        await waitFor(() => {
            expect(screen.getByText('Generate Report').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate Report'));

        await waitFor(() => {
            expect(screen.getByText('Widget A')).toBeInTheDocument();
            expect(screen.getByText('B001')).toBeInTheDocument();
            expect(screen.getByText('+10')).toBeInTheDocument();
        });
    });

    it('shows offline banner when RPC fails', async () => {
        mockRpc.mockRejectedValueOnce(new Error('Network error'));

        render(<StockLedgerPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate Report').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate Report'));

        await waitFor(() => {
            expect(screen.getByText(/Offline Mode/)).toBeInTheDocument();
        });
    });

    it('calls exportToCSV with data when export button clicked', async () => {
        const mockData = [
            { move_id: 'm-1', created_at: '2026-01-15', item_name: 'Widget', batch_number: null, move_type: 'sale', quantity: -2, reference_id: null, user_name: null }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<StockLedgerPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate Report').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate Report'));

        await waitFor(() => {
            expect(screen.getByText('Widget')).toBeInTheDocument();
        });

        await user.click(screen.getByText('Export CSV'));
        expect(mockExportToCSV).toHaveBeenCalledWith(mockData, expect.stringContaining('StockLedger'));
    });

    it('has a search/filter input', () => {
        render(<StockLedgerPage />);
        expect(screen.getByPlaceholderText('Filter by item or reference...')).toBeInTheDocument();
    });
});
