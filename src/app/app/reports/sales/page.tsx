'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToCSV } from '@/lib/exportUtils';
import { Loader2, Download, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SalesSummaryItem {
    invoice_number: string;
    created_at: string;
    customer_name: string | null;
    total_amount: number;
    status: string;
    payment_method: string | null;
    cashier_name: string | null;
}

export default function SalesSummaryPage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SalesSummaryItem[]>([]);
    const [isOffline, setIsOffline] = useState(false);
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]); // Last 7 days
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [locationId, setLocationId] = useState<string>('');
    const supabase = createClient();

    useEffect(() => {
        const fetchUserLocation = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const profile = await db.user_profiles.get(user.id);
                if (profile?.location_id) setLocationId(profile.location_id);
            }
        };
        fetchUserLocation();
    }, []);

    const fetchData = async () => {
        if (!locationId) return;
        setLoading(true);
        setIsOffline(false);

        try {
            const { data: reportData, error } = await supabase.rpc('get_sales_summary', {
                p_start_date: new Date(startDate).toISOString(),
                p_end_date: new Date(endDate + 'T23:59:59').toISOString(),
                p_location_id: locationId,
                p_cashier_id: null
            });

            if (error) throw error;
            setData(reportData || []);

        } catch (err) {
            console.error("Report fetch error:", err);
            setIsOffline(true);
            try {
                // Dexie Fallback
                // sales_invoices
                const invoices = await db.sales_invoices
                    .where('[location_id+created_at]') // Ensure this index exists in db.ts v6
                    .between([locationId, new Date(startDate)], [locationId, new Date(endDate + 'T23:59:59')])
                    .toArray();

                // Enrich
                const enriched = await Promise.all(invoices.map(async inv => {
                    const customer = inv.customer_id ? await db.customers.get(inv.customer_id) : null;
                    const payment = await db.payments.where('invoice_id').equals(inv.id).first();

                    return {
                        invoice_number: inv.invoice_number,
                        created_at: inv.created_at,
                        customer_name: customer?.name || 'Guest',
                        total_amount: inv.total_amount || 0, // Ensure field exists in dexie types or cast
                        status: inv.status,
                        payment_method: payment?.validation_method || 'Unknown',
                        cashier_name: 'Local User'
                    } as SalesSummaryItem;
                }));

                setData(enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

            } catch (dexieErr) {
                console.error("Offline fallback failed:", dexieErr);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        exportToCSV(data, `SalesSummary_${startDate}_to_${endDate}.csv`);
    };

    // Calculate totals
    const totalSales = data.reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="grid gap-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label>End Date</Label>
                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <Button onClick={fetchData} disabled={loading || !locationId}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Generate
                    </Button>
                </div>
                <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
            </div>

            {isOffline && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md flex items-center gap-2 text-sm">
                    <WifiOff className="h-4 w-4" />
                    <span><strong>Offline Mode:</strong> Displaying local cached sales.</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalSales.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Sales History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                <tr>
                                    <th className="p-3">Invoice #</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Customer</th>
                                    <th className="p-3">Cashier</th>
                                    <th className="p-3">Method</th>
                                    <th className="p-3 text-right">Amount</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-4 text-center text-muted-foreground">
                                            {loading ? "Loading..." : "No sales found for period."}
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row) => (
                                        <tr key={row.invoice_number} className="hover:bg-gray-50">
                                            <td className="p-3 font-mono font-medium">{row.invoice_number}</td>
                                            <td className="p-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                                            <td className="p-3">{row.customer_name || 'Guest'}</td>
                                            <td className="p-3 text-xs text-gray-500">{row.cashier_name}</td>
                                            <td className="p-3 capitalize">{row.payment_method}</td>
                                            <td className="p-3 text-right font-semibold">${Number(row.total_amount).toFixed(2)}</td>
                                            <td className="p-3">
                                                <Badge variant={row.status === 'completed' || row.status === 'paid' ? 'default' : 'secondary'}>
                                                    {row.status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
