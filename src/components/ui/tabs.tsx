"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Simple Context-based Tabs because managing state between Trigger and Content is needed
interface TabsContextValue {
    value: string;
    onValueChange: (value: string) => void;
}
const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
    value,
    defaultValue,
    onValueChange,
    children,
    className
}: {
    value?: string,
    defaultValue?: string,
    onValueChange?: (v: string) => void,
    children: React.ReactNode,
    className?: string
}) {
    // Basic uncontrolled support if needed, but we mostly use controlled in POS
    const [internalValue, setInternalValue] = React.useState(defaultValue || "");
    const currentValue = value !== undefined ? value : internalValue;
    const handleValueChange = (v: string) => {
        if (onValueChange) onValueChange(v);
        setInternalValue(v);
    };

    return (
        <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

export function TabsList({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
                className
            )}
        >
            {children}
        </div>
    )
}

export function TabsTrigger({ value, className, children, disabled }: { value: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const context = React.useContext(TabsContext);
    const isActive = context?.value === value;

    return (
        <button
            type="button"
            role="tab"
            disabled={disabled}
            aria-selected={isActive}
            data-state={isActive ? "active" : "inactive"}
            onClick={() => context?.onValueChange(value)}
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                isActive && "bg-background text-foreground shadow",
                className
            )}
        >
            {children}
        </button>
    )
}

export function TabsContent({ value, className, children }: { value: string } & React.HTMLAttributes<HTMLDivElement>) {
    const context = React.useContext(TabsContext);
    if (context?.value !== value) return null;

    return (
        <div
            role="tabpanel"
            className={cn(
                "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className
            )}
        >
            {children}
        </div>
    )
}
