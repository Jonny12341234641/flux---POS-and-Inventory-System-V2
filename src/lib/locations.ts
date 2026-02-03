import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentLocationId(supabase: SupabaseClient) {
    // Option A: If you created an RPC function called current_location_id(), use it
    const { data: rpcData, error: rpcError } = await supabase.rpc("current_location_id");

    if (!rpcError && rpcData) {
        // rpcData is usually the uuid string
        return rpcData as string;
    }

    // Option B: Fallback to reading user_profiles
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!userRes.user) throw new Error("Not logged in");

    const { data, error } = await supabase
        .from("user_profiles")
        .select("location_id")
        .eq("user_id", userRes.user.id)
        .single();

    if (error) throw error;
    if (!data?.location_id) throw new Error("No location_id found for this user");

    return data.location_id as string;
}
