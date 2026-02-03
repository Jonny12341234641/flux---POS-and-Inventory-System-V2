"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SupabaseTestPage() {
    const [status, setStatus] = useState("Checking...");

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getSession().then(({ data, error }) => {
            if (error) {
                setStatus(`Error: ${error.message}`);
                return;
            }
            setStatus(data.session ? "✅ Session exists" : "✅ No session (normal if not logged in)");
        });
    }, []);

    return (
        <main className="p-6">
            <h1 className="text-xl font-semibold">Supabase Test</h1>
            <p className="mt-2">{status}</p>
        </main>
    );
}
