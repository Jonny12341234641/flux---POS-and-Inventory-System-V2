'use client';

import PurchaseOrderForm from '@/components/purchasing/PurchaseOrderForm';
import { Button, buttonVariants } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link'; // Assuming Link from next/link is used or similar

export default function NewPurchaseOrderPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/app/purchasing/orders" className={buttonVariants({ variant: "ghost", size: "icon" })}>
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">New Purchase Order</h1>
            </div>

            <div className="border rounded-lg p-6 bg-card">
                <PurchaseOrderForm />
            </div>
        </div>
    );
}
