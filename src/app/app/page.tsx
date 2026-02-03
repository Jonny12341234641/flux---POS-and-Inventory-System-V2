import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppHome() {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
        redirect("/login");
    }

    return (
        <main className="p-6">
            <h1 className="text-2xl font-semibold">Flux App</h1>
            <p className="mt-2">✅ You are logged in.</p>
        </main>
    );
}
