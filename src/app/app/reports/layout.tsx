import { ReactNode } from "react";

export default function ReportsLayout({ children }: { children: ReactNode }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
                <p className="text-muted-foreground">
                    Analyze store performance, inventory movements, and sales trends.
                </p>
            </div>
            {children}
        </div>
    );
}
