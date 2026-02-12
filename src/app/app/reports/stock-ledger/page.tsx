'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client'; // Adjust path if needed
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; // Create if missing or use standard
import { exportToCSV } from '@/lib/exportUtils';
import { Loader2, Download, AlertTriangle, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Types
interface StockMoveReportItem {
    move_id: string;
    created_at: string;
    item_name: string;
    batch_number: string | null;
    move_type: string;
    quantity: number;
    reference_id: string | null;
    user_name: string | null;
}

export default function StockLedgerPage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<StockMoveReportItem[]>([]);
    const [isOffline, setIsOffline] = useState(false);

    // Filters
    // Default to last 30 days
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [locationId, setLocationId] = useState<string>(''); // Should come from user context
    const [searchTerm, setSearchTerm] = useState('');

    const supabase = createClient();

    // Fetch user location on mount
    useEffect(() => {
        const fetchUserLocation = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Try to get from local DB profile or just use a default/fallback
                // Ideally we query user_profiles table.
                const profile = await db.user_profiles.get(user.id);
                if (profile?.location_id) {
                    setLocationId(profile.location_id);
                } else {
                    // Fallback or handle missing profile
                }
            }
        };
        fetchUserLocation();
    }, []);

    const fetchData = async () => {
        if (!locationId) return;
        setLoading(true);
        setIsOffline(false);

        try {
            // Try Online First
            const { data: reportData, error } = await supabase.rpc('get_stock_ledger', {
                p_start_date: new Date(startDate).toISOString(),
                p_end_date: new Date(endDate + 'T23:59:59').toISOString(), // End of day
                p_location_id: locationId,
                p_item_id: null // TODO: Add item picker to valid UUID
            });

            if (error) throw error;
            setData(reportData || []);

        } catch (err) {
            console.error("Report fetch error:", err);
            // Fallback to Offline
            setIsOffline(true);
            try {
                // Approximate from Dexter
                // Note: Dexie 'stock_moves' might not have all joins populated (item names, etc)
                // We depend on what we stored.
                // If we didn't store item_name in stock_moves, we need to fetch items separate.

                // Query moves
                const start = new Date(startDate).getTime();
                const end = new Date(endDate + 'T23:59:59').getTime();

                // Use the compound index [location_id+created_at] if possible or just filter
                // Dexie doesn't natively support compound ranges smoothly without specific plugin sometimes, 
                // but [location_id+created_at] allows between() on the compound key if we structure queries right.
                // Or key range: [locationId, startDate] -> [locationId, endDate]

                const moves = await db.stock_moves
                    .where('[location_id+created_at]')
                    .between([locationId, new Date(startDate)], [locationId, new Date(endDate + 'T23:59:59')])
                    .toArray();

                // Enrich with Item Names manually
                const enriched = await Promise.all(moves.map(async m => {
                    const item = await db.items.get(m.item_id);
                    return {
                        move_id: m.id,
                        created_at: m.created_at,
                        item_name: item?.name || 'Unknown Item',
                        batch_number: 'Cached', // Might need lot lookup
                        move_type: m.move_type,
                        quantity: m.quantity,
                        reference_id: m.reference_id,
                        user_name: 'Local User'
                    } as StockMoveReportItem;
                }));

                setData(enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

            } catch (dexieErr) {
                console.error("Offline fallback failed:", dexieErr);
            }
        } finally {
            setLoading(false);
        }
    };

    // Auto-fetch when filters change (debounced slightly? or just button)
    // Let's use a button for explicit report generation to save calls
    // useEffect(() => { fetchData() }, [startDate, endDate, locationId]);

    const handleExport = () => {
        exportToCSV(data, `StockLedger_${startDate}_${endDate}.csv`);
    };

    // Client-side filtering for Search Term (Item Name)
    const filteredData = data.filter(item =>
        item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.reference_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="grid gap-2">
                        <Label>Start Date</Label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>End Date</Label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                    <Button onClick={fetchData} disabled={loading || !locationId}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Generate Report
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExport} disabled={filteredData.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                </div>
            </div>

            {isOffline && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md flex items-center gap-2 text-sm">
                    <WifiOff className="h-4 w-4" />
                    <span><strong>Offline Mode:</strong> Displaying local cached data. Some details may be missing or outdated. Move online for full history.</span>
                </div>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Stock Movements</CardTitle>
                    <div className="w-64">
                        <Input
                            placeholder="Filter by item or reference..."
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
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Item</th>
                                    <th className="p-3">Batch</th>
                                    <th className="p-3">Type</th>
                                    <th className="p-3 text-right">Qty</th>
                                    <th className="p-3">Reference</th>
                                    <th className="p-3">User</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-4 text-center text-muted-foreground">
                                            {loading ? "Loading..." : "No records found."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((row) => (
                                        <tr key={row.move_id} className="hover:bg-gray-50">
                                            <td className="p-3 whitespace-nowrap">
                                                {new Date(row.created_at).toLocaleString()}
                                            </td>
                                            <td className="p-3 font-medium">{row.item_name}</td>
                                            <td className="p-3">{row.batch_number || '-'}</td>
                                            <td className="p-3">
                                                <Badge variant="outline" className="uppercase text-[10px]">
                                                    {row.move_type}
                                                </Badge>
                                            </td>
                                            <td className={`p-3 text-right font-mono ${row.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {row.quantity > 0 ? '+' : ''}{row.quantity}
                                            </td>
                                            <td className="p-3 text-xs text-gray-500">{row.reference_id || '-'}</td>
                                            <td className="p-3 text-xs">{row.user_name || 'System'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground text-center">
                        Showing {filteredData.length} records
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
