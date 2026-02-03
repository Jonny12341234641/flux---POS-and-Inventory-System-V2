import { createClient } from '@/lib/supabase/server';
import { SalesInvoice } from '@/types/phase0';

export default async function SalesHistoryPage() {
    const supabase = await createClient();

    const { data: invoices, error } = await supabase
        .from('sales_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        return <div className="p-8 text-red-500">Error loading sales: {error.message}</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <h1 className="text-2xl font-bold mb-6">Sales History (Server Data)</h1>
            <p className="text-sm text-gray-500 mb-4">
                This data is fetched directly from Supabase, verifying that synchronization worked.
            </p>

            <div className="bg-white shadow rounded-lg overflow-hidden border">
                {!invoices || invoices.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">No sales found on server.</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-4 font-semibold text-gray-600">Date</th>
                                <th className="p-4 font-semibold text-gray-600">Invoice #</th>
                                <th className="p-4 font-semibold text-gray-600 text-right">Total</th>
                                <th className="p-4 font-semibold text-gray-600 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {invoices.map((inv: any) => (
                                <tr key={inv.id} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-600">
                                        {new Date(inv.created_at).toLocaleString()}
                                    </td>
                                    <td className="p-4 font-medium text-gray-900">
                                        {inv.invoice_number}
                                    </td>
                                    <td className="p-4 text-right font-mono text-gray-900">
                                        ${Number(inv.grand_total).toFixed(2)}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                                            SAVED
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
