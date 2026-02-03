"use client";

import { useEffect, useState } from "react";
import type { Unit, UUID } from "@/types/phase0";
import { createUnit, deleteUnit, listUnits, updateUnit } from "./units.api";

export default function UnitsView() {
    const [items, setItems] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [shortCode, setShortCode] = useState("");

    const [editId, setEditId] = useState<UUID | null>(null);
    const [editName, setEditName] = useState("");
    const [editShortCode, setEditShortCode] = useState("");

    async function refresh() {
        const data = await listUnits();
        setItems(data);
    }

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setMsg(null);
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

        const n = name.trim();
        const sc = shortCode.trim();

        if (!n) {
            setMsg("Please enter a unit name.");
            return;
        }

        try {
            setSaving(true);
            setMsg(null);
            await createUnit(n, sc ? sc : null);
            setName("");
            setShortCode("");
            await refresh();
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to add unit.");
        } finally {
            setSaving(false);
        }
    }

    function onStartEdit(u: Unit) {
        setEditId(u.id);
        setEditName(u.name);
        setEditShortCode(u.short_code ?? "");
        setMsg(null);
    }

    function onCancelEdit() {
        setEditId(null);
        setEditName("");
        setEditShortCode("");
    }

    async function onSaveEdit() {
        if (!editId) return;

        const n = editName.trim();
        const sc = editShortCode.trim();

        if (!n) {
            setMsg("Unit name cannot be empty.");
            return;
        }

        try {
            setSaving(true);
            setMsg(null);
            await updateUnit(editId, n, sc ? sc : null);
            await refresh();
            onCancelEdit();
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to update unit.");
        } finally {
            setSaving(false);
        }
    }

    async function onDelete(u: Unit) {
        const ok = window.confirm(`Delete unit "${u.name}"?`);
        if (!ok) return;

        try {
            setSaving(true);
            setMsg(null);
            await deleteUnit(u.id);
            await refresh();
        } catch (e: any) {
            setMsg(e?.message ?? "Failed to delete unit.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="max-w-2xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Units</h1>
                    <p className="mt-1 text-sm opacity-70">
                        Phase 0: simple CRUD. RLS ensures you only see your location’s units.
                    </p>
                </div>
            </div>

            {msg ? (
                <div className="mt-4 border rounded p-3 text-sm">{msg}</div>
            ) : null}

            <form onSubmit={onAdd} className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                    className="border rounded px-3 py-2 sm:col-span-2"
                    placeholder="Unit name (e.g., Pieces)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                />
                <input
                    className="border rounded px-3 py-2"
                    placeholder="Short code (e.g., PCS)"
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value)}
                    disabled={saving}
                />

                <button
                    className="border rounded px-3 py-2 sm:col-span-3"
                    type="submit"
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Add Unit"}
                </button>
            </form>

            <div className="mt-6 border rounded">
                <div className="px-3 py-2 border-b text-sm font-medium">
                    {loading ? "Loading..." : `Total: ${items.length}`}
                </div>

                <ul className="divide-y">
                    {!loading && items.length === 0 ? (
                        <li className="px-3 py-3 text-sm opacity-70">No units yet.</li>
                    ) : null}

                    {items.map((u) => {
                        const isEditing = editId === u.id;

                        return (
                            <li key={u.id} className="px-3 py-3 flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    {!isEditing ? (
                                        <>
                                            <div className="font-medium truncate">
                                                {u.name}
                                                {u.short_code ? (
                                                    <span className="ml-2 text-xs opacity-70">({u.short_code})</span>
                                                ) : null}
                                            </div>
                                            <div className="mt-1 text-xs opacity-60 font-mono truncate">
                                                {u.id}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <input
                                                className="border rounded px-3 py-2 sm:col-span-2"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                disabled={saving}
                                            />
                                            <input
                                                className="border rounded px-3 py-2"
                                                value={editShortCode}
                                                onChange={(e) => setEditShortCode(e.target.value)}
                                                disabled={saving}
                                                placeholder="Short code"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    {!isEditing ? (
                                        <>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={() => onStartEdit(u)}
                                                disabled={saving}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="border rounded px-3 py-2 text-sm"
                                                type="button"
                                                onClick={() => onDelete(u)}
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
