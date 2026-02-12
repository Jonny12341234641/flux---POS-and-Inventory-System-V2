import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock dependencies ---
vi.mock('lucide-react', () => ({
    Loader2: (props: any) => <span data-testid="loader" {...props} />,
    Download: (props: any) => <span {...props} />,
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
        sales_invoices: {
            where: vi.fn(() => ({
                between: vi.fn(() => ({
                    toArray: vi.fn().mockResolvedValue([]),
                })),
            })),
        },
        customers: {
            get: vi.fn().mockResolvedValue(null),
        },
        payments: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue(null),
                })),
            })),
        },
    },
}));

// Mock the Table component since sales page imports it
vi.mock('@/components/ui/table', () => ({
    Table: ({ children, ...props }: any) => <table {...props}>{children}</table>,
    TableBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
    TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
    TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
    TableHeader: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
    TableRow: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
}));

import SalesSummaryPage from './page';

describe('SalesSummaryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    });

    it('renders page with date range filters', () => {
        render(<SalesSummaryPage />);
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
    });

    it('renders Generate button', () => {
        render(<SalesSummaryPage />);
        // The actual button text is "Generate" (not "Generate Report")
        expect(screen.getByText('Generate')).toBeInTheDocument();
    });

    it('shows "No sales found" initially', () => {
        render(<SalesSummaryPage />);
        expect(screen.getByText('No sales found for period.')).toBeInTheDocument();
    });

    it('fetches and displays sales data', async () => {
        const mockData = [
            {
                invoice_number: 'INV-001', created_at: '2026-02-10T09:00:00Z',
                customer_name: 'Walk-in', total_amount: 150.00,
                status: 'posted', payment_method: 'cash', cashier_name: 'Admin'
            }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<SalesSummaryPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('INV-001')).toBeInTheDocument();
        });
    });

    it('shows offline banner on RPC failure', async () => {
        mockRpc.mockRejectedValueOnce(new Error('Connection lost'));

        render(<SalesSummaryPage />);

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
        render(<SalesSummaryPage />);
        const exportBtn = screen.getByText('Export CSV').closest('button');
        expect(exportBtn).toBeDisabled();
    });

    it('calls exportToCSV after fetching data', async () => {
        const mockData = [
            { invoice_number: 'INV-002', created_at: '2026-02-11', customer_name: null, total_amount: 80, status: 'posted', payment_method: 'card', cashier_name: 'User' }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<SalesSummaryPage />);

        await waitFor(() => expect(screen.getByText('Generate').closest('button')).not.toBeDisabled());

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));
        await waitFor(() => expect(screen.getByText('INV-002')).toBeInTheDocument());

        await user.click(screen.getByText('Export CSV'));
        expect(mockExportToCSV).toHaveBeenCalledWith(mockData, expect.stringContaining('SalesSummary'));
    });
});
