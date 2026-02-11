"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
// Utilizing standard HTML dialog or overlay for simplicity since Radix is missing.
// Using a fixed overlay implementation.

interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={() => onOpenChange?.(false)}
            />
            {/* Content Container */}
            <div className="z-50 relative">
                {children}
            </div>
        </div>
    );
}

// Mocking the composition pattern to match shadcn usage
export function DialogContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
            className
        )}>
            {children}
        </div>
    )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
    )
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
    )
}

// Placeholder for Trigger if used, though normally it wraps a button.
// In the current usage, we control open state externally mostly, but standard Radix allows trigger.
// Our usage in ProductSearch passes open/onOpenChange.
export const DialogTrigger = ({ children, onClick, ...props }: any) => {
    // If we were fully implementing, we'd wire this to open state.
    // For now, if the parent controls state, this is just a wrapper or button.
    return <div {...props}>{children}</div>
};
