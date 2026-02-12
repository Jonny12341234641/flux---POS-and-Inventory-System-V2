"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/features/auth/LogoutButton";
import { useSyncQueue } from "@/features/sync/useSyncQueue";
import { HelpModal } from "@/components/ui/HelpModal"; // Import HelpModal
import { useState } from "react";
import { CircleHelp } from "lucide-react"; // Import Icon
import { Button } from "@/components/ui/button"; // Import Button if not already there? Wait, AppShell might not use Button. Let's check imports.
// It seems AppShell does not import Button. I should check if I need to import it.
// Actually AppShell usually just has HTML.
// But I used Button in my previous tool call. So I must import it.

type Props = {
    userEmail: string;
    children: React.ReactNode;
};

const nav = [
    { label: "Dashboard", href: "/app" },
    { label: "Categories", href: "/app/catalog/categories" },
    { label: "Units", href: "/app/catalog/units" },
    { label: "Items", href: "/app/catalog/items" },
    { label: "Suppliers", href: "/app/catalog/suppliers" },
    { label: "Customers", href: "/app/sales/customers" },
    { label: "Purchase Orders", href: "/app/purchasing/orders" },
    { label: "Purchasing (GRN)", href: "/app/purchasing/grn" },
    { label: "Inventory", href: "/app/inventory" },
    { label: "Stock Transfers", href: "/app/inventory/transfers" },
    { label: "POS", href: "/app/pos" },
    { label: "Sync", href: "/app/sync" },
    { label: "Reports", href: "/app/reports/stock-ledger" }, // Defaulting to Stock Ledger for now
];

function NavLink({ href, label }: { href: string; label: string }) {
    const pathname = usePathname();
    const active = pathname === href;

    return (
        <Link
            href={href}
            className={[
                "block rounded px-3 py-2 text-sm",
                active ? "bg-gray-200 font-medium" : "hover:bg-gray-100",
            ].join(" ")}
        >
            {label}
        </Link>
    );
}

export default function AppShell({ userEmail, children }: Props) {
    useSyncQueue(); // Background worker
    const [showHelp, setShowHelp] = useState(false);
    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className="w-64 border-r p-4 hidden md:block">
                <div className="text-lg font-semibold">Flux</div>
                <nav className="mt-4 space-y-1">
                    {nav.map((x) => (
                        <NavLink key={x.href} href={x.href} label={x.label} />
                    ))}
                </nav>
            </aside>

            {/* Main */}
            <div className="flex-1">
                {/* Top bar */}
                <header className="border-b p-4 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm opacity-70">Logged in as</div>
                        <div className="text-sm font-medium">{userEmail || "Unknown"}</div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setShowHelp(true)} title="Help & Training">
                            <CircleHelp className="h-5 w-5 text-gray-500" />
                        </Button>
                        <LogoutButton />
                    </div>
                </header>

                <HelpModal open={showHelp} onOpenChange={setShowHelp} />

                {/* Page content */}
                <main className="p-6">{children}</main>
            </div >
        </div >
    );
}
