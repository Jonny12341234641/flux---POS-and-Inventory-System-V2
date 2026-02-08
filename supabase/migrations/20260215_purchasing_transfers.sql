-- Migration: Purchasing & Transfers (Phase 1 Sprint 3)
-- Date: 2026-02-15
-- Description: Adds tables and logic for Purchase Orders, Stock Transfers, and Purchase Returns.

-- ==========================================
-- 1. Tables
-- ==========================================

-- 1.1 Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'received', 'closed')) DEFAULT 'draft',
    reference_number TEXT,
    expected_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity_ordered NUMERIC NOT NULL CHECK (quantity_ordered > 0),
    unit_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_location_id UUID NOT NULL REFERENCES locations(id),
    target_location_id UUID NOT NULL REFERENCES locations(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')) DEFAULT 'pending',
    transfer_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    CHECK (source_location_id <> target_location_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id), -- Optional, NULL means generic stock (if allowed) or FIFO logic applied later
    quantity_sent NUMERIC NOT NULL CHECK (quantity_sent > 0),
    quantity_received NUMERIC CHECK (quantity_received >= 0), -- Nullable initially
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Purchase Returns
CREATE TABLE IF NOT EXISTS purchase_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    original_grn_id UUID REFERENCES grns(id), -- Optional link
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted')) DEFAULT 'draft',
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id), -- Specific lot being returned
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. RLS Policies
-- ==========================================

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_lines ENABLE ROW LEVEL SECURITY;

-- Simple RLS: View if in same location. 
-- Note: Reusing the pattern of "location_id" matching user's location via metadata or app logic.
-- For simplicity in this sprint, we'll allow authenticated users to see records linked to their assigned locations via the `locations` table or just 'public' within the tenant if not strictly multi-tenant at row level yet. 
-- Adopting a permissive "authenticated users can access" for now to avoid complexity, but ideally would filter by location_id.

CREATE POLICY "Enable read access for authenticated users" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON purchase_orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON purchase_orders FOR DELETE TO authenticated USING (status = 'draft');

CREATE POLICY "Enable read access for authenticated users" ON purchase_order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON purchase_order_lines FOR ALL TO authenticated USING (true);

-- Transfers: Needs visibility for both Source and Target
CREATE POLICY "Enable read for transfers" ON stock_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for transfers" ON stock_transfers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for transfers" ON stock_transfers FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable read for transfer lines" ON stock_transfer_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for transfer lines" ON stock_transfer_lines FOR ALL TO authenticated USING (true);

-- Returns
CREATE POLICY "Enable read for returns" ON purchase_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for returns" ON purchase_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for returns" ON purchase_returns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for returns" ON purchase_returns FOR DELETE TO authenticated USING (status = 'draft');

CREATE POLICY "Enable read for return lines" ON purchase_return_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for return lines" ON purchase_return_lines FOR ALL TO authenticated USING (true);


-- ==========================================
-- 3. RPCs
-- ==========================================

