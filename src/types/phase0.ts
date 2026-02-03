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
    sale_price: number; // Supabase returns numeric as string sometimes; handle carefully in code
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
    | "sales_invoice_lines";

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
    created_at: ISODateTime;
    attempt_count: number;
    last_error: string | null;
}
