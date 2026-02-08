-- Phase 1 Foundation: Suppliers, Customers, Inventory, GRNs

-- 1. Suppliers
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    name TEXT NOT NULL,
    supplier_no TEXT,
    contact_info TEXT, -- JSON or Text, keeping simple text for now as per requirements
    credit_days INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 2. Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    name TEXT NOT NULL,
    mobile TEXT,
    email TEXT,
    credit_limit NUMERIC,
    credit_days INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 3. Stock Lots (Batch/Expiry)
CREATE TABLE stock_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL, 
    item_id UUID NOT NULL REFERENCES items(id),
    batch_number TEXT,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 4. Stock Moves (Ledger)
CREATE TABLE stock_moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id), -- Nullable if not batch tracked? implied yes for now
    quantity_change NUMERIC NOT NULL,
    move_type TEXT NOT NULL, -- 'GRN', 'SALE', 'ADJUSTMENT', 'TRANSFER'
    reference_id UUID, -- ID of the GRN, Sale, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 5. Stock Balances (Snapshot)
CREATE TABLE stock_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id),
    quantity_on_hand NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    UNIQUE (location_id, item_id, lot_id) -- Prevent duplicates
);

-- 6. GRNs (Goods Received Notes)
CREATE TABLE grns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'posted'
    reference_number TEXT,
    received_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 7. GRN Lines
CREATE TABLE grn_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL,
    grn_id UUID NOT NULL REFERENCES grns(id),
    item_id UUID NOT NULL REFERENCES items(id),
    lot_id UUID REFERENCES stock_lots(id),
    quantity NUMERIC NOT NULL,
    cost NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);


-- RLS Policies

-- Enable RLS on all new tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE grns ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_lines ENABLE ROW LEVEL SECURITY;

-- Helper function to check role (assuming user_profiles exists and is linked to auth.uid())
-- For this sprint, we rely on the existing pattern. 
-- "Owner" = can access everything.
-- "Manager"/"Cashier" = can access only their location_id.

-- Policies for Suppliers
CREATE POLICY "Owner access all suppliers" ON suppliers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );

CREATE POLICY "Location based access for managers/cashiers on suppliers" ON suppliers
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid())
    );

-- Policies for Customers
CREATE POLICY "Owner access all customers" ON customers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );

CREATE POLICY "Location based access for managers/cashiers on customers" ON customers
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid())
    );

-- Policies for Stock Lots
CREATE POLICY "Owner access all stock_lots" ON stock_lots
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );
CREATE POLICY "Location based access for managers/cashiers on stock_lots" ON stock_lots
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid())
    );

-- Policies for Stock Moves
-- Cashier: READ ONLY (Select), cannot Insert/Update/Delete directly (Sales will likely be done via RPC or backend trigger, 
-- but if direct insert is needed for sales, we might need to allow INSERT for Cashier if they create sales that create moves.
-- Requirement says: "Cashier: DENY write access to stock_moves". 
-- So they can only View.
CREATE POLICY "Owner access all stock_moves" ON stock_moves
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );
CREATE POLICY "Manager access stock_moves" ON stock_moves
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role IN ('manager'))
    );
    
-- Explicitly deny write for cashier by OMITTING them from the write policies, or using specific roles.
-- Giving Cashier READ access:
CREATE POLICY "Cashier view stock_moves" ON stock_moves
    FOR SELECT USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'cashier')
    );


-- Policies for Stock Balances
CREATE POLICY "Owner access all stock_balances" ON stock_balances
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );
CREATE POLICY "Manager/Cashier view stock_balances" ON stock_balances
    FOR SELECT USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid())
    );
-- Managers might need to adjust balances? If so they need write. Assuming Manager can adjust.
CREATE POLICY "Manager write stock_balances" ON stock_balances
    FOR INSERT WITH CHECK (
         location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'manager')
    );
CREATE POLICY "Manager update stock_balances" ON stock_balances
    FOR UPDATE USING (
         location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'manager')
    );


-- Policies for GRNs
-- Cashier: Deny write.
CREATE POLICY "Owner access all grns" ON grns
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );
CREATE POLICY "Manager access grns" ON grns
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'manager')
    );
CREATE POLICY "Cashier view grns" ON grns
    FOR SELECT USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'cashier')
    );

-- Policies for GRN Lines
CREATE POLICY "Owner access all grn_lines" ON grn_lines
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
    );
CREATE POLICY "Manager access grn_lines" ON grn_lines
    FOR ALL USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'manager')
    );
CREATE POLICY "Cashier view grn_lines" ON grn_lines
    FOR SELECT USING (
        location_id IN (SELECT location_id FROM user_profiles WHERE user_id = auth.uid() AND role = 'cashier')
    );
