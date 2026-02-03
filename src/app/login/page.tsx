"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const supabase = createClient();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [msg, setMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setLoading(false);

        if (error) {
            setMsg(error.message);
            return;
        }

        router.replace("/app");
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-6">
            <form
                onSubmit={onSubmit}
                className="w-full max-w-sm border rounded-lg p-6"
            >
                <h1 className="text-xl font-semibold">Login</h1>

                <label className="block mt-4 text-sm">
                    Email
                    <input
                        className="mt-1 w-full border rounded px-3 py-2"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="usera@example.com"
                        autoComplete="email"
                    />
                </label>

                <label className="block mt-4 text-sm">
                    Password
                    <input
                        className="mt-1 w-full border rounded px-3 py-2"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                    />
                </label>

                {msg ? <p className="mt-3 text-sm">{msg}</p> : null}

                <button
                    type="submit"
                    className="mt-5 w-full border rounded px-3 py-2"
                    disabled={loading}
                >
                    {loading ? "Logging in..." : "Login"}
                </button>

                <p className="mt-3 text-xs opacity-70">
                    After login you will be redirected to /app.
                </p>
            </form>
        </main>
    );
}
