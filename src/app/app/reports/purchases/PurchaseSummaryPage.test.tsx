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
        grns: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    and: vi.fn(() => ({
                        toArray: vi.fn().mockResolvedValue([]),
                    })),
                })),
            })),
        },
        suppliers: {
            get: vi.fn().mockResolvedValue({ name: 'Test Supplier' }),
        },
        grn_lines: {
            where: vi.fn(() => ({
                equals: vi.fn(() => ({
                    count: vi.fn().mockResolvedValue(0),
                })),
            })),
        },
        purchase_orders: {
            get: vi.fn().mockResolvedValue(null),
        },
    },
}));

// Mock the Table component since purchases page imports it
vi.mock('@/components/ui/table', () => ({
    Table: ({ children, ...props }: any) => <table {...props}>{children}</table>,
    TableBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
    TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
    TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
    TableHeader: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
    TableRow: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
}));

import PurchaseSummaryPage from './page';

describe('PurchaseSummaryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    });

    it('renders page with date range filters', () => {
        render(<PurchaseSummaryPage />);
        expect(screen.getByText('Start Date')).toBeInTheDocument();
        expect(screen.getByText('End Date')).toBeInTheDocument();
    });

    it('renders Generate button', () => {
        render(<PurchaseSummaryPage />);
        // The actual button text is "Generate" (not "Generate Report")
        expect(screen.getByText('Generate')).toBeInTheDocument();
    });

    it('shows empty state initially', () => {
        render(<PurchaseSummaryPage />);
        expect(screen.getByText('No records found.')).toBeInTheDocument();
    });

    it('fetches and displays purchase data', async () => {
        const mockData = [
            {
                grn_number: 'GRN-001', received_date: '2026-02-10',
                supplier_name: 'Acme Corp', status: 'posted',
                po_reference: 'PO-100', item_count: 5
            }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<PurchaseSummaryPage />);

        await waitFor(() => {
            expect(screen.getByText('Generate').closest('button')).not.toBeDisabled();
        });

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText('GRN-001')).toBeInTheDocument();
            expect(screen.getByText('Acme Corp')).toBeInTheDocument();
        });
    });

    it('shows offline banner on RPC error', async () => {
        mockRpc.mockRejectedValueOnce(new Error('Network error'));

        render(<PurchaseSummaryPage />);

        await waitFor(() => expect(screen.getByText('Generate').closest('button')).not.toBeDisabled());

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));

        await waitFor(() => {
            expect(screen.getByText(/Offline Mode/)).toBeInTheDocument();
        });
    });

    it('Export CSV disabled when no data', () => {
        render(<PurchaseSummaryPage />);
        const exportBtn = screen.getByText('Export CSV').closest('button');
        expect(exportBtn).toBeDisabled();
    });

    it('calls exportToCSV when export button clicked', async () => {
        const mockData = [
            { grn_number: 'GRN-002', received_date: '2026-02-11', supplier_name: 'Beta', status: 'draft', po_reference: null, item_count: 2 }
        ];
        mockRpc.mockResolvedValueOnce({ data: mockData, error: null });

        render(<PurchaseSummaryPage />);

        await waitFor(() => expect(screen.getByText('Generate').closest('button')).not.toBeDisabled());

        const user = userEvent.setup();
        await user.click(screen.getByText('Generate'));
        await waitFor(() => expect(screen.getByText('GRN-002')).toBeInTheDocument());

        await user.click(screen.getByText('Export CSV'));
        expect(mockExportToCSV).toHaveBeenCalledWith(mockData, expect.stringContaining('PurchaseSummary'));
    });
});
