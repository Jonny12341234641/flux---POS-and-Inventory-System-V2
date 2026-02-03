"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getCurrentLocationId } from "@/lib/locations";

type Category = { id: string; name: string };
// CHANGED: symbol -> short_code
type Unit = { id: string; name: string; short_code: string | null };

type ItemRow = {
    id: string;
    name: string;
    barcode: string | null;
    sale_price: string | null; // numeric comes back as string
    cost: string | null;  // numeric comes back as string
    category_id: string;
    unit_id: string;
    category?: { name: string } | null;
    // CHANGED: symbol -> short_code
    unit?: { name: string; short_code: string | null } | null;
};

function friendlyErrorMessage(msg: string) {
    const m = msg.toLowerCase();

    // barcode unique constraint hint
    if (m.includes("ux_items_barcode") || m.includes("duplicate key") || m.includes("unique")) {
        return "Barcode already exists in this location. Please use a different barcode.";
    }

    // RLS hint
    if (m.includes("row-level security") || m.includes("rls")) {
        return "Not allowed (RLS). Check user location assignment and policies.";
    }

    return msg;
}

export default function ItemsPage() {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [locationId, setLocationId] = useState<string | null>(null);

    const [categories, setCategories] = useState<Category[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [items, setItems] = useState<ItemRow[]>([]);

    // form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [barcode, setBarcode] = useState("");
    const [salePrice, setSalePrice] = useState(""); // keep as string (safe for NUMERIC)
    const [cost, setCost] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [unitId, setUnitId] = useState("");

    function resetForm() {
        setEditingId(null);
        setName("");
        setBarcode("");
        setSalePrice("");
        setCost("");
        setCategoryId("");
        setUnitId("");
    }

    async function loadAll() {
        setError(null);
        setLoading(true);

        try {
            const loc = await getCurrentLocationId(supabase);
            setLocationId(loc);

            // Categories
            const catRes = await supabase
                .from("categories")
                .select("id, name")
                .order("name", { ascending: true });

            if (catRes.error) throw catRes.error;
            setCategories((catRes.data ?? []) as Category[]);

            // Units
            // CHANGED: symbol -> short_code
            const unitRes = await supabase
                .from("units")
                .select("id, name, short_code")
                .order("name", { ascending: true });

            if (unitRes.error) throw unitRes.error;
            setUnits((unitRes.data ?? []) as Unit[]);

            // Items (join names for display)
            // CHANGED: unit:units(name, symbol) -> unit:units(name, short_code)
            const itemRes = await supabase
                .from("items")
                .select(
                    `
          id,
          name,
          barcode,
          sale_price,
          cost,
          category_id,
          unit_id,
          category:categories(name),
          unit:units(name, short_code)
        `
                )
                .order("created_at", { ascending: false });

            if (itemRes.error) throw itemRes.error;
            const rawData = itemRes.data ?? [];
            const mappedItems: ItemRow[] = rawData.map((item: any) => ({
                ...item,
                category: Array.isArray(item.category) ? item.category[0] : item.category,
                unit: Array.isArray(item.unit) ? item.unit[0] : item.unit,
            }));
            setItems(mappedItems);
        } catch (e: any) {
            setError(friendlyErrorMessage(e?.message ?? String(e)));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function startEdit(row: ItemRow) {
        setError(null);
        setEditingId(row.id);
        setName(row.name ?? "");
        setBarcode(row.barcode ?? "");
        setSalePrice(row.sale_price ?? "");
        setCost(row.cost ?? "");
        setCategoryId(row.category_id ?? "");
        setUnitId(row.unit_id ?? "");
    }

    async function onSave() {
        setError(null);

        if (!name.trim()) {
            setError("Name is required.");
            return;
        }
        if (!categoryId) {
            setError("Category is required.");
            return;
        }
        if (!unitId) {
            setError("Unit is required.");
            return;
        }
        if (!locationId) {
            setError("Location is not loaded. Please refresh.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                barcode: barcode.trim() ? barcode.trim() : null,
                sale_price: salePrice.trim() ? salePrice.trim() : null,
                cost: cost.trim() ? cost.trim() : null,
                category_id: categoryId,
                unit_id: unitId,
                location_id: locationId,
            };

            if (!editingId) {
                const ins = await supabase.from("items").insert(payload).select().single();
                if (ins.error) throw ins.error;
            } else {
                const upd = await supabase.from("items").update(payload).eq("id", editingId).select().single();
                if (upd.error) throw upd.error;
            }

            resetForm();
            await loadAll();
        } catch (e: any) {
            setError(friendlyErrorMessage(e?.message ?? String(e)));
        } finally {
            setSaving(false);
        }
    }

    async function onDelete(id: string) {
        setError(null);

        const ok = confirm("Delete this item? This cannot be undone.");
        if (!ok) return;

        try {
            const del = await supabase.from("items").delete().eq("id", id);
            if (del.error) throw del.error;

            await loadAll();
        } catch (e: any) {
            setError(friendlyErrorMessage(e?.message ?? String(e)));
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Items</h1>
                    <p className="text-sm text-gray-600">
                        Create and manage item master data. (RLS automatically keeps data within your location.)
                    </p>
                </div>
                <button
                    onClick={loadAll}
                    className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
                    disabled={loading}
                >
                    Refresh
                </button>
            </div>

            {error && (
                <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">
                    {error}
                </div>
            )}

            {/* Form */}
            <div className="border rounded p-4 space-y-4">
                <h2 className="font-medium">
                    {editingId ? "Edit Item" : "New Item"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium">Name *</label>
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Panadol 500mg"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium">Barcode (optional)</label>
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            placeholder="e.g., 8901234567890"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium">Category *</label>
                        <select
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                        >
                            <option value="">Select category</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        {categories.length === 0 && (
                            <p className="text-xs text-gray-600 mt-1">
                                No categories yet. Create at least 1 category first.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-sm font-medium">Unit *</label>
                        <select
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={unitId}
                            onChange={(e) => setUnitId(e.target.value)}
                        >
                            <option value="">Select unit</option>
                            {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {/* CHANGED: u.symbol -> u.short_code */}
                                    {u.name}{u.short_code ? ` (${u.short_code})` : ""}
                                </option>
                            ))}
                        </select>
                        {units.length === 0 && (
                            <p className="text-xs text-gray-600 mt-1">
                                No units yet. Create at least 1 unit first.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-sm font-medium">Price (optional)</label>
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            placeholder="e.g., 120.00"
                            inputMode="decimal"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium">Cost (optional)</label>
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={cost}
                            onChange={(e) => setCost(e.target.value)}
                            placeholder="e.g., 95.00"
                            inputMode="decimal"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onSave}
                        className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                        disabled={saving || loading || categories.length === 0 || units.length === 0}
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>

                    <button
                        onClick={resetForm}
                        className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="border rounded overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="font-medium">Items List</h2>
                    <span className="text-sm text-gray-600">
                        {loading ? "Loading..." : `${items.length} item(s)`}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-white border-b">
                            <tr className="text-left">
                                <th className="p-3">Name</th>
                                <th className="p-3">Barcode</th>
                                <th className="p-3">Category</th>
                                <th className="p-3">Unit</th>
                                <th className="p-3">Sale Price</th>
                                <th className="p-3">Cost</th>
                                <th className="p-3">Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {!loading && items.length === 0 && (
                                <tr>
                                    <td className="p-3 text-gray-600" colSpan={7}>
                                        No items yet.
                                    </td>
                                </tr>
                            )}

                            {items.map((it) => (
                                <tr key={it.id} className="border-t">
                                    <td className="p-3">{it.name}</td>
                                    <td className="p-3">{it.barcode ?? "-"}</td>
                                    <td className="p-3">{it.category?.name ?? "-"}</td>
                                    <td className="p-3">
                                        {it.unit?.name ?? "-"}
                                        {/* CHANGED: it.unit.symbol -> it.unit.short_code */}
                                        {it.unit?.short_code ? ` (${it.unit.short_code})` : ""}
                                    </td>
                                    <td className="p-3">{it.sale_price ?? "-"}</td>
                                    <td className="p-3">{it.cost ?? "-"}</td>
                                    <td className="p-3">
                                        <div className="flex gap-2">
                                            <button
                                                className="px-3 py-1 rounded border hover:bg-gray-50"
                                                onClick={() => startEdit(it)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="px-3 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                                                onClick={() => onDelete(it.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>

                    </table>
                </div>
            </div>

            );
}
