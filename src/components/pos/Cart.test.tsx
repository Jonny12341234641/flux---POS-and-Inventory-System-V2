import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Cart, CartItem } from './Cart';
import { Item, StockLot } from '@/types/phase0';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    Minus: (props: any) => <span data-testid="icon-minus" {...props} />,
    Plus: (props: any) => <span data-testid="icon-plus" {...props} />,
    Trash2: (props: any) => <span data-testid="icon-trash" {...props} />,
    Tag: (props: any) => <span data-testid="icon-tag" {...props} />,
}));

function makeItem(overrides: Partial<Item> = {}): Item {
    return {
        id: 'item-1',
        location_id: 'loc-1',
        category_id: null,
        unit_id: null,
        name: 'Test Widget',
        barcode: '123',
        sale_price: 25,
        cost: 10,
        is_batch_tracked: false,
        expiry_warning_days: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: null,
        ...overrides,
    };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
    return {
        item: makeItem(),
        qty: 1,
        maxQty: 10,
        unitPrice: 25,
        discountAmount: 0,
        ...overrides,
    };
}

describe('Cart Component', () => {
    const mockUpdateQty = vi.fn();
    const mockRemove = vi.fn();
    const mockPayment = vi.fn();

    const defaultProps = {
        items: [] as CartItem[],
        onUpdateQty: mockUpdateQty,
        onRemove: mockRemove,
        onPayment: mockPayment,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Empty State ───────────────────────────────────────────

    it('shows empty cart message when no items', () => {
        render(<Cart {...defaultProps} />);
        expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    });

    it('disables Charge button when cart is empty', () => {
        render(<Cart {...defaultProps} />);
        // The Charge button shows "Charge $0.00" when empty
        const chargeBtn = screen.getByRole('button', { name: /charge/i });
        expect(chargeBtn).toBeDisabled();
    });

    // ── With Items ────────────────────────────────────────────

    it('renders item name and unit price', () => {
        const items = [makeCartItem({ item: makeItem({ name: 'Alpha Product' }), unitPrice: 15 })];
        render(<Cart {...defaultProps} items={items} />);

        expect(screen.getByText('Alpha Product')).toBeInTheDocument();
        // $15.00 appears in both unit price display and line subtotal (1 × $15 = $15.00)
        const priceElements = screen.getAllByText('$15.00');
        expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders batch number when lot is present', () => {
        const lot: StockLot = {
            id: 'lot-1', location_id: 'loc-1', item_id: 'item-1',
            batch_number: 'BATCH-X99', expiry_date: null,
            created_at: '', updated_at: '', created_by: null,
        };
        const items = [makeCartItem({ lot })];
        render(<Cart {...defaultProps} items={items} />);

        expect(screen.getByText(/BATCH-X99/)).toBeInTheDocument();
    });

    it('displays correct item count', () => {
        const items = [makeCartItem(), makeCartItem({ item: makeItem({ id: 'item-2', name: 'B' }) })];
        render(<Cart {...defaultProps} items={items} />);

        expect(screen.getByText('2 Items')).toBeInTheDocument();
    });

    // ── Totals ────────────────────────────────────────────────

    it('calculates subtotal correctly', () => {
        const items = [
            makeCartItem({ qty: 2, unitPrice: 100, discountAmount: 10 }),
            makeCartItem({ item: makeItem({ id: 'item-2' }), qty: 1, unitPrice: 50, discountAmount: 0 }),
        ];
        render(<Cart {...defaultProps} items={items} />);

        // Subtotal: (2*100) + (1*50) = 250
        expect(screen.getByText('$250.00')).toBeInTheDocument();
    });

    // ── Interactions ──────────────────────────────────────────

    it('calls onRemove when trash button clicked', () => {
        const items = [makeCartItem()];
        render(<Cart {...defaultProps} items={items} />);

        // Find trash button by its icon
        const trashIcon = screen.getByTestId('icon-trash');
        const trashButton = trashIcon.closest('button')!;
        fireEvent.click(trashButton);

        expect(mockRemove).toHaveBeenCalledWith(0);
    });

    it('calls onPayment when charge button clicked', () => {
        const items = [makeCartItem()];
        render(<Cart {...defaultProps} items={items} />);

        fireEvent.click(screen.getByRole('button', { name: /charge/i }));
        expect(mockPayment).toHaveBeenCalledTimes(1);
    });

    it('disables minus button when qty is 1', () => {
        const items = [makeCartItem({ qty: 1 })];
        render(<Cart {...defaultProps} items={items} />);

        const minusIcon = screen.getByTestId('icon-minus');
        const minusButton = minusIcon.closest('button')!;
        expect(minusButton).toBeDisabled();
    });

    it('disables plus button when qty equals maxQty', () => {
        const items = [makeCartItem({ qty: 10, maxQty: 10 })];
        render(<Cart {...defaultProps} items={items} />);

        const plusIcon = screen.getByTestId('icon-plus');
        const plusButton = plusIcon.closest('button')!;
        expect(plusButton).toBeDisabled();
    });
});
