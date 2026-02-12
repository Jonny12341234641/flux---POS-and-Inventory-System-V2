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

interface PurchaseSummaryItem {
    grn_number: string;
    received_date: string;
    supplier_name: string;
    status: string;
    po_reference: string | null;
    item_count: number;
}

export default function PurchaseSummaryPage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<PurchaseSummaryItem[]>([]);
    const [isOffline, setIsOffline] = useState(false);
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
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
            const { data: reportData, error } = await supabase.rpc('get_purchase_summary', {
                p_start_date: new Date(startDate).toISOString(),
                p_end_date: new Date(endDate + 'T23:59:59').toISOString(),
                p_location_id: locationId
            });

            if (error) throw error;
            setData(reportData || []);

        } catch (err) {
            console.error("Report fetch error:", err);
            setIsOffline(true);
            try {
                // Dexie Fallback
                // Query GRNs
                // Unfortunately we don't have [location_id+received_date] index on grns in db.ts yet?
                // Checked db.ts: grns: 'id, location_id, supplier_id, status, received_date'
                // We can use compound index or simple filter.

                const grns = await db.grns
                    .where('location_id').equals(locationId)
                    .and(g => {
                        const d = new Date(g.received_date);
                        return d >= new Date(startDate) && d <= new Date(endDate + 'T23:59:59');
                    })
                    .toArray();

                const enriched = await Promise.all(grns.map(async g => {
                    const supplier = await db.suppliers.get(g.supplier_id);
                    const lineCount = await db.grn_lines.where('grn_id').equals(g.id).count();
                    const po = g.po_id ? await db.purchase_orders.get(g.po_id) : null;

                    return {
                        grn_number: g.grn_number || 'Local',
                        received_date: g.received_date,
                        supplier_name: supplier?.name || 'Unknown',
                        status: g.status,
                        po_reference: po?.po_number || null,
                        item_count: lineCount
                    } as PurchaseSummaryItem;
                }));

                setData(enriched.sort((a, b) => new Date(b.received_date).getTime() - new Date(a.received_date).getTime()));

            } catch (dexieErr) {
                console.error("Offline fallback failed:", dexieErr);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        exportToCSV(data, `PurchaseSummary_${startDate}_to_${endDate}.csv`);
    };

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
                    <span><strong>Offline Mode:</strong> Displaying local cached GRNs.</span>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Goods Received History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                <tr>
                                    <th className="p-3">GRN #</th>
                                    <th className="p-3">Received Date</th>
                                    <th className="p-3">Supplier</th>
                                    <th className="p-3">PO Ref</th>
                                    <th className="p-3 text-right">Items</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                            {loading ? "Loading..." : "No records found."}
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-3 font-mono font-medium">{row.grn_number}</td>
                                            <td className="p-3 whitespace-nowrap">{new Date(row.received_date).toLocaleDateString()}</td>
                                            <td className="p-3">{row.supplier_name}</td>
                                            <td className="p-3 text-xs text-gray-500">{row.po_reference || '-'}</td>
                                            <td className="p-3 text-right">{row.item_count}</td>
                                            <td className="p-3">
                                                <Badge variant="outline" className="uppercase text-[10px] bg-green-50 text-green-700 border-green-200">
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
