import Dexie, { type Table } from 'dexie';
import { Item, UUID, OutboxItem } from '@/types/phase0';

export class FluxPOSDB extends Dexie {
    items!: Table<Item, UUID>;
    sales_queue!: Table<OutboxItem, UUID>;

    constructor() {
        super('FluxPOSDB');
        this.version(1).stores({
            items: 'id, location_id, name, barcode', // indexes
            sales_queue: 'id, status, created_at'
        });
    }
}

export const db = new FluxPOSDB();
