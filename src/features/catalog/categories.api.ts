import { createClient } from "@/lib/supabase/client";
import type { Category, UUID } from "@/types/phase0";

export async function getMyLocationId(): Promise<UUID> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("user_profiles")
        .select("location_id")
        .single();

    if (error) throw new Error(error.message);
    if (!data?.location_id) throw new Error("No location_id found for this user.");

    return data.location_id;
}

export async function listCategories(): Promise<Category[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("categories")
        .select("id, location_id, name, created_at, updated_at, created_by")
        .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Category[];
}

export async function createCategory(locationId: UUID, name: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase.from("categories").insert({
        location_id: locationId,
        name,
    });

    if (error) throw new Error(error.message);
}

export async function renameCategory(id: UUID, locationId: UUID, name: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
        .from("categories")
        .update({ name })
        .eq("id", id)
        .eq("location_id", locationId);

    if (error) throw new Error(error.message);
}

export async function deleteCategory(id: UUID, locationId: UUID): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("location_id", locationId);

    if (error) throw new Error(error.message);
}
