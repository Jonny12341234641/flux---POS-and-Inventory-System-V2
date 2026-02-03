import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/features/shell/AppShell";

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    // This protects ALL /app/* pages in one place
    if (!data.user) {
        redirect("/login");
    }

    return (
        <AppShell userEmail={data.user.email ?? ""}>
            {children}
        </AppShell>
    );
}
