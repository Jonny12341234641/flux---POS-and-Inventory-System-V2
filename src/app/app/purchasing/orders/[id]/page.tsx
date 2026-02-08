'use client';

import PurchaseOrderForm from '@/components/purchasing/PurchaseOrderForm';
import { Button, buttonVariants } from '@/components/ui/button'; // Assuming Button component is available
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link'; // Assuming Link from next/link is used
import { use } from 'react';

export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/app/purchasing/orders" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Purchase Order Details</h1>
            </div>

            <div className="border rounded-lg p-6 bg-card">
                <PurchaseOrderForm poId={id} />
            </div>
        </div>
    );
}
