// import Dexie, { type Table } from 'dexie';
// import { Item, UUID, OutboxItem } from '@/types/phase0';

// export class FluxPOSDB extends Dexie {
//     items!: Table<Item, UUID>;
//     sales_queue!: Table<OutboxItem, UUID>;

//     constructor() {
//         super('FluxPOSDB');
//         this.version(1).stores({
//             items: 'id, location_id, name, barcode', // indexes
//             sales_queue: 'id, status, created_at'
//         });
//     }
// }

// export const db = new FluxPOSDB();


import Dexie, { type Table } from 'dexie';
import { Item, UUID, OutboxItem, Category, Unit, Location, UserProfile, Supplier, Customer, StockLot, StockBalance } from '@/types/phase0';

export class FluxPOSDB extends Dexie {
    items!: Table<Item, UUID>;
    categories!: Table<Category, UUID>;  // Added
    units!: Table<Unit, UUID>;           // Added
    locations!: Table<Location, UUID>;   // Added
    user_profiles!: Table<UserProfile, UUID>; // Added

    // Phase 1 Tables
    suppliers!: Table<Supplier, UUID>;
    customers!: Table<Customer, UUID>;
    stock_lots!: Table<StockLot, UUID>;
    stock_balances!: Table<StockBalance, UUID>;

    // Sprint 2 Stores
    grns!: Table<any, UUID>;
    grn_lines!: Table<any, UUID>;


    // Sprint 3 Stores (Transfers & POs)
    purchase_orders!: Table<any, UUID>;
    purchase_order_lines!: Table<any, UUID>;
    stock_transfers!: Table<any, UUID>;
    stock_transfer_lines!: Table<any, UUID>;
    purchase_returns!: Table<any, UUID>;

    // Sprint 4 Stores (POS)
    sales_invoices!: Table<any, UUID>;
    sales_invoice_lines!: Table<any, UUID>;
    payments!: Table<any, UUID>;
    sales_returns!: Table<any, UUID>;
    sales_return_lines!: Table<any, UUID>;

    // We typically don't cache full sales history offline in Phase 0, 
    // just the queue for *new* offline sales.
    sales_queue!: Table<OutboxItem, UUID>;

    constructor() {
        super('FluxPOSDB');

        // UPGRADE NOTICE: If you already ran the app, you might need to delete 
        // the old DB in browser DevTools > Application > Storage > IndexedDB 
        // to force this new version to create.

        this.version(4).stores({
            // Indexing rules: 
            // id is primary key. 
            // location_id is needed for RLS filtering offline.
            items: 'id, location_id, name, barcode',
            categories: 'id, location_id, name',
            units: 'id, location_id, name',
            locations: 'id, name',
            user_profiles: 'user_id, location_id',
            sales_queue: 'id, status, created_at',

            // Phase 1 Stores
            suppliers: 'id, location_id, name',
            customers: 'id, location_id, name, mobile',
            stock_lots: 'id, location_id, item_id, batch_number',
            stock_balances: 'id, location_id, item_id, lot_id',

            // Sprint 2 Stores (Purchasing)
            grns: 'id, location_id, supplier_id, status, received_date',
            grn_lines: 'id, grn_id, item_id',

            // Sprint 3 Stores (Transfers & POs)
            purchase_orders: 'id, location_id, supplier_id, status',
            purchase_order_lines: 'id, po_id, item_id',
            stock_transfers: 'id, source_location_id, target_location_id, status',
            stock_transfer_lines: 'id, transfer_id, item_id',
            purchase_returns: 'id, location_id, supplier_id, status'
        });

        // Version 5: POS & Returns
        this.version(5).stores({
            sales_invoices: 'id, location_id, customer_id, invoice_number, status',
            sales_invoice_lines: 'id, invoice_id, item_id',
            payments: 'id, invoice_id',
            sales_returns: 'id, location_id, original_invoice_id',
            sales_return_lines: 'id, return_id, item_id'
        });

    }
}

export const db = new FluxPOSDB();
