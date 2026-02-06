"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { useSyncQueue } from "@/features/sync/useSyncQueue";
import { useLiveQuery } from "dexie-react-hooks";

export default function SyncTestPage() {
    const { processQueue, isProcessing } = useSyncQueue();
    const queueItems = useLiveQuery(() => db.sales_queue.toArray());
    const [log, setLog] = useState<string[]>([]);

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    // 1. SYNC RELIABILITY SETUP
    const createPendingSale = async () => {
        const id = crypto.randomUUID();
        await db.sales_queue.add({
            id,
            entity: "sales_invoices",
            action: "insert",
            location_id: "test-loc-1", // Ensure this matches your RLS policy
            payload: {
                invoice: { id, invoice_number: "TEST-001", grand_total: 100 },
                lines: []
            },
            status: "pending", // Lowercase per your useSyncQueue.ts logic
            created_at: new Date().toISOString(),
            attempt_count: 0,
            last_error: null
        });
        addLog(`Created Pending Sale: ${id}`);
    };

    // 3. IDEMPOTENCY TEST SETUP
    const resetToPending = async (id: string) => {
        await db.sales_queue.update(id, { status: "pending", last_error: null });
        addLog(`Reset Item ${id} to PENDING (Simulating retry)`);
    };

    return (
        <div className="p-8 space-y-6">
            <h1 className="text-2xl font-bold">Phase 0: Sync Reliability Lab</h1>

            <div className="flex gap-4">
                <button onClick={createPendingSale} className="px-4 py-2 bg-blue-600 text-white rounded">
                    1. Create Offline Sale
                </button>
                <button onClick={() => processQueue()} disabled={isProcessing} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">
                    {isProcessing ? "Syncing..." : "2. Force Sync Now"}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="border p-4 rounded bg-gray-50">
                    <h2 className="font-semibold mb-2">Outbox Queue (IndexedDB)</h2>
                    {queueItems?.map(item => (
                        <div key={item.id} className="border-b py-2 text-sm">
                            <div className="flex justify-between">
                                <span className="font-mono">{item.id.slice(0, 8)}...</span>
                                <span className={`px-2 rounded text-xs ${item.status === 'synced' ? 'bg-green-100 text-green-800' :
                                        item.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-yellow-100'
                                    }`}>
                                    {item.status.toUpperCase()}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500">Attempts: {item.attempt_count}</div>
                            {item.last_error && <div className="text-xs text-red-500 mt-1">{item.last_error}</div>}

                            {/* Idempotency Test Button */}
                            {item.status === 'synced' && (
                                <button onClick={() => resetToPending(item.id)} className="text-blue-600 text-xs underline mt-1">
                                    Test Idempotency (Reset to Pending)
                                </button>
                            )}
                        </div>
                    ))}
                    {queueItems?.length === 0 && <p className="text-gray-400 italic">Queue is empty</p>}
                </div>

                <div className="border p-4 rounded bg-black text-green-400 font-mono text-sm h-64 overflow-y-auto">
                    {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
}
