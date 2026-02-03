"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/features/auth/LogoutButton";

type Props = {
    userEmail: string;
    children: React.ReactNode;
};

const nav = [
    { label: "Dashboard", href: "/app" },
    { label: "Categories", href: "/app/catalog/categories" },
    { label: "Units", href: "/app/catalog/units" },
    { label: "Items", href: "/app/catalog/items" },
    { label: "POS", href: "/app/pos" },
    { label: "Sync", href: "/app/sync" },
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

                    <LogoutButton />
                </header>

                {/* Page content */}
                <main className="p-6">{children}</main>
            </div>
        </div>
    );
}
