-- Migration: POS & Returns (Phase 1 Sprint 4)
-- Date: 2026-02-20
-- Description: Adds tables and logic for Sales, Payments, and Returns.

-- ==========================================
-- 1. Tables
-- ==========================================

-- 1.1 Sales Tables
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    customer_id UUID REFERENCES customers(id), -- Nullable for walk-in
    invoice_number TEXT NOT NULL,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'partial', 'unpaid')) DEFAULT 'unpaid',
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'void')) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE (location_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id),
    qty NUMERIC NOT NULL CHECK (qty > 0),
    unit_price NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'credit', 'other')),
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    reference_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 1.2 Returns Tables
CREATE TABLE IF NOT EXISTS sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    original_invoice_id UUID REFERENCES sales_invoices(id),
    return_number TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted')) DEFAULT 'draft',
    reason TEXT,
    refund_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS sales_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id),
    qty NUMERIC NOT NULL CHECK (qty > 0),
    refund_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. RLS Policies
-- ==========================================

ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_return_lines ENABLE ROW LEVEL SECURITY;

-- Sales Invoices
CREATE POLICY "Enable access for authenticated users" ON sales_invoices FOR ALL TO authenticated USING (true);

-- Sales Invoice Lines
CREATE POLICY "Enable access for authenticated users lines" ON sales_invoice_lines FOR ALL TO authenticated USING (true);

-- Payments
CREATE POLICY "Enable access for authenticated users payments" ON payments FOR ALL TO authenticated USING (true);

-- Sales Returns
CREATE POLICY "Enable access for authenticated users returns" ON sales_returns FOR ALL TO authenticated USING (true);

-- Sales Return Lines
CREATE POLICY "Enable access for authenticated users return lines" ON sales_return_lines FOR ALL TO authenticated USING (true);


-- ==========================================
-- 3. RPCs
-- ==========================================

