import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

// export default async function AppHome() {
//     const supabase = await createClient();
//     const { data } = await supabase.auth.getUser();

//     if (!data.user) {
//         redirect("/login");
//     }

//     return (
//         <main className="p-6">
//             <div className="flex items-center justify-between gap-4">
//                 <div>
//                     <h1 className="text-2xl font-semibold">Flux App</h1>
//                     <p className="mt-2">✅ You are logged in.</p>
//                     <p className="mt-1 text-sm opacity-70">{data.user.email}</p>
//                 </div>

//                 <LogoutButton />
//             </div>
//         </main>
//     );
// }

export default async function AppHome() {
    return (
        <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="mt-2 opacity-80">
                Phase 0 walking skeleton: Catalog → POS → Offline Queue → Sync.
            </p>
        </div>
    );
}

