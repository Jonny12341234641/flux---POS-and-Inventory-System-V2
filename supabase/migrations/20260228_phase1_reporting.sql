-- Migration: Phase 1 Reporting (Indexes & RPCs)
-- Date: 2026-02-28

-- 1. Performance Indexes
-- Essential for filtering reports by location and date range without full table scans

CREATE INDEX IF NOT EXISTS idx_stock_moves_loc_created ON stock_moves(location_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_created ON stock_moves(item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_loc_created ON sales_invoices(location_id, created_at);
CREATE INDEX IF NOT EXISTS idx_grns_loc_created ON grns(location_id, created_at);

-- For Fetching expiring batches efficiently
CREATE INDEX IF NOT EXISTS idx_stock_lots_expiry ON stock_lots(expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_lots_loc_item ON stock_lots(location_id, item_id);


-- 2. Reporting RPCs
-- Read-only functions running on the server to aggregate data

-- A. Stock Ledger Report
-- Shows chronological history of item movements
CREATE OR REPLACE FUNCTION get_stock_ledger(
  p_start_date TIMESTAMP WITH TIME ZONE,
  p_end_date TIMESTAMP WITH TIME ZONE,
  p_location_id UUID,
  p_item_id UUID DEFAULT NULL
)
RETURNS TABLE (
  move_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  item_name TEXT,
  batch_number TEXT,
  move_type TEXT,
  quantity NUMERIC,
  reference_id TEXT, -- e.g. invoice # or PO #
  user_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner privs (careful), but we will add RLS check inside
AS $$
BEGIN
  -- Manual RLS Check: Ensure user has access to this location
  IF NOT EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND (location_id = p_location_id OR role = 'admin')
  ) THEN
      RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  SELECT 
    sm.id as move_id,
    sm.created_at,
    i.name as item_name,
    sl.batch_number,
    sm.move_type,
    sm.quantity,
    sm.reference_id,
    up.full_name as user_name
  FROM stock_moves sm
  JOIN items i ON sm.item_id = i.id
  LEFT JOIN stock_lots sl ON sm.lot_id = sl.id
  LEFT JOIN user_profiles up ON sm.created_by = up.user_id
  WHERE sm.location_id = p_location_id
    AND sm.created_at >= p_start_date
    AND sm.created_at <= p_end_date
    AND (p_item_id IS NULL OR sm.item_id = p_item_id)
  ORDER BY sm.created_at DESC;
END;
$$;


-- B. Batch Expiry Report
-- Shows batches expiring within X days
CREATE OR REPLACE FUNCTION get_batch_expiry_report(
    p_location_id UUID,
    p_days_threshold INT
)
RETURNS TABLE (
    item_name TEXT,
    batch_number TEXT,
    expiry_date DATE,
    quantity_on_hand NUMERIC,
    days_until_expiry INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- RLS Check
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND (location_id = p_location_id OR role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Access Denied';
    END IF;

    RETURN QUERY
    SELECT 
        i.name as item_name,
        sl.batch_number,
        sl.expiry_date,
        sb.quantity as quantity_on_hand,
        (sl.expiry_date - CURRENT_DATE)::INT as days_until_expiry
    FROM stock_balances sb
    JOIN stock_lots sl ON sb.lot_id = sl.id
    JOIN items i ON sb.item_id = i.id
    WHERE sb.location_id = p_location_id
      AND sb.quantity > 0
      AND sl.expiry_date <= (CURRENT_DATE + p_days_threshold)
    ORDER BY sl.expiry_date ASC;
END;
$$;


-- C. Sales Summary Report
CREATE OR REPLACE FUNCTION get_sales_summary(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE,
    p_location_id UUID,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS TABLE (
    invoice_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    customer_name TEXT,
    total_amount NUMERIC,
    status TEXT,
    payment_method TEXT,
    cashier_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
   -- RLS Check
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND (location_id = p_location_id OR role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Access Denied';
    END IF;

    RETURN QUERY
    SELECT 
        si.invoice_number,
        si.created_at,
        c.name as customer_name,
        si.total_amount,
        si.status,
        (SELECT validation_method FROM payments p WHERE p.invoice_id = si.id LIMIT 1) as payment_method,
        up.full_name as cashier_name
    FROM sales_invoices si
    LEFT JOIN customers c ON si.customer_id = c.id
    LEFT JOIN user_profiles up ON si.user_id = up.user_id
    WHERE si.location_id = p_location_id
      AND si.created_at >= p_start_date
      AND si.created_at <= p_end_date
      AND (p_cashier_id IS NULL OR si.user_id = p_cashier_id)
    ORDER BY si.created_at DESC;
END;
$$;


-- D. Purchase Summary (GRN based)
CREATE OR REPLACE FUNCTION get_purchase_summary(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE,
    p_location_id UUID
)
RETURNS TABLE (
    grn_number TEXT,
    received_date TIMESTAMP WITH TIME ZONE,
    supplier_name TEXT,
    status TEXT,
    po_reference TEXT,
    item_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- RLS Check
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND (location_id = p_location_id OR role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Access Denied';
    END IF;

    RETURN QUERY
    SELECT 
        g.grn_number,
        g.received_date,
        s.name as supplier_name,
        g.status,
        po.po_number as po_reference,
        (SELECT COUNT(*) FROM grn_lines gl WHERE gl.grn_id = g.id) as item_count
    FROM grns g
    JOIN suppliers s ON g.supplier_id = s.id
    LEFT JOIN purchase_orders po ON g.po_id = po.id
    WHERE g.location_id = p_location_id
      AND g.received_date >= p_start_date
      AND g.received_date <= p_end_date
    ORDER BY g.received_date DESC;
END;
$$;
