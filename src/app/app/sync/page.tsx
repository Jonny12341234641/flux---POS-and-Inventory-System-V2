'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { OutboxItem, SalesInvoice, SalesInvoiceLine } from '@/types/phase0';

type SalesPayload = {
    invoice: SalesInvoice;
    lines: SalesInvoiceLine[];
};

export default function SyncPage() {
    const queue = useLiveQuery(
        () => db.sales_queue.orderBy('created_at').reverse().toArray()
    );

    if (!queue) return <div className="p-8 text-gray-500">Loading queue...</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Sync Queue</h1>
                    <p className="text-gray-500 text-sm">Offline transactions waiting to sync.</p>
                </div>
                <div className="bg-gray-100 px-3 py-1 rounded text-sm font-medium">
                    Pending: {queue.filter(q => q.attempt_count === 0 && !q.last_error).length}
                </div>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden border">
                {queue.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">
                        Queue is empty. All local data is synced or no offline actions taken.
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-4 font-semibold text-gray-600">Time</th>
                                <th className="p-4 font-semibold text-gray-600">Type</th>
                                <th className="p-4 font-semibold text-gray-600">Details</th>
                                <th className="p-4 font-semibold text-gray-600 text-right">Amount</th>
                                <th className="p-4 font-semibold text-gray-600 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {queue.map((item) => {
                                // Attempt to extract amount if it's a sale
                                let amountDisplay = '-';
                                let details: string = item.entity;

                                if (item.entity === 'sales_invoices' && item.payload) {
                                    const payload = item.payload as SalesPayload;
                                    if (payload.invoice?.grand_total) {
                                        amountDisplay = `$${payload.invoice.grand_total.toFixed(2)}`;
                                        details = `Invoice #${payload.invoice.invoice_number}`;
                                    }
                                }

                                // Determine status badge
                                let statusColor = 'bg-yellow-100 text-yellow-800';
                                let statusText = 'PENDING';

                                if (item.last_error) {
                                    statusColor = 'bg-red-100 text-red-800';
                                    statusText = 'FAILED';
                                }
                                // We don't have a 'synced' status in the store usually, as synced items are removed from queue,
                                // but if we kept them, we'd check that. For now, queue is pending/failed.

                                return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="p-4 whitespace-nowrap text-gray-600">
                                            {new Date(item.created_at).toLocaleString()}
                                        </td>
                                        <td className="p-4 capitalize">
                                            {item.entity.replace('_', ' ')}
                                        </td>
                                        <td className="p-4 text-gray-700 font-medium">
                                            {details}
                                            {item.last_error && (
                                                <div className="text-red-500 text-xs mt-1 truncate max-w-[200px]">
                                                    {item.last_error}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono text-gray-900">
                                            {amountDisplay}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                                                {statusText}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
