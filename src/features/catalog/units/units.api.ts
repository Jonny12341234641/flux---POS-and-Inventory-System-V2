import { createClient } from "@/lib/supabase/client";
import type { Unit, UUID } from "@/types/phase0";

async function getMyLocationId(): Promise<UUID> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("user_profiles")
        .select("location_id")
        .single();

    if (error) throw new Error(error.message);
    if (!data?.location_id) throw new Error("No location_id found for this user.");

    return data.location_id;
}

export async function listUnits(): Promise<Unit[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("units")
        .select("id, location_id, name, short_code, created_at, updated_at, created_by")
        .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Unit[];
}

export async function createUnit(name: string, shortCode: string | null): Promise<void> {
    const supabase = createClient();
    const locationId = await getMyLocationId();

    const { error } = await supabase.from("units").insert({
        location_id: locationId,
        name,
        short_code: shortCode,
    });

    if (error) throw new Error(error.message);
}

export async function updateUnit(
    id: UUID,
    name: string,
    shortCode: string | null
): Promise<void> {
    const supabase = createClient();
    const locationId = await getMyLocationId();

    const { error } = await supabase
        .from("units")
        .update({
            name,
            short_code: shortCode,
        })
        .eq("id", id)
        .eq("location_id", locationId);

    if (error) throw new Error(error.message);
}

export async function deleteUnit(id: UUID): Promise<void> {
    const supabase = createClient();
    const locationId = await getMyLocationId();

    const { error } = await supabase
        .from("units")
        .delete()
        .eq("id", id)
        .eq("location_id", locationId);

    if (error) throw new Error(error.message);
}
