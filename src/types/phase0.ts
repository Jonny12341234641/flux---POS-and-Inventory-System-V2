// src/types/phase0.ts

export type UUID = string; // Supabase returns UUIDs as strings in JS
export type ISODateTime = string; // timestamptz as ISO string

// ---------- Core Entities (match DB column names) ----------
// Tip: Keep snake_case here because Supabase returns snake_case by default.
// Later, if you want camelCase in UI, create mapping functions.

export interface Location {
    id: UUID;
    name: string;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface UserProfile {
    user_id: UUID;
    location_id: UUID;
    role: "cashier" | "manager" | "owner" | "auditor" | string; // keep flexible now
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface Category {
    id: UUID;
    location_id: UUID;
    name: string;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface Unit {
    id: UUID;
    location_id: UUID;
    name: string;
    short_code: string | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface Item {
    id: UUID;
    location_id: UUID;
    category_id: UUID | null;
    unit_id: UUID | null;
    name: string;
    barcode: string | null;
    sale_price: number;
    cost: number;
    is_batch_tracked: boolean; // Added in Phase 1
    expiry_warning_days: number | null; // Added in Phase 1
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface SalesInvoice {
    id: UUID;
    location_id: UUID;

    invoice_number: string;
    invoice_date: ISODateTime;

    subtotal: number;
    discount_total: number;
    grand_total: number;

    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface SalesInvoiceLine {
    id: UUID;
    location_id: UUID;

    sales_invoice_id: UUID;
    item_id: UUID;

    qty: number;
    unit_price: number;
    line_total: number;

    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

// ---------- Offline Queue (Phase 0 foundation) ----------

export type OutboxEntity =
    | "categories"
    | "units"
    | "items"
    | "sales_invoices"
    | "sales_invoice_lines"
    | "suppliers"
    | "customers"
    | "stock_lots"
    | "stock_moves"
    | "stock_balances"
    | "grns"
    | "grn_lines"
    | "purchase_orders"
    | "purchase_order_lines"
    | "stock_transfers"
    | "stock_transfer_lines"
    | "purchase_returns"
    | "purchase_return_lines"
    | "sales_transaction"
    | "sales_return"
    | "sales_returns"
    | "sales_return_lines"
    | "payments";

export type OutboxAction = "insert" | "update" | "delete";

// Minimal “offline queue item” shape.
// Later you will store these in IndexedDB.
export interface OutboxItem<TPayload = any> {
    id: UUID; // local UUID
    entity: OutboxEntity;
    action: OutboxAction;
    location_id: UUID;

    // What you plan to send to Supabase
    payload: TPayload;

    // Retry + ordering support
    status: 'pending' | 'synced' | 'failed';
    created_at: ISODateTime;
    attempt_count: number;
    last_error: string | null;
}

// ---------- Phase 1 Entities ----------

export interface Supplier {
    id: UUID;
    location_id: UUID;
    name: string;
    supplier_no: string | null;
    contact_info: string | null;
    credit_days: number | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface Customer {
    id: UUID;
    location_id: UUID;
    name: string;
    mobile: string | null;
    email: string | null;
    credit_limit: number | null;
    credit_days: number | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface StockLot {
    id: UUID;
    location_id: UUID;
    item_id: UUID;
    batch_number: string | null;
    expiry_date: ISODateTime | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface StockMove {
    id: UUID;
    location_id: UUID;
    item_id: UUID;
    lot_id: UUID | null;
    quantity_change: number;
    move_type: string;
    reference_id: UUID | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface StockBalance {
    id: UUID;
    location_id: UUID;
    item_id: UUID;
    lot_id: UUID | null;
    quantity_on_hand: number;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface GRN {
    id: UUID;
    location_id: UUID;
    supplier_id: UUID | null;
    status: 'draft' | 'posted';
    reference_number: string | null;
    received_date: ISODateTime | null;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}

export interface GRNLine {
    id: UUID;
    location_id: UUID;
    grn_id: UUID;
    item_id: UUID;
    lot_id: UUID | null;
    quantity: number;
    cost: number;
    created_at: ISODateTime;
    updated_at: ISODateTime;
    created_by: UUID | null;
}
