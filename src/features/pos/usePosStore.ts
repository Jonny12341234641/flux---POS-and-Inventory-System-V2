import { create } from 'zustand';
import { Item } from '@/types/phase0';

export interface CartItem extends Item {
    qty: number;
    subtotal: number;
}

interface PosState {
    cart: CartItem[];
    addToCart: (item: Item) => void;
    removeFromCart: (itemId: string) => void;
    updateQty: (itemId: string, qty: number) => void;
    clearCart: () => void;
    getTotalAmount: () => number;
    getItemCount: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
    cart: [],

    addToCart: (item) => {
        const { cart } = get();
        const existing = cart.find((i) => i.id === item.id);

        if (existing) {
            // If exists, increment qty
            const newQty = existing.qty + 1;
            set({
                cart: cart.map((i) =>
                    i.id === item.id
                        ? { ...i, qty: newQty, subtotal: newQty * i.sale_price }
                        : i
                ),
            });
        } else {
            // Add new
            set({
                cart: [
                    ...cart,
                    { ...item, qty: 1, subtotal: item.sale_price * 1 }, // default qty 1
                ],
            });
        }
    },

    removeFromCart: (itemId) => {
        set((state) => ({
            cart: state.cart.filter((i) => i.id !== itemId),
        }));
    },

    updateQty: (itemId, qty) => {
        if (qty <= 0) {
            // Optionally remove if qty 0, or just do nothing/set to 1? 
            // Let's remove if 0 for specific behavior, or just update. 
            // Requirement says "Remove from cart" is a separate action, but usually usage allows 0 to remove.
            // For safety let's just update, user can remove explicitly or we handle < 1 in UI.
            // Actually, let's enforce min 1 here or allow 0 to remove. Let's allow update.
            if (qty === 0) {
                set((state) => ({
                    cart: state.cart.filter((i) => i.id !== itemId),
                }));
                return;
            }
        }

        set((state) => ({
            cart: state.cart.map((i) =>
                i.id === itemId
                    ? { ...i, qty, subtotal: qty * i.sale_price }
                    : i
            ),
        }));
    },

    clearCart: () => set({ cart: [] }),

    getTotalAmount: () => {
        const { cart } = get();
        return cart.reduce((sum, item) => sum + item.subtotal, 0);
    },

    getItemCount: () => {
        const { cart } = get();
        return cart.reduce((sum, item) => sum + item.qty, 0);
    },
}));
