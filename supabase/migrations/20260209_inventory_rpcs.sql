-- Migration: Inventory RPCs (Phase 1 Sprint 2)
-- Date: 2026-02-09
-- Description: Adds RPCs for posting GRNs and fetching stock balances.

-- 1. RPC: post_grn
-- Atomically transitions a GRN from 'draft' to 'posted' and updates stock.
CREATE OR REPLACE FUNCTION post_grn(grn_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_grn RECORD;
    v_line RECORD;
    v_lot_id UUID;
BEGIN
    -- 1. Fetch GRN and validate
    SELECT * INTO v_grn FROM grns WHERE id = grn_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GRN not found';
    END IF;

    IF v_grn.status = 'posted' THEN
        RAISE EXCEPTION 'GRN is already posted';
    END IF;

    -- 2. Update GRN status
    UPDATE grns SET status = 'posted', updated_at = NOW() WHERE id = grn_id;

    -- 3. Process each line
    FOR v_line IN SELECT * FROM grn_lines WHERE grn_id = post_grn.grn_id LOOP
        
        v_lot_id := v_line.lot_id;

        -- If logic requires creating a lot on the fly (though typically created before), ensure it exists.
        -- For this implementation, we assume lot_id is passed if it exists, or handled by the frontend creating the lot record first.
        -- If lot_id is NULL, it's a non-batched item (if we support that mix). 
        
        -- 3a. Create Stock Move
        INSERT INTO stock_moves (
            location_id,
            item_id,
            lot_id,
            quantity_change,
            move_type,
            reference_id, /* GRN ID */
            created_by
        ) VALUES (
            v_grn.location_id,
            v_line.item_id,
            v_lot_id,
            v_line.quantity, -- Positive for GRN
            'GRN',
            grn_id,
            v_grn.created_by
        );

        -- 3b. Update Stock Balance
        -- Upsert logic: If balance exists, add to it. If not, create it.
        INSERT INTO stock_balances (
            location_id,
            item_id,
            lot_id,
            quantity_on_hand,
            created_by
        ) VALUES (
            v_grn.location_id,
            v_line.item_id,
            v_lot_id,
            v_line.quantity,
            v_grn.created_by
        )
        ON CONFLICT (location_id, item_id, lot_id)
        DO UPDATE SET 
            quantity_on_hand = stock_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
            updated_at = NOW();

    END LOOP;

EXCEPTION
    WHEN OTHERS THEN
        -- Rollback is automatic in PL/pgSQL if an exception is raised
        RAISE;
END;
$$;


-- 2. RPC: get_stock_balances
-- Returns stock levels with item details and calculated expiry status.
CREATE OR REPLACE FUNCTION get_stock_balances(p_location_id UUID)
RETURNS TABLE (
    id UUID,
    item_id UUID,
    item_name TEXT,
    lot_id UUID,
    batch_number TEXT,
    expiry_date DATE,
    quantity_on_hand NUMERIC,
    is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sb.id,
        sb.item_id,
        i.name as item_name,
        sb.lot_id,
        sl.batch_number,
        sl.expiry_date,
        sb.quantity_on_hand,
        CASE 
            WHEN sl.expiry_date IS NOT NULL AND sl.expiry_date < CURRENT_DATE THEN TRUE 
            ELSE FALSE 
        END as is_expired
    FROM stock_balances sb
    JOIN items i ON sb.item_id = i.id
    LEFT JOIN stock_lots sl ON sb.lot_id = sl.id
    WHERE sb.location_id = p_location_id
    ORDER BY i.name, sl.expiry_date;
END;
$$;
