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


    // We typically don't cache full sales history offline in Phase 0, 
    // just the queue for *new* offline sales.
    sales_queue!: Table<OutboxItem, UUID>;

    constructor() {
        super('FluxPOSDB');

        // UPGRADE NOTICE: If you already ran the app, you might need to delete 
        // the old DB in browser DevTools > Application > Storage > IndexedDB 
        // to force this new version to create.
        this.version(2).stores({
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
            stock_balances: 'id, location_id, item_id, lot_id'
        });

    }
}

export const db = new FluxPOSDB();
