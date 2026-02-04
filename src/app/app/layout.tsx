"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/features/shell/AppShell";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [userEmail, setUserEmail] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const checkAuth = async () => {
            // We use getSession() because it works offline (reads from local storage)
            const { data, error } = await supabase.auth.getSession();

            if (error || !data.session) {
                router.push('/login');
            } else {
                setUserEmail(data.session.user.email ?? "");
            }
            setIsLoading(false);
        };

        checkAuth();
    }, [router, supabase]);

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <AppShell userEmail={userEmail}>
            {children}
        </AppShell>
    );
}
