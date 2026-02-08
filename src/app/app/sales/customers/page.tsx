"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSyncQueue } from "@/features/sync/useSyncQueue";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Customer } from "@/types/phase0";
import { Users, Plus, Search, RefreshCw, AlertCircle, Save, X } from "lucide-react";

export default function CustomersPage() {
    const { processQueue } = useSyncQueue();
    const [isClient, setIsClient] = useState(false);

    // Dexie Query
    const customers = useLiveQuery(() => db.customers.toArray());

    // Local State
    const [loading, setLoading] = useState(true);
    const [locationId, setLocationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Form State
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Customer>>({
        name: "",
        mobile: "",
        email: "",
        credit_limit: 0,
        credit_days: 0
    });

    useEffect(() => {
        setIsClient(true);
        loadLocation();
    }, []);

    useEffect(() => {
        if (customers) setLoading(false);
    }, [customers]);

    async function loadLocation() {
        try {
            const supabase = createSupabaseBrowserClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error("Not authenticated");

            const localProfile = await db.user_profiles.where('user_id').equals(user.id).first();
            if (localProfile) {
                setLocationId(localProfile.location_id);
                return;
            }

            const { data: profile } = await supabase
                .from('user_profiles')
                .select('location_id')
                .eq('user_id', user.id)
                .single();

            if (profile) {
                setLocationId(profile.location_id);
            } else {
                throw new Error("No location assignment found");
            }
        } catch (err: any) {
            console.error("Location load error:", err);
            setError("Could not load location. Some features may be disabled.");
        }
    }

    const filteredCustomers = customers?.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.mobile && c.mobile.includes(searchTerm))
    ) || [];

    function handleStartEdit(customer?: Customer) {
        if (customer) {
            setEditId(customer.id);
            setFormData({
                name: customer.name,
                mobile: customer.mobile || "",
                email: customer.email || "",
                credit_limit: customer.credit_limit || 0,
                credit_days: customer.credit_days || 0
            });
        } else {
            setEditId(null);
            setFormData({
                name: "",
                mobile: "",
                email: "",
                credit_limit: 0,
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

        const name = formData.name.trim();

        // Duplicate Check (Case-insensitive)
        const duplicate = customers?.find(c =>
            c.name.toLowerCase() === name.toLowerCase() &&
            c.location_id === locationId &&
            c.id !== editId
        );

        if (duplicate) {
            setError("A customer with this name already exists in this location.");
            return;
        }

        try {
            const id = editId || crypto.randomUUID();
            const now = new Date().toISOString();

            const payload: Customer = {
                id,
                location_id: locationId,
                name: name,
                mobile: formData.mobile?.trim() || null,
                email: formData.email?.trim() || null,
                credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
                credit_days: formData.credit_days ? Number(formData.credit_days) : null,
                created_at: now,
                updated_at: now,
                created_by: null
            };

            if (editId) {
                await db.customers.update(id, payload);
            } else {
                await db.customers.add(payload);
            }

            await db.sales_queue.add({
                id: crypto.randomUUID(),
                entity: 'customers',
                action: editId ? 'update' : 'insert',
                location_id: locationId,
                payload: payload,
                status: 'pending',
                created_at: now,
                attempt_count: 0,
                last_error: null
            });

            if (navigator.onLine) {
                processQueue();
            }

            setIsEditing(false);
            setEditId(null);
            setError(null);

        } catch (err: any) {
            console.error("Save error:", err);
            setError("Failed to save customer.");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure?")) return;
        if (!locationId) return;

        try {
            await db.customers.delete(id);

            await db.sales_queue.add({
                id: crypto.randomUUID(),
                entity: 'customers',
                action: 'delete',
                location_id: locationId,
                payload: { id },
                status: 'pending',
                created_at: new Date().toISOString(),
                attempt_count: 0,
                last_error: null
            });

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
                        <Users className="w-6 h-6" />
                        Customers
                    </h1>
                    <p className="text-gray-500 text-sm">Manage your customer database (Offline-First)</p>
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
                        New Customer
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
                        <h2 className="font-semibold text-lg">{editId ? 'Edit Customer' : 'New Customer'}</h2>
                        <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Customer Name *</label>
                            <input
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.name || ""}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. John Doe"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Mobile</label>
                            <input
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.mobile || ""}
                                onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                placeholder="e.g. 0712345678"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Email</label>
                            <input
                                type="email"
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.email || ""}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder="e.g. john@example.com"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Credit Limit</label>
                            <input
                                type="number"
                                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:outline-none"
                                value={formData.credit_limit || ""}
                                onChange={e => setFormData({ ...formData, credit_limit: Number(e.target.value) })}
                                placeholder="e.g. 5000"
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
                            Save Customer
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                <div className="p-4 border-b flex items-center gap-2 bg-gray-50/50">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                        className="bg-transparent border-none text-sm focus:outline-none w-full"
                        placeholder="Search customers..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Mobile</th>
                                <th className="px-4 py-3 font-medium">Email</th>
                                <th className="px-4 py-3 font-medium">Credit</th>
                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
                            ) : filteredCustomers.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No customers found.</td></tr>
                            ) : (
                                filteredCustomers.map(customer => (
                                    <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium">{customer.name}</td>
                                        <td className="px-4 py-3 text-gray-600">{customer.mobile || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{customer.email || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {customer.credit_limit ? `Limit: ${customer.credit_limit}` : ''}
                                            {customer.credit_days ? ` (${customer.credit_days} days)` : ''}
                                            {!customer.credit_limit && !customer.credit_days ? '-' : ''}
                                        </td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button
                                                onClick={() => handleStartEdit(customer)}
                                                className="text-blue-600 hover:underline px-2"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(customer.id)}
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