-- 3.1 Post Purchase Order
-- Just a status transition, no stock impact.
CREATE OR REPLACE FUNCTION post_purchase_order(po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE purchase_orders 
    SET status = 'approved', updated_at = NOW() 
    WHERE id = po_id AND status = 'draft';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order not found or not in draft status';
    END IF;
END;
$$;

-- 3.2 Post Stock Transfer OUT
-- Decrements stock at Source. Transitions to 'in_transit'.
CREATE OR REPLACE FUNCTION post_stock_transfer_out(transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_line RECORD;
BEGIN
    -- Get Transfer
    SELECT * INTO v_transfer FROM stock_transfers WHERE id = transfer_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    IF v_transfer.status <> 'pending' THEN
        RAISE EXCEPTION 'Transfer must be pending to ship';
    END IF;

    -- Update Status
    UPDATE stock_transfers SET status = 'in_transit', updated_at = NOW() WHERE id = transfer_id;

    -- Process Lines (Decrement Source)
    FOR v_line IN SELECT * FROM stock_transfer_lines WHERE transfer_id = post_stock_transfer_out.transfer_id LOOP
        
        -- Create Stock Move (OUT)
        INSERT INTO stock_moves (
            location_id, item_id, lot_id, quantity_change, move_type, reference_id, created_by
        ) VALUES (
            v_transfer.source_location_id,
            v_line.item_id,
            v_line.lot_id,
            -v_line.quantity_sent, -- Negative for sending
            'TRANSFER_OUT',
            transfer_id,
            v_transfer.created_by
        );

        -- Update Stock Balance (Source)
        -- We assume enough stock exists or check it. 
        -- For robust systems, we should check `quantity_on_hand` first.
        UPDATE stock_balances
        SET quantity_on_hand = quantity_on_hand - v_line.quantity_sent, updated_at = NOW()
        WHERE location_id = v_transfer.source_location_id 
          AND item_id = v_line.item_id 
          AND (lot_id IS NOT DISTINCT FROM v_line.lot_id);
          
        -- If row doesn't exist (implying 0 or error), we might have an issue if we allow negative stock.
        -- If we don't allow negative, we should add a check constraint on stock_balances or here.
        -- Assuming allowed for now to keep it simple, but let's insert if missing (starting from 0 -> negative).
        IF NOT FOUND THEN
             INSERT INTO stock_balances (location_id, item_id, lot_id, quantity_on_hand, created_by)
             VALUES (v_transfer.source_location_id, v_line.item_id, v_line.lot_id, -v_line.quantity_sent, v_transfer.created_by);
        END IF;

    END LOOP;
END;
$$;

-- 3.3 Receive Stock Transfer
-- Increments stock at Target. Transitions to 'completed'.
CREATE OR REPLACE FUNCTION receive_stock_transfer(transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_line RECORD;
    v_qty_received NUMERIC;
BEGIN
    SELECT * INTO v_transfer FROM stock_transfers WHERE id = transfer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    IF v_transfer.status <> 'in_transit' THEN
        RAISE EXCEPTION 'Transfer must be in_transit to receive';
    END IF;

    -- Update Status
    UPDATE stock_transfers SET status = 'completed', updated_at = NOW() WHERE id = transfer_id;

    FOR v_line IN SELECT * FROM stock_transfer_lines WHERE transfer_id = receive_stock_transfer.transfer_id LOOP
        
        -- Default received to sent if not specified (auto-receive all)
        -- Or rely on a separate update step before calling this RPC?
        -- Let's assume for this sprint, we receive what was sent unless edited.
        -- If the UI updates `quantity_received` before calling this, use that.
        -- If it's NULL, use `quantity_sent`.
        
        v_qty_received := COALESCE(v_line.quantity_received, v_line.quantity_sent);
        
        -- Update line with received qty if it was null
        UPDATE stock_transfer_lines SET quantity_received = v_qty_received WHERE id = v_line.id;

        -- Create Stock Move (IN)
        INSERT INTO stock_moves (
            location_id, item_id, lot_id, quantity_change, move_type, reference_id, created_by
        ) VALUES (
            v_transfer.target_location_id,
            v_line.item_id,
            v_line.lot_id,
            v_qty_received, -- Positive
            'TRANSFER_IN',
            transfer_id,
            v_transfer.created_by
        );

        -- Update Stock Balance (Target)
        INSERT INTO stock_balances (
            location_id, item_id, lot_id, quantity_on_hand, created_by
        ) VALUES (
            v_transfer.target_location_id,
            v_line.item_id,
            v_line.lot_id,
            v_qty_received,
            v_transfer.created_by
        )
        ON CONFLICT (location_id, item_id, lot_id)
        DO UPDATE SET 
            quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            updated_at = NOW();

    END LOOP;
END;
$$;

-- 3.4 Post Purchase Return
CREATE OR REPLACE FUNCTION post_purchase_return(return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_return RECORD;
    v_line RECORD;
BEGIN
    SELECT * INTO v_return FROM purchase_returns WHERE id = return_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

    UPDATE purchase_returns SET status = 'posted', updated_at = NOW() WHERE id = return_id;

    FOR v_line IN SELECT * FROM purchase_return_lines WHERE return_id = post_purchase_return.return_id LOOP
        
        -- Stock Move (OUT)
        INSERT INTO stock_moves (
            location_id, item_id, lot_id, quantity_change, move_type, reference_id, created_by
        ) VALUES (
            v_return.location_id,
            v_line.item_id,
            v_line.lot_id,
            -v_line.quantity,
            'PURCHASE_RETURN',
            return_id,
            v_return.created_by
        );

        -- Decrease Balance
        UPDATE stock_balances
        SET quantity_on_hand = quantity_on_hand - v_line.quantity, updated_at = NOW()
        WHERE location_id = v_return.location_id 
          AND item_id = v_line.item_id 
          AND (lot_id IS NOT DISTINCT FROM v_line.lot_id);

    END LOOP;
END;
$$;
