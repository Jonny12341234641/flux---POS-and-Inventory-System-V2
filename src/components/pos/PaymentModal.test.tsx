import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentModal } from './PaymentModal';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    CreditCard: (props: any) => <span data-testid="icon-card" {...props} />,
    Wallet: (props: any) => <span data-testid="icon-wallet" {...props} />,
    Banknote: (props: any) => <span data-testid="icon-banknote" {...props} />,
    Smartphone: (props: any) => <span data-testid="icon-smartphone" {...props} />,
}));

describe('PaymentModal', () => {
    const mockOnClose = vi.fn();
    const mockOnComplete = vi.fn();

    const defaultProps = {
        isOpen: true,
        onClose: mockOnClose,
        totalAmount: 100,
        onComplete: mockOnComplete,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Rendering ─────────────────────────────────────────────

    it('shows Total Due label and amount', () => {
        render(<PaymentModal {...defaultProps} />);
        expect(screen.getByText('Total Due')).toBeInTheDocument();
        // $100.00 appears in both Total Due and Remaining columns
        const amountElements = screen.getAllByText('$100.00');
        expect(amountElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders payment method tabs (Cash, Card, More)', () => {
        render(<PaymentModal {...defaultProps} />);
        expect(screen.getByText('Cash')).toBeInTheDocument();
        expect(screen.getByText('Card')).toBeInTheDocument();
        expect(screen.getByText('More')).toBeInTheDocument();
    });

    it('shows Complete Sale button as disabled initially', () => {
        render(<PaymentModal {...defaultProps} />);
        const completeBtn = screen.getByRole('button', { name: /complete sale/i });
        expect(completeBtn).toBeDisabled();
    });

    it('shows Cancel button', () => {
        render(<PaymentModal {...defaultProps} />);
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    // ── Cash Payment ──────────────────────────────────────────

    it('adds cash payment and enables Complete Sale', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        // Click "Add Payment" — the amount field is pre-filled with totalAmount
        await user.click(screen.getByRole('button', { name: /add payment/i }));

        await waitFor(() => {
            const completeBtn = screen.getByRole('button', { name: /complete sale/i });
            expect(completeBtn).not.toBeDisabled();
        });
    });

    it('calls onComplete with correct payment when completed', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        // Add full cash payment
        await user.click(screen.getByRole('button', { name: /add payment/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /complete sale/i })).not.toBeDisabled();
        });

        await user.click(screen.getByRole('button', { name: /complete sale/i }));

        expect(mockOnComplete).toHaveBeenCalledWith([
            expect.objectContaining({
                method: 'cash',
                amount: 100,
            })
        ]);
    });

    it('calls onClose when Cancel is clicked', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(mockOnClose).toHaveBeenCalled();
    });

    // ── Partial / Split Payment ───────────────────────────────

    it('shows remaining amount after partial payment', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        // Change amount to 60
        const amountInput = screen.getByRole('spinbutton');
        await user.clear(amountInput);
        await user.type(amountInput, '60');

        await user.click(screen.getByRole('button', { name: /add payment/i }));

        await waitFor(() => {
            // Remaining should be $40.00
            expect(screen.getByText('$40.00')).toBeInTheDocument();
        });

        // Complete Sale should still be disabled
        expect(screen.getByRole('button', { name: /complete sale/i })).toBeDisabled();
    });

    it('prevents adding payment with zero or negative amount', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        // Set amount to 0
        const amountInput = screen.getByRole('spinbutton');
        await user.clear(amountInput);
        await user.type(amountInput, '0');

        // Add Payment button should be disabled
        const addBtn = screen.getByRole('button', { name: /add payment/i });
        expect(addBtn).toBeDisabled();
    });

    // ── Reference Note ────────────────────────────────────────

    it('shows reference note field for card payments', async () => {
        const user = userEvent.setup();
        render(<PaymentModal {...defaultProps} />);

        // Switch to Card tab
        await user.click(screen.getByText('Card'));

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/auth code/i)).toBeInTheDocument();
        });
    });

    it('does not show reference note field for cash payments', () => {
        render(<PaymentModal {...defaultProps} />);

        // Cash is default - no reference note
        expect(screen.queryByPlaceholderText(/auth code/i)).not.toBeInTheDocument();
    });
});
