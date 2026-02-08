"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSyncQueue } from "@/features/sync/useSyncQueue";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Supplier } from "@/types/phase0";
import { FileText, Plus, Search, RefreshCw, AlertCircle, Save, X } from "lucide-react";

export default function SuppliersPage() {
    const { processQueue } = useSyncQueue();
    const [isClient, setIsClient] = useState(false);

    // Dexie Query
    const suppliers = useLiveQuery(() => db.suppliers.toArray());

    // Local State
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Form State
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Supplier>>({
        name: "",
        supplier_no: "",
        contact_info: "",
        credit_days: 0
    });

    useEffect(() => {
        setIsClient(true);
        loadLocation();
    }, []);

    useEffect(() => {
        if (suppliers) setLoading(false);
    }, [suppliers]);

    async function loadLocation() {
        try {
            const supabase = createSupabaseBrowserClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error("Not authenticated");

            // Try local first
            const localProfile = await db.user_profiles.where('user_id').equals(user.id).first();
            if (localProfile) {
                setLocationId(localProfile.location_id);
                return;
            }

            // Fallback to server (should update local profile in real app)
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('location_id')
                .eq('user_id', user.id)
                .single();

            if (profile) {
                setLocationId(profile.location_id);
                // Optionally save to local db here
            } else {
                throw new Error("No location assignment found");
            }
        } catch (err: any) {
            console.error("Location load error:", err);
            setError("Could not load location. Some features may be disabled.");
        }
    }

    const filteredSuppliers = suppliers?.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.supplier_no && s.supplier_no.toLowerCase().includes(searchTerm.toLowerCase()))
    ) || [];

    function handleStartEdit(supplier?: Supplier) {
        if (supplier) {
            setEditId(supplier.id);
            setFormData({
                name: supplier.name,
                supplier_no: supplier.supplier_no || "",
                contact_info: supplier.contact_info || "",
                credit_days: supplier.credit_days || 0
            });
        } else {
            setEditId(null);
            setFormData({
                name: "",
                supplier_no: "",
                contact_info: "",
                credit_days: 0
            });
        }
        setIsEditing(true);
        setError(null);
    }

    async function handleSave() {
        if (!locationId) {
            setError("Location ID missing. Cannot save.");
            return;
        }
        if (!formData.name?.trim()) {
            setError("Name is required.");
            return;
        }

        try {
            const id = editId || crypto.randomUUID();
            const now = new Date().toISOString();

            const payload: Supplier = {
                id,
                location_id: locationId,
                name: formData.name.trim(),
                supplier_no: formData.supplier_no?.trim() || null,
                contact_info: formData.contact_info?.trim() || null,
                credit_days: formData.credit_days ? Number(formData.credit_days) : null,
                created_at: now, // This will be overwritten by server on sync usually, but good for local
                updated_at: now,
                created_by: null // Can't easily get this offline without storing it
            };

            // 1. Save to Local Dexie
            if (editId) {
                await db.suppliers.update(id, payload);
            } else {
                await db.suppliers.add(payload);
            }

            // 2. Add to Outbox
            await db.sales_queue.add({
                id: crypto.randomUUID(),
                entity: 'suppliers',
                action: editId ? 'update' : 'insert',
                location_id: locationId,
                payload: payload,
                status: 'pending',
                created_at: now,
                attempt_count: 0,
                last_error: null
            });

            // 3. Trigger Sync
            if (navigator.onLine) {
                processQueue();
            }

            setIsEditing(false);
            setEditId(null);
            setError(null);

        } catch (err: any) {
            console.error("Save error:", err);
            setError("Failed to save supplier.");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure?")) return;
        if (!locationId) return;

        try {
            // 1. Delete from Local
            await db.suppliers.delete(id);

            // 2. Add to Outbox
            await db.sales_queue.add({
                id: crypto.randomUUID(),
                entity: 'suppliers',
                action: 'delete',
                location_id: locationId,
                payload: { id },
                status: 'pending',
                created_at: new Date().toISOString(),
                attempt_count: 0,
                last_error: null
            });

            // 3. Trigger Sync
            if (navigator.onLine) processQueue();

        } catch (err) {
            console.error("Delete error:", err);
            setError("Failed to delete.");
        }
    }

    if (!isClient) return null;

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="w-6 h-6" />
                        Suppliers
                    </h1>
                    <p className="text-gray-500 text-sm">Manage your supplier database (Offline-First)</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => processQueue()}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700 transition"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Sync
                    </button>
                    <button
                        onClick={() => handleStartEdit()}
                        className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded shadow transition"
                    >
                        <Plus className="w-4 h-4" />
                        New Supplier
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {isEditing && (
                <div className="bg-white border rounded-lg p-6 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-lg">{editId ? 'Edit Supplier' : 'New Supplier'}</h2>
                        <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Supplier Name *</label>
                            <input
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.name || ""}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Acme Corp"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Supplier No.</label>
                            <input
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.supplier_no || ""}
                                onChange={e => setFormData({ ...formData, supplier_no: e.target.value })}
                                placeholder="e.g. SUP-001"
                            />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium">Contact Info</label>
                            <input
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.contact_info || ""}
                                onChange={e => setFormData({ ...formData, contact_info: e.target.value })}
                                placeholder="Email, Phone, Address..."
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Credit Days</label>
                            <input
                                type="number"
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.credit_days || ""}
                                onChange={e => setFormData({ ...formData, credit_days: Number(e.target.value) })}
                                placeholder="e.g. 30"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 border rounded text-sm hover:bg-gray-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800 transition"
                        >
                            <Save className="w-4 h-4" />
                            Save Supplier
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                <div className="p-4 border-b flex items-center gap-2 bg-gray-50/50">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                        className="bg-transparent border-none text-sm focus:outline-none w-full"
                        placeholder="Search suppliers..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Supplier No</th>
                                <th className="px-4 py-3 font-medium">Contact</th>
                                <th className="px-4 py-3 font-medium">Credit Days</th>
                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
                            ) : filteredSuppliers.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No suppliers found.</td></tr>
                            ) : (
                                filteredSuppliers.map(supplier => (
                                    <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium">{supplier.name}</td>
                                        <td className="px-4 py-3 text-gray-600">{supplier.supplier_no || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{supplier.contact_info || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600">{supplier.credit_days || '-'}</td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button
                                                onClick={() => handleStartEdit(supplier)}
                                                className="text-blue-600 hover:underline px-2"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(supplier.id)}
                                                className="text-red-600 hover:underline px-2"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
