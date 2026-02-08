'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';

// --- Zod Schema ---
const transferLineSchema = z.object({
    item_id: z.string().min(1, "Item is required"),
    quantity: z.number().min(0.001, "Quantity must be greater than 0"),
});

const transferSchema = z.object({
    source_location_id: z.string().min(1, "Source Location is required"),
    target_location_id: z.string().min(1, "Target Location is required"),
    transfer_date: z.string().min(1, "Date is required"),
    notes: z.string().optional(),
    lines: z.array(transferLineSchema).min(1, "At least one item is required"),
});

type TransferFormValues = z.infer<typeof transferSchema>;

export default function TransferOutForm() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load Master Data
    const locations = useLiveQuery(() => db.locations.toArray());
    const items = useLiveQuery(() => db.items.toArray());
    const balances = useLiveQuery(() => db.stock_balances.toArray());

    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<TransferFormValues>({
        resolver: zodResolver(transferSchema),
        defaultValues: {
            transfer_date: format(new Date(), 'yyyy-MM-dd'),
            lines: [{ item_id: '', quantity: 1 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "lines"
    });

    const onSubmit = async (data: TransferFormValues) => {
        if (data.source_location_id === data.target_location_id) {
            toast.error("Source and Target locations must be different");
            return;
        }

        // Validate Stock
        for (const [index, line] of data.lines.entries()) {
            const itemBalances = balances?.filter(b =>
                b.location_id === data.source_location_id &&
                b.item_id === line.item_id
            );
            const totalStock = itemBalances?.reduce((sum, b) => sum + b.quantity_on_hand, 0) || 0;
            const item = items?.find(i => i.id === line.item_id);

            if (totalStock < line.quantity) {
                toast.error(`Line ${index + 1}: Insufficient stock for ${item?.name || 'Item'}. Available: ${totalStock}`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await db.transaction('rw', db.stock_transfers, db.stock_transfer_lines, db.sales_queue, async () => {
                const id = crypto.randomUUID();

                // Create Transfer
                await db.stock_transfers.add({
                    id,
                    source_location_id: data.source_location_id,
                    target_location_id: data.target_location_id,
                    status: 'in_transit', // Immediate send for V1
                    transfer_date: data.transfer_date,
                    notes: data.notes,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    created_by: null
                });

                // Create Lines
                for (const line of data.lines) {
                    const lineId = crypto.randomUUID();
                    const linePayload = {
                        id: lineId,
                        transfer_id: id,
                        item_id: line.item_id,
                        lot_id: null, // Basic transfer for now
                        quantity_sent: line.quantity,
                        quantity_received: null,
                        created_at: new Date().toISOString()
                    };

                    await db.stock_transfer_lines.add(linePayload);

                    // Sync Line
                    await db.sales_queue.add({
                        id: crypto.randomUUID(),
                        entity: 'stock_transfer_lines',
                        action: 'insert',
                        location_id: data.source_location_id,
                        payload: linePayload,
                        status: 'pending',
                        created_at: new Date().toISOString(),
                        attempt_count: 0,
                        last_error: null
                    });
                }

                // Sync Transfer (Triggers RPC)
                await db.sales_queue.add({
                    id: crypto.randomUUID(),
                    entity: 'stock_transfers',
                    action: 'insert', // or update, but logic in sync queue handles status 'in_transit' = RPC
                    location_id: data.source_location_id,
                    payload: {
                        id,
                        source_location_id: data.source_location_id,
                        target_location_id: data.target_location_id,
                        status: 'in_transit',
                        transfer_date: data.transfer_date,
                        notes: data.notes
                    },
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    attempt_count: 0,
                    last_error: null
                });
            });

            toast.success("Transfer Sent!");
            router.push('/app/inventory/transfers');
        } catch (e) {
            console.error(e);
            toast.error("Failed to send transfer");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>Source Branch</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...register('source_location_id')}
                    >
                        <option value="">Select Source</option>
                        {locations?.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                    {errors.source_location_id && <p className="text-red-500 text-sm">{errors.source_location_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Target Branch</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...register('target_location_id')}
                    >
                        <option value="">Select Target</option>
                        {locations?.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                    {errors.target_location_id && <p className="text-red-500 text-sm">{errors.target_location_id.message}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...register('transfer_date')} />
            </div>

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted">
                        <tr>
                            <th className="p-3">Item</th>
                            <th className="p-3 w-32">Qty to Send</th>
                            <th className="p-3 w-32">Available</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {fields.map((field, index) => {
                            const itemId = watch(`lines.${index}.item_id`);
                            const sourceLoc = watch('source_location_id');

                            // Calc available logic
                            const itemBalances = balances?.filter(b =>
                                b.location_id === sourceLoc &&
                                b.item_id === itemId
                            );
                            const totalStock = itemBalances?.reduce((sum, b) => sum + b.quantity_on_hand, 0) || 0;

                            return (
                                <tr key={field.id}>
                                    <td className="p-2">
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            {...register(`lines.${index}.item_id`)}
                                        >
                                            <option value="">Select Item</option>
                                            {items?.map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <Input type="number" step="0.01" {...register(`lines.${index}.quantity`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-2">
                                        {sourceLoc ? totalStock : '-'}
                                    </td>
                                    <td className="p-2 text-right">
                                        <Button variant="ghost" size="icon" onClick={() => remove(index)} type="button">
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="p-4 bg-muted/20">
                    <Button variant="outline" size="sm" onClick={() => append({ item_id: '', quantity: 1 })} type="button">
                        <Plus className="w-4 h-4 mr-2" /> Add Item
                    </Button>
                </div>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                    <Send className="w-4 h-4 mr-2" /> Send Transfer
                </Button>
            </div>
        </form>
    );
}
