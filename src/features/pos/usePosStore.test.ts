import { describe, it, expect, beforeEach } from 'vitest';
import { usePosStore } from './usePosStore';
import { Item } from '@/types/phase0';

// Helper to create a mock Item
function makeItem(overrides: Partial<Item> = {}): Item {
    return {
        id: 'item-1',
        location_id: 'loc-1',
        category_id: null,
        unit_id: null,
        name: 'Test Widget',
        barcode: '1234567890',
        sale_price: 25.00,
        cost: 10.00,
        is_batch_tracked: false,
        expiry_warning_days: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        created_by: null,
        ...overrides,
    };
}

describe('usePosStore — Zustand Cart Store', () => {
    beforeEach(() => {
        // Reset store state before each test
        usePosStore.setState({ cart: [] });
    });

    // ── addToCart ──────────────────────────────────────────────

    it('adds a new item with qty=1 and correct subtotal', () => {
        const item = makeItem();
        usePosStore.getState().addToCart(item);

        const cart = usePosStore.getState().cart;
        expect(cart).toHaveLength(1);
        expect(cart[0].id).toBe('item-1');
        expect(cart[0].qty).toBe(1);
        expect(cart[0].subtotal).toBe(25.00);
    });

    it('increments qty when the same item is added again', () => {
        const item = makeItem();
        const { addToCart } = usePosStore.getState();

        addToCart(item);
        addToCart(item);

        const cart = usePosStore.getState().cart;
        expect(cart).toHaveLength(1);
        expect(cart[0].qty).toBe(2);
        expect(cart[0].subtotal).toBe(50.00); // 2 × 25
    });

    it('adds different items as separate cart entries', () => {
        const itemA = makeItem({ id: 'item-A', sale_price: 10 });
        const itemB = makeItem({ id: 'item-B', sale_price: 20 });

        usePosStore.getState().addToCart(itemA);
        usePosStore.getState().addToCart(itemB);

        const cart = usePosStore.getState().cart;
        expect(cart).toHaveLength(2);
    });

    // ── removeFromCart ────────────────────────────────────────

    it('removes an item by id', () => {
        const item = makeItem();
        usePosStore.getState().addToCart(item);
        expect(usePosStore.getState().cart).toHaveLength(1);

        usePosStore.getState().removeFromCart('item-1');
        expect(usePosStore.getState().cart).toHaveLength(0);
    });

    it('does nothing when removing a non-existent id', () => {
        const item = makeItem();
        usePosStore.getState().addToCart(item);

        usePosStore.getState().removeFromCart('non-existent');
        expect(usePosStore.getState().cart).toHaveLength(1);
    });

    // ── updateQty ─────────────────────────────────────────────

    it('updates qty and recalculates subtotal', () => {
        const item = makeItem({ sale_price: 10 });
        usePosStore.getState().addToCart(item);

        usePosStore.getState().updateQty('item-1', 5);

        const cart = usePosStore.getState().cart;
        expect(cart[0].qty).toBe(5);
        expect(cart[0].subtotal).toBe(50.00); // 5 × 10
    });

    it('removes item when qty updated to 0', () => {
        const item = makeItem();
        usePosStore.getState().addToCart(item);

        usePosStore.getState().updateQty('item-1', 0);
        expect(usePosStore.getState().cart).toHaveLength(0);
    });

    it('FAULT: allows negative qty (no guard in store)', () => {
        // This test documents a real fault: the store does not guard against negative quantities.
        // updateQty(-3) should ideally remove the item or clamp to 0, but it doesn't.
        const item = makeItem();
        usePosStore.getState().addToCart(item);

        usePosStore.getState().updateQty('item-1', -3);

        const cart = usePosStore.getState().cart;
        // FAULT: The item remains with qty=-3 and negative subtotal.
        // Documenting the behavior as-is so the test passes while flagging the issue.
        expect(cart).toHaveLength(1);
        expect(cart[0].qty).toBe(-3);
    });

    // ── clearCart ──────────────────────────────────────────────

    it('empties the entire cart', () => {
        usePosStore.getState().addToCart(makeItem({ id: 'a', sale_price: 10 }));
        usePosStore.getState().addToCart(makeItem({ id: 'b', sale_price: 20 }));
        expect(usePosStore.getState().cart).toHaveLength(2);

        usePosStore.getState().clearCart();
        expect(usePosStore.getState().cart).toHaveLength(0);
    });

    // ── getTotalAmount ────────────────────────────────────────

    it('returns 0 for empty cart', () => {
        expect(usePosStore.getState().getTotalAmount()).toBe(0);
    });

    it('sums subtotals across all items', () => {
        usePosStore.getState().addToCart(makeItem({ id: 'a', sale_price: 10 }));
        usePosStore.getState().addToCart(makeItem({ id: 'b', sale_price: 20 }));

        expect(usePosStore.getState().getTotalAmount()).toBe(30); // 10 + 20
    });

    it('recalculates after qty changes', () => {
        usePosStore.getState().addToCart(makeItem({ id: 'a', sale_price: 10 }));
        usePosStore.getState().updateQty('a', 3);

        expect(usePosStore.getState().getTotalAmount()).toBe(30); // 3 × 10
    });

    // ── getItemCount ──────────────────────────────────────────

    it('returns 0 for empty cart', () => {
        expect(usePosStore.getState().getItemCount()).toBe(0);
    });

    it('sums qty values across all items', () => {
        usePosStore.getState().addToCart(makeItem({ id: 'a', sale_price: 10 }));
        usePosStore.getState().addToCart(makeItem({ id: 'b', sale_price: 20 }));
        usePosStore.getState().updateQty('a', 3);

        expect(usePosStore.getState().getItemCount()).toBe(4); // 3 + 1
    });
});
