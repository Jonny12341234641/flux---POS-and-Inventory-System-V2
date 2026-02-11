'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ArrowLeft, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'; 
// Replaced with standard HTML table structure due to missing UI component.

interface ReturnItem {
    lineId: string;
    itemId: string;
    itemName: string;
    soldQty: number;
    returnQty: number;
    unitPrice: number;
    lotId?: string | null;
    selected: boolean;
}

export default function ReturnsPage() {
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoice, setInvoice] = useState<any>(null);
    const [items, setItems] = useState<ReturnItem[]>([]);
    const [reason, setReason] = useState('defective');
    const [locationId, setLocationId] = useState<string>('');
    const [userId, setUserId] = useState<string>('');

    // Initialize: Get Location & User
    useEffect(() => {
        const init = async () => {
            const loc = await db.locations.limit(1).first();
            if (loc) setLocationId(loc.id);
            const profile = await db.user_profiles.limit(1).first();
            if (profile) setUserId(profile.user_id);
            else setUserId('00000000-0000-0000-0000-000000000000');
        };
        init();
    }, []);

    const handleSearch = async () => {
        if (!invoiceNumber.trim()) return;

        try {
            // Find invoice
            const inv = await db.sales_invoices.where('invoice_number').equals(invoiceNumber.trim()).first();

            if (!inv) {
                toast.error('Invoice not found');
                setInvoice(null);
                setItems([]);
                return;
            }

            // Find lines
            const lines = await db.sales_invoice_lines.where('invoice_id').equals(inv.id).toArray();

            // Map to items with names
            const mappedItems: ReturnItem[] = await Promise.all(lines.map(async l => {
                const itemDef = await db.items.get(l.item_id);
                return {
                    lineId: l.id,
                    itemId: l.item_id,
                    itemName: itemDef?.name || 'Unknown Item',
                    soldQty: l.qty,
                    returnQty: 0,
                    unitPrice: l.unit_price,
                    lotId: l.lot_id,
                    selected: false
                };
            }));

            setInvoice(inv);
            setItems(mappedItems);

        } catch (e) {
            console.error(e);
            toast.error('Error searching invoice');
        }
    };

    const handleProcessReturn = async () => {
        const selected = items.filter(i => i.selected && i.returnQty > 0);
        if (selected.length === 0) {
            toast.error('No items selected for return');
            return;
        }

        try {
            const returnId = crypto.randomUUID();
            const refundTotal = selected.reduce((sum, i) => sum + (i.returnQty * i.unitPrice), 0);
            const returnNumber = `RET-${Date.now().toString().slice(-6)}`;

            const payload = {
                return: {
                    id: returnId,
                    location_id: locationId,
                    original_invoice_id: invoice.id,
                    return_number: returnNumber,
                    status: 'posted', // Auto-post
                    reason: reason,
                    refund_amount: refundTotal,
                    created_at: new Date().toISOString(),
                    created_by: userId
                },
                lines: selected.map(i => ({
                    id: crypto.randomUUID(),
                    return_id: returnId,
                    item_id: i.itemId,
                    lot_id: i.lotId,
                    qty: i.returnQty,
                    refund_amount: i.returnQty * i.unitPrice,
                    created_at: new Date().toISOString()
                }))
            };

            await db.sales_queue.add({
                id: crypto.randomUUID(),
                entity: 'sales_return',
                action: 'insert',
                location_id: locationId,
                payload: payload,
                status: 'pending',
                created_at: new Date().toISOString(),
                attempt_count: 0,
                last_error: null
            });

            toast.success(`Return Processed! ID: ${returnNumber}`);
            setInvoice(null);
            setItems([]);
            setInvoiceNumber('');

        } catch (e) {
            console.error(e);
            toast.error('Failed to process return');
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <RefreshCw className="text-indigo-600" />
                Sales Returns
            </h1>

            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base font-medium">Find Invoice</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Scan or type Invoice #"
                            className="pl-9"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button onClick={handleSearch}>Lookup</Button>
                </CardContent>
            </Card>

            {invoice && (
                <Card className="bg-white border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                    <CardHeader className="flex flex-row justify-between items-center border-b border-slate-50 pb-4">
                        <div>
                            <CardTitle className="text-lg">Invoice #{invoice.invoice_number}</CardTitle>
                            <p className="text-sm text-slate-500">Date: {new Date(invoice.created_at).toLocaleDateString()}</p>
                        </div>
                        <Badge variant="outline" className={invoice.status === 'posted' ? 'bg-green-50 text-green-700 border-green-200' : ''}>
                            {invoice.status.toUpperCase()}
                        </Badge>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="rounded-md border border-slate-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                    <tr>
                                        <th className="p-3 w-10">Select</th>
                                        <th className="p-3">Item</th>
                                        <th className="p-3 text-right">Sold Qty</th>
                                        <th className="p-3 text-right">Return Qty</th>
                                        <th className="p-3 text-right">Refund</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.map((item, idx) => (
                                        <tr key={`${item.lineId}-${idx}`} className={item.selected ? 'bg-indigo-50/30' : ''}>
                                            <td className="p-3">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={item.selected}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setItems(prev => {
                                                            const next = [...prev];
                                                            next[idx].selected = checked;
                                                            if (checked && next[idx].returnQty === 0) {
                                                                next[idx].returnQty = 1; // Default to 1
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </td>
                                            <td className="p-3">
                                                <div className="font-medium text-slate-900">{item.itemName}</div>
                                                <div className="text-xs text-slate-500">${item.unitPrice.toFixed(2)} / unit</div>
                                            </td>
                                            <td className="p-3 text-right text-slate-600">{item.soldQty}</td>
                                            <td className="p-3 text-right">
                                                <Input
                                                    type="number"
                                                    className="w-20 h-8 text-right ml-auto"
                                                    value={item.returnQty}
                                                    min={0}
                                                    max={item.soldQty}
                                                    disabled={!item.selected}
                                                    onChange={(e) => {
                                                        const val = Math.min(item.soldQty, Math.max(0, parseInt(e.target.value) || 0));
                                                        setItems(prev => {
                                                            const next = [...prev];
                                                            next[idx].returnQty = val;
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-medium text-slate-900">
                                                ${(item.returnQty * item.unitPrice).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-6 flex flex-col md:flex-row justify-between items-end gap-4">
                            <div className="w-full md:w-1/3 space-y-2">
                                <label className="text-sm font-medium text-slate-700">Reason for Return</label>
                                <select
                                    className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                >
                                    <option value="defective">Defective / Damaged</option>
                                    <option value="wrong_item">Wrong Item Sent</option>
                                    <option value="customer_changed_mind">Customer Changed Mind</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                <div className="text-sm text-slate-500">Total Refund Amount</div>
                                <div className="text-2xl font-bold text-slate-900">
                                    ${items.reduce((sum, i) => sum + (i.selected ? i.returnQty * i.unitPrice : 0), 0).toFixed(2)}
                                </div>
                                <Button className="w-full md:w-auto bg-red-600 hover:bg-red-700" onClick={handleProcessReturn}>
                                    Process Refund
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
