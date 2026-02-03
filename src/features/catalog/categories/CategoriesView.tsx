"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category, UUID } from "@/types/phase0";
import {
    createCategory,
    deleteCategory,
    getMyLocationId,
    listCategories,
    renameCategory,
} from "../categories.api";

export default function CategoriesView() {
    const [locationId, setLocationId] = useState<UUID | null>(null);
    const [items, setItems] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [editId, setEditId] = useState<UUID | null>(null);
    const [editName, setEditName] = useState("");

    const canEdit = useMemo(() => Boolean(locationId), [locationId]);

    async function refresh() {
        const data = await listCategories();
        setItems(data);
    }

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setMsg(null);

                const loc = await getMyLocationId();
                setLocationId(loc);

                await refresh();
            } catch (e: any) {
                setMsg(e?.message ?? "Something went wrong.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function onAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!locationId) return;

        const trimmed = name.trim();
        if (!trimmed) {
            setMsg("Please enter a category name.");
            return;
        }

        try {
            setSaving(true);
            setMsg(null);
            await createCategory(locationId, trimmed);
            setName("");
            await refresh();
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to add category.");
        } finally {
            setSaving(false);
        }
    }

    async function onStartEdit(cat: Category) {
        setEditId(cat.id);
        setEditName(cat.name);
        setMsg(null);
    }

    async function onCancelEdit() {
        setEditId(null);
        setEditName("");
    }

    async function onSaveEdit() {
        if (!locationId || !editId) return;

        const trimmed = editName.trim();
        if (!trimmed) {
            setMsg("Category name cannot be empty.");
            return;
        }

        try {
            setSaving(true);
            setMsg(null);
            await renameCategory(editId, locationId, trimmed);
            await refresh();
            setEditId(null);
            setEditName("");
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to rename category.");
        } finally {
            setSaving(false);
        }
    }

    async function onDelete(cat: Category) {
        if (!locationId) return;

        const ok = window.confirm(`Delete category "${cat.name}"?`);
        if (!ok) return;

        try {
            setSaving(true);
            setMsg(null);
            await deleteCategory(cat.id, locationId);
            await refresh();
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to delete category.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="max-w-2xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Categories</h1>
                    <p className="mt-1 text-sm opacity-70">
                        Phase 0: simple CRUD. RLS ensures you only see your location’s categories.
                    </p>
                </div>
                {locationId ? (
                    <div className="text-xs opacity-70">
                        Location ID: <span className="font-mono">{locationId}</span>
                    </div>
                ) : null}
            </div>

            {msg ? (
                <div className="mt-4 border rounded p-3 text-sm">
                    {msg}
                </div>
            ) : null}

            <form onSubmit={onAdd} className="mt-6 flex gap-2">
                <input
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="New category name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canEdit || saving}
                />
                <button
                    className="border rounded px-3 py-2"
                    type="submit"
                    disabled={!canEdit || saving}
                >
                    {saving ? "Saving..." : "Add"}
                </button>
            </form>

            <div className="mt-6 border rounded">
                <div className="px-3 py-2 border-b text-sm font-medium">
                    {loading ? "Loading..." : `Total: ${items.length}`}
                </div>

                <ul className="divide-y">
                    {!loading && items.length === 0 ? (
                        <li className="px-3 py-3 text-sm opacity-70">No categories yet.</li>
                    ) : null}

                    {items.map((cat) => {
                        const isEditing = editId === cat.id;

                        return (
                            <li key={cat.id} className="px-3 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    {!isEditing ? (
                                        <div className="font-medium truncate">{cat.name}</div>
                                    ) : (
                                        <input
                                            className="w-full border rounded px-3 py-2"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            disabled={saving}
                                        />
                                    )}
                                    <div className="mt-1 text-xs opacity-60 font-mono truncate">
                                        {cat.id}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {!isEditing ? (
                                        <>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={() => onStartEdit(cat)}
                                                disabled={saving}
                                            >
                                                Rename
                                            </button>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={() => onDelete(cat)}
                                                disabled={saving}
                                            >
                                                Delete
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={onSaveEdit}
                                                disabled={saving}
                                            >
                                                Save
                                            </button>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={onCancelEdit}
                                                disabled={saving}
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
