import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link'; // Assuming Link component exists
import { Plus } from 'lucide-react';
import PurchaseOrderList from '@/components/purchasing/PurchaseOrderList';

export default function PurchaseOrdersPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
                <Link href="/app/purchasing/orders/new" className={buttonVariants()}>
                    <Plus className="w-4 h-4 mr-2" /> New Order
                </Link>
            </div>

            <PurchaseOrderList />
        </div>
    );
}
