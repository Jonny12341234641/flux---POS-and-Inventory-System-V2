"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(false);

    async function onLogout() {
        setLoading(true);
        await supabase.auth.signOut();
        setLoading(false);
        router.replace("/login");
    }

    return (
        <button
            onClick={onLogout}
            disabled={loading}
            className="border rounded px-3 py-2 text-sm"
            type="button"
        >
            {loading ? "Logging out..." : "Logout"}
        </button>
    );
}
