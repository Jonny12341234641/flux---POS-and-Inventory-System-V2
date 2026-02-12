'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { exportToCSV } from '@/lib/exportUtils';
import { Loader2, Download, WifiOff, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BatchExpiryItem {
    item_name: string;
    batch_number: string;
    expiry_date: string;
    quantity_on_hand: number;
    days_until_expiry: number;
}

export default function BatchExpiryPage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<BatchExpiryItem[]>([]);
    const [isOffline, setIsOffline] = useState(false);
    const [daysThreshold, setDaysThreshold] = useState(90); // Default 3 months
    const [locationId, setLocationId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

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
            const { data: reportData, error } = await supabase.rpc('get_batch_expiry_report', {
                p_location_id: locationId,
                p_days_threshold: daysThreshold
            });

            if (error) throw error;
            setData(reportData || []);

        } catch (err) {
            console.error("Report fetch error:", err);
            setIsOffline(true);
            try {
                // Dexie Fallback
                // Find lots expiring soon
                const thresholdDate = new Date();
                thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
                const thresholdISO = thresholdDate.toISOString().split('T')[0];

                // Get all lots for this location that expire before threshold
                // Note: Dexie query might be inefficient if we don't have perfect index.
                // We have 'location_id' and 'expiry_date' indexes but not compound in v5/v6 fully reliable for this specific range scan without manual filter if not compound.
                // We added [location_id+expiry_date] in v6, so we can use it!

                const lots = await db.stock_lots
                    .where('[location_id+expiry_date]')
                    .between(
                        [locationId, '1970-01-01'], // Start of time
                        [locationId, thresholdISO],
                        true, // include lower
                        true  // include upper
                    )
                    .toArray();

                const results: BatchExpiryItem[] = [];

                for (const lot of lots) {
                    // Check balance
                    const balance = await db.stock_balances
                        .where({ location_id: locationId, lot_id: lot.id })
                        .first();

                    if (balance && balance.quantity_on_hand > 0) {
                        const item = await db.items.get(lot.item_id);
                        const expDate = new Date(lot.expiry_date!);
                        const today = new Date();
                        const days = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

                        results.push({
                            item_name: item?.name ?? 'Unknown',
                            batch_number: lot.batch_number ?? '',
                            expiry_date: lot.expiry_date!,
                            quantity_on_hand: balance.quantity_on_hand,
                            days_until_expiry: days
                        });
                    }
                }

                setData(results.sort((a, b) => a.days_until_expiry - b.days_until_expiry));

            } catch (dexieErr) {
                console.error("Offline fallback failed:", dexieErr);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        exportToCSV(data, `BatchExpiry_${daysThreshold}days.csv`);
    };

    const filteredData = data.filter(item =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.batch_number.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                <div className="flex items-end gap-4">
                    <div className="grid gap-2 w-48">
                        <Label>Days Threshold</Label>
                        <Input
                            type="number"
                            min="1"
                            value={daysThreshold}
                            onChange={e => setDaysThreshold(parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <Button onClick={fetchData} disabled={loading || !locationId}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Generate
                    </Button>
                </div>
                <Button variant="outline" onClick={handleExport} disabled={filteredData.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
            </div>

            {isOffline && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md flex items-center gap-2 text-sm">
                    <WifiOff className="h-4 w-4" />
                    <span><strong>Offline Mode:</strong> Displaying local cached data.</span>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Batch Expiry Report</CardTitle>
                    <div className="w-64">
                        <Input
                            placeholder="Search item or batch..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                <tr>
                                    <th className="p-3">Item</th>
                                    <th className="p-3">Batch Number</th>
                                    <th className="p-3">Expiry Date</th>
                                    <th className="p-3">Days Left</th>
                                    <th className="p-3 text-right">Qty On Hand</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                            {loading ? "Loading..." : "No expiring batches found."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-3 font-medium">{row.item_name}</td>
                                            <td className="p-3 font-mono">{row.batch_number}</td>
                                            <td className="p-3">{new Date(row.expiry_date).toLocaleDateString()}</td>
                                            <td className={`p-3 font-bold ${row.days_until_expiry <= 0 ? 'text-red-600' : row.days_until_expiry < 30 ? 'text-amber-600' : 'text-gray-700'}`}>
                                                {row.days_until_expiry} days
                                            </td>
                                            <td className="p-3 text-right">{row.quantity_on_hand}</td>
                                            <td className="p-3">
                                                {row.days_until_expiry <= 0 ? (
                                                    <Badge variant="destructive">Expired</Badge>
                                                ) : row.days_until_expiry < 30 ? (
                                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">Expiring Soon</Badge>
                                                ) : (
                                                    <Badge variant="outline">Good</Badge>
                                                )}
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