-- 3.1 Post Sale Transaction
-- Receives a JSON payload with { invoice: {}, lines: [], payments: [] }
-- This is used for syncing offline sales.
CREATE OR REPLACE FUNCTION post_sale_transaction(payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_data JSONB;
    v_lines_data JSONB;
    v_payments_data JSONB;
    v_line_item JSONB;
    v_payment_item JSONB;
    v_invoice_id UUID;
    v_qty_on_hand NUMERIC;
    v_location_id UUID;
    v_user_id UUID;
BEGIN
    -- Extract parts
    v_invoice_data := payload -> 'invoice';
    v_lines_data := payload -> 'lines';
    v_payments_data := payload -> 'payments';
    
    -- Basic Validation
    IF v_invoice_data IS NULL THEN RAISE EXCEPTION 'Missing invoice data'; END IF;
    
    -- Check uniqueness (Idempotency)
    -- If ID exists, we might update or skip. For sync, if it exists, assume it's done?
    -- OR we assume the caller handles checks.
    -- Let's check invoice_number + location
    v_location_id := (v_invoice_data ->> 'location_id')::UUID;
    v_user_id := (v_invoice_data ->> 'created_by')::UUID;
    
    IF EXISTS (SELECT 1 FROM sales_invoices WHERE invoice_number = (v_invoice_data ->> 'invoice_number') AND location_id = v_location_id) THEN
        RAISE NOTICE 'Invoice % already exists, skipping.', (v_invoice_data ->> 'invoice_number');
        RETURN;
    END IF;

    -- Insert Invoice
    INSERT INTO sales_invoices (
        id, location_id, customer_id, invoice_number, total_amount, discount_amount, net_amount, payment_status, status, created_at, created_by
    ) VALUES (
        COALESCE((v_invoice_data ->> 'id')::UUID, gen_random_uuid()),
        v_location_id,
        (v_invoice_data ->> 'customer_id')::UUID, -- Nullable
        (v_invoice_data ->> 'invoice_number'),
        (v_invoice_data ->> 'total_amount')::NUMERIC,
        (v_invoice_data ->> 'discount_amount')::NUMERIC,
        (v_invoice_data ->> 'net_amount')::NUMERIC,
        (v_invoice_data ->> 'payment_status'),
        'posted', -- Auto-post for offline sales
        COALESCE((v_invoice_data ->> 'created_at')::TIMESTAMPTZ, NOW()),
        v_user_id
    ) RETURNING id INTO v_invoice_id;

    -- Process Lines
    FOR v_line_item IN SELECT * FROM jsonb_array_elements(v_lines_data) LOOP
        -- Insert Line
        INSERT INTO sales_invoice_lines (
            invoice_id, item_id, lot_id, qty, unit_price, discount_amount, total
        ) VALUES (
            v_invoice_id,
            (v_line_item ->> 'item_id')::UUID,
            (v_line_item ->> 'lot_id')::UUID,
            (v_line_item ->> 'qty')::NUMERIC,
            (v_line_item ->> 'unit_price')::NUMERIC,
            (v_line_item ->> 'discount_amount')::NUMERIC,
            (v_line_item ->> 'total')::NUMERIC
        );

        -- Inventory Deduction
        -- 1. Check Stock (Optional strict mode? Assuming strict for now)
        SELECT quantity_on_hand INTO v_qty_on_hand 
        FROM stock_balances 
        WHERE location_id = v_location_id 
          AND item_id = (v_line_item ->> 'item_id')::UUID 
          AND (lot_id IS NOT DISTINCT FROM (v_line_item ->> 'lot_id')::UUID);

        IF v_qty_on_hand IS NULL OR v_qty_on_hand < (v_line_item ->> 'qty')::NUMERIC THEN
            -- Sync conflict: Insufficient stock.
            -- Policy: We RAISE error to fail the sync transaction. 
            -- The offline queue will retry or need manual intervention.
            RAISE EXCEPTION 'Insufficient stock for item % (Lot: %). Available: %, Required: %', 
                (v_line_item ->> 'item_id'), 
                (v_line_item ->> 'lot_id'),
                COALESCE(v_qty_on_hand, 0),
                (v_line_item ->> 'qty');
        END IF;

        -- 2. Create Stock Move
        INSERT INTO stock_moves (
            location_id, item_id, lot_id, quantity_change, move_type, reference_id, created_by, created_at
        ) VALUES (
            v_location_id,
            (v_line_item ->> 'item_id')::UUID,
            (v_line_item ->> 'lot_id')::UUID,
            -(v_line_item ->> 'qty')::NUMERIC, -- Negative
            'SALE',
            v_invoice_id,
            v_user_id,
            NOW()
        );

        -- 3. Update Balance
        UPDATE stock_balances 
        SET quantity_on_hand = quantity_on_hand - (v_line_item ->> 'qty')::NUMERIC, updated_at = NOW()
        WHERE location_id = v_location_id 
          AND item_id = (v_line_item ->> 'item_id')::UUID 
          AND (lot_id IS NOT DISTINCT FROM (v_line_item ->> 'lot_id')::UUID);
    END LOOP;

    -- Process Payments
    FOR v_payment_item IN SELECT * FROM jsonb_array_elements(v_payments_data) LOOP
        INSERT INTO payments (
            invoice_id, method, amount, reference_note, created_at, created_by
        ) VALUES (
            v_invoice_id,
            (v_payment_item ->> 'method'),
            (v_payment_item ->> 'amount')::NUMERIC,
            (v_payment_item ->> 'reference_note'),
            COALESCE((v_payment_item ->> 'created_at')::TIMESTAMPTZ, NOW()),
            v_user_id
        );
    END LOOP;

END;
$$;


-- 3.2 Post Sales Return
CREATE OR REPLACE FUNCTION post_sales_return(return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_return RECORD;
    v_line RECORD;
BEGIN
    SELECT * INTO v_return FROM sales_returns WHERE id = return_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

    UPDATE sales_returns SET status = 'posted', updated_at = NOW() WHERE id = return_id;

    FOR v_line IN SELECT * FROM sales_return_lines WHERE return_id = post_sales_return.return_id LOOP
        
        -- Stock Move (IN) - Return to stock
        INSERT INTO stock_moves (
            location_id, item_id, lot_id, quantity_change, move_type, reference_id, created_by
        ) VALUES (
            v_return.location_id,
            v_line.item_id,
            v_line.lot_id,
            v_line.qty, -- Positive
            'SALE_RETURN',
            return_id,
            v_return.created_by
        );

        -- Increase Balance
        INSERT INTO stock_balances (
            location_id, item_id, lot_id, quantity_on_hand, created_by
        ) VALUES (
            v_return.location_id,
            v_line.item_id,
            v_line.lot_id,
            v_line.qty,
            v_return.created_by
        )
        ON CONFLICT (location_id, item_id, lot_id)
        DO UPDATE SET 
            quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            updated_at = NOW();

    END LOOP;
END;
$$;
