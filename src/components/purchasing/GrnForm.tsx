'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Save, Send } from 'lucide-react';
import { Item, Supplier } from '@/types/phase0';
import { toast } from 'sonner';

// --- Zod Schema ---
const grnLineSchema = z.object({
    item_id: z.string().min(1, "Item is required"),
    quantity: z.number().min(0.001, "Quantity must be greater than 0"),
    cost: z.number().min(0, "Cost must be positive"),
    batch_number: z.string().optional(),
    expiry_date: z.string().optional(),
});

const grnSchema = z.object({
    supplier_id: z.string().min(1, "Supplier is required"),
    received_date: z.string().min(1, "Date is required"),
    reference_number: z.string().optional(),
    lines: z.array(grnLineSchema).min(1, "At least one item is required"),
});

type GrnFormValues = z.infer<typeof grnSchema>;

export default function GrnForm({ grnId }: { grnId?: string }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load Master Data
    const suppliers = useLiveQuery(() => db.suppliers.toArray());
    const items = useLiveQuery(() => db.items.toArray());

    // Form Setup
    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<GrnFormValues>({
        resolver: zodResolver(grnSchema),
        defaultValues: {
            received_date: format(new Date(), 'yyyy-MM-dd'),
            lines: [{ item_id: '', quantity: 1, cost: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "lines"
    });

    // Load existing GRN if editing
    useEffect(() => {
        if (grnId) {
            db.grns.get(grnId).then(async (grn) => {
                if (grn && grn.status === 'draft') {
                    const lines = await db.grn_lines.where('grn_id').equals(grn.id).toArray();
                    // Fetch batch/expiry from stock_lots if needed? 
                    // Actually, grn_lines stores lot_id, need to resolve that to batch/expiry for UI?
                    // For simplicity in this sprint, we might store batch/expiry in grn_lines momentarily or resolve it.
                    // Let's assume for now we just load basic line info.

                    setValue('supplier_id', grn.supplier_id || '');
                    setValue('received_date', grn.received_date ? format(new Date(grn.received_date), 'yyyy-MM-dd') : '');
                    setValue('reference_number', grn.reference_number || '');

                    // Map lines (This part is tricky if we normalization batch info. 
                    // If we stored lot_id, we need to fetch lot info to show batch no.
                    // For now, let's assume lines just load basic info and user re-enters if missing?)
                    // A better approach for V1: Store batch/expiry in grn_lines as transient data or 
                    // fetch the lot.

                    const formattedLines = await Promise.all(lines.map(async l => {
                        let batch_number = '';
                        let expiry_date = '';
                        if (l.lot_id) {
                            const lot = await db.stock_lots.get(l.lot_id);
                            if (lot) {
                                batch_number = lot.batch_number || '';
                                expiry_date = lot.expiry_date ? format(new Date(lot.expiry_date), 'yyyy-MM-dd') : '';
                            }
                        }
                        return {
                            item_id: l.item_id,
                            quantity: l.quantity,
                            cost: l.cost,
                            batch_number,
                            expiry_date
                        };
                    }));

                    setValue('lines', formattedLines.length ? formattedLines : [{ item_id: '', quantity: 1, cost: 0 }]);
                }
            });
        }
    }, [grnId, setValue]);

    // Submit Handler
    const onSubmit = async (data: GrnFormValues, event?: React.BaseSyntheticEvent) => {
        // Determine action: Save Draft or Post
        // We can use a separate state or argument, but RHF handleSubmit passes data.
        // Let's attach the action type to the button click if possible, or use a state.
        // For now, let's assume the button sets a ref or state.
    };

    const handleSave = async (status: 'draft' | 'posted') => {
        setIsSubmitting(true);
        try {
            await handleSubmit(async (data) => {
                // 1. Validation Logic for Batch/Expiry
                for (const [index, line] of data.lines.entries()) {
                    const item = items?.find(i => i.id === line.item_id);
                    if (item?.is_batch_tracked) {
                        if (!line.batch_number) {
                            toast.error(`Line ${index + 1}: Batch Number is required for ${item.name}`);
                            throw new Error("Validation Failed");
                        }
                        if (!line.expiry_date) {
                            toast.error(`Line ${index + 1}: Expiry Date is required for ${item.name}`);
                            throw new Error("Validation Failed");
                        }
                    }
                }

                // 2. Prepare Transaction
                await db.transaction('rw', db.grns, db.grn_lines, db.stock_lots, db.sales_queue, async () => {
                    // Upsert GRN
                    // If new, generate ID
                    const id = grnId || crypto.randomUUID();

                    await db.grns.put({
                        id,
                        location_id: 'UNKNOWN', // Should get from context/auth
                        supplier_id: data.supplier_id,
                        received_date: new Date(data.received_date).toISOString(),
                        reference_number: data.reference_number || null,
                        status: status,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        created_by: null // Should get from auth
                    });

                    // Handle Lines
                    // First delete existing lines if edit
                    if (grnId) {
                        await db.grn_lines.where('grn_id').equals(grnId).delete();
                    }

                    for (const line of data.lines) {
                        // Handle Lot
                        let lot_id = null;
                        const item = items?.find(i => i.id === line.item_id);

                        if (item?.is_batch_tracked && line.batch_number) {
                            // Create or Find Lot
                            // In a real app we might search existing lots for this item/batch
                            // For simplicity, we create a new lot entry or find one.
                            // Ideally we check if it exists.
                            const existingLot = await db.stock_lots
                                .where({ item_id: line.item_id, batch_number: line.batch_number })
                                .first();

                            if (existingLot) {
                                lot_id = existingLot.id;
                            } else {
                                lot_id = crypto.randomUUID();
                                await db.stock_lots.add({
                                    id: lot_id,
                                    location_id: 'UNKNOWN',
                                    item_id: line.item_id,
                                    batch_number: line.batch_number,
                                    expiry_date: line.expiry_date ? new Date(line.expiry_date).toISOString() : null,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                    created_by: null
                                });
                                // Also queue lot sync!
                                await db.sales_queue.add({
                                    id: crypto.randomUUID(),
                                    entity: 'stock_lots',
                                    action: 'insert',
                                    location_id: 'UNKNOWN',
                                    payload: {
                                        id: lot_id,
                                        location_id: 'UNKNOWN', // TODO: Fix this
                                        item_id: line.item_id,
                                        batch_number: line.batch_number,
                                        expiry_date: line.expiry_date ? new Date(line.expiry_date).toISOString() : null
                                    },
                                    status: 'pending',
                                    created_at: new Date().toISOString(),
                                    attempt_count: 0,
                                    last_error: null
                                });
                            }
                        }

                        const lineId = crypto.randomUUID();
                        const linePayload = {
                            id: lineId,
                            grn_id: id,
                            location_id: 'UNKNOWN',
                            item_id: line.item_id,
                            lot_id,
                            quantity: line.quantity,
                            cost: line.cost,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            created_by: null
                        };

                        await db.grn_lines.add(linePayload);

                        // Queue Line Sync
                        // CRITICAL: Lines must be synced before or with the GRN for the RPC to work?
                        // The RPC reads from `grn_lines` table. So lines MUST be inserted into Supabase `grn_lines` table.
                        // The `post_grn` RPC just updates the status of the `grns` table and processes the lines.
                        // So we must ensure `grn_lines` are synced.
                        await db.sales_queue.add({
                            id: crypto.randomUUID(),
                            entity: 'grn_lines',
                            action: 'insert',
                            location_id: 'UNKNOWN',
                            payload: linePayload,
                            status: 'pending',
                            created_at: new Date().toISOString(),
                            attempt_count: 0,
                            last_error: null
                        });
                    }

                    // Queue for Sync
                    await db.sales_queue.add({
                        id: crypto.randomUUID(),
                        entity: 'grns',
                        action: grnId ? 'update' : 'insert', // If posted, logic handles RPC call
                        location_id: 'UNKNOWN',
                        payload: {
                            id,
                            location_id: 'UNKNOWN',
                            supplier_id: data.supplier_id,
                            received_date: new Date(data.received_date).toISOString(),
                            reference_number: data.reference_number || null,
                            status: status
                        },
                        status: 'pending',
                        created_at: new Date().toISOString(),
                        attempt_count: 0,
                        last_error: null
                    });

                    // If posted, we might want to eagerly queue lines too?
                    // The backend RPC post_grn expects lines to be there. 
                    // So we MUST sync grn_lines too.
                    // We did loop above, but we didn't queue grn_lines. Let's fix that.
                    // Actually, for the RPC to work, the lines must exist in Supabase `grn_lines`.
                    // So we need to sync them.
                });

                // Re-loop for queuing lines (since we need transaction separation or just do it inside)
                // Ideally should be one transaction. 
                // I'll add the queue inside the loop above in next iteration/fix.

                toast.success(status === 'posted' ? "GRN Posted!" : "Draft Saved");
                router.push('/app/purchasing/grn');
            })();
        } catch (e) {
            console.error(e);
            // toast.error("Failed to save GRN");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <Label>Supplier</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={watch('supplier_id')}
                        onChange={(e) => setValue('supplier_id', e.target.value)}
                    >
                        <option value="" disabled>Select Supplier</option>
                        {suppliers?.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    {errors.supplier_id && <p className="text-red-500 text-sm">{errors.supplier_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Received Date</Label>
                    <Input type="date" {...register('received_date')} />
                    {errors.received_date && <p className="text-red-500 text-sm">{errors.received_date.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Reference No</Label>
                    <Input {...register('reference_number')} placeholder="Invoice/DO No" />
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted">
                        <tr>
                            <th className="p-3">Item</th>
                            <th className="p-3 w-24">Qty</th>
                            <th className="p-3 w-24">Cost</th>
                            <th className="p-3 w-32">Batch</th>
                            <th className="p-3 w-32">Expiry</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {fields.map((field, index) => {
                            const itemId = watch(`lines.${index}.item_id`);
                            const selectedItem = items?.find(i => i.id === itemId);
                            const isBatch = selectedItem?.is_batch_tracked;

                            return (
                                <tr key={field.id}>
                                    <td className="p-2">
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={itemId}
                                            onChange={(e) => setValue(`lines.${index}.item_id`, e.target.value)}
                                        >
                                            <option value="" disabled>Select Item</option>
                                            {items?.map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <Input type="number" step="0.01" {...register(`lines.${index}.quantity`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-2">
                                        <Input type="number" step="0.01" {...register(`lines.${index}.cost`, { valueAsNumber: true })} />
                                    </td>
                                    <td className="p-2">
                                        <Input disabled={!isBatch} placeholder={isBatch ? "Batch #" : "-"} {...register(`lines.${index}.batch_number`)} />
                                    </td>
                                    <td className="p-2">
                                        <Input type="date" disabled={!isBatch} {...register(`lines.${index}.expiry_date`)} />
                                    </td>
                                    <td className="p-2 text-right">
                                        <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="p-4 bg-muted/20">
                    <Button variant="outline" size="sm" onClick={() => append({ item_id: '', quantity: 1, cost: 0 })}>
                        <Plus className="w-4 h-4 mr-2" /> Add Line
                    </Button>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => handleSave('draft')} disabled={isSubmitting}>
                    <Save className="w-4 h-4 mr-2" /> Save Draft
                </Button>
                <Button onClick={() => handleSave('posted')} disabled={isSubmitting}>
                    <Send className="w-4 h-4 mr-2" /> Post & Sync
                </Button>
            </div>
        </div>
    );
}
