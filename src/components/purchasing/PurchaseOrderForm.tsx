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
import { Trash2, Plus, Save, CheckCircle, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';

// --- Zod Schema ---
const poLineSchema = z.object({
    item_id: z.string().min(1, "Item is required"),
    quantity_ordered: z.number().min(0.001, "Quantity must be greater than 0"),
    unit_cost: z.number().min(0, "Cost must be positive"), // Estimated cost
});

const poSchema = z.object({
    supplier_id: z.string().min(1, "Supplier is required"),
    expected_date: z.string().optional(),
    reference_number: z.string().optional(),
    notes: z.string().optional(),
    lines: z.array(poLineSchema).min(1, "At least one item is required"),
});

type PoFormValues = z.infer<typeof poSchema>;

export default function PurchaseOrderForm({ poId }: { poId?: string }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<'draft' | 'approved' | 'received' | 'closed'>('draft');

    // Load Master Data
    const suppliers = useLiveQuery(() => db.suppliers.toArray());
    const items = useLiveQuery(() => db.items.toArray());

    // Form Setup
    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<PoFormValues>({
        resolver: zodResolver(poSchema),
        defaultValues: {
            expected_date: format(new Date(), 'yyyy-MM-dd'),
            lines: [{ item_id: '', quantity_ordered: 1, unit_cost: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "lines"
    });

    // Load existing PO if editing
    useEffect(() => {
        if (poId) {
            db.purchase_orders.get(poId).then(async (po) => {
                if (po) {
                    setStatus(po.status);

                    const lines = await db.purchase_order_lines.where('po_id').equals(po.id).toArray();

                    setValue('supplier_id', po.supplier_id || '');
                    setValue('expected_date', po.expected_date ? format(new Date(po.expected_date), 'yyyy-MM-dd') : '');
                    setValue('reference_number', po.reference_number || '');
                    setValue('notes', po.notes || '');

                    const formattedLines = lines.map(l => ({
                        item_id: l.item_id,
                        quantity_ordered: l.quantity_ordered,
                        unit_cost: l.unit_cost || 0
                    }));

                    setValue('lines', formattedLines.length ? formattedLines : [{ item_id: '', quantity_ordered: 1, unit_cost: 0 }]);
                }
            });
        }
    }, [poId, setValue]);

    const handleSave = async (targetStatus: 'draft' | 'approved') => {
        setIsSubmitting(true);
        try {
            await handleSubmit(async (data) => {
                await db.transaction('rw', db.purchase_orders, db.purchase_order_lines, db.sales_queue, async () => {
                    const id = poId || crypto.randomUUID();

                    // Upsert PO
                    await db.purchase_orders.put({
                        id,
                        location_id: 'UNKNOWN', // Should get from context
                        supplier_id: data.supplier_id,
                        expected_date: data.expected_date ? new Date(data.expected_date).toISOString() : null,
                        reference_number: data.reference_number || null,
                        notes: data.notes || null,
                        status: targetStatus,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        created_by: null
                    });

                    // Handle Lines
                    if (poId) {
                        await db.purchase_order_lines.where('po_id').equals(poId).delete();
                    }

                    for (const line of data.lines) {
                        const lineId = crypto.randomUUID();
                        const linePayload = {
                            id: lineId,
                            po_id: id,
                            item_id: line.item_id,
                            quantity_ordered: line.quantity_ordered,
                            unit_cost: line.unit_cost,
                            created_at: new Date().toISOString()
                        };

                        await db.purchase_order_lines.add(linePayload);

                        // Queue Line Sync
                        await db.sales_queue.add({
                            id: crypto.randomUUID(),
                            entity: 'purchase_order_lines',
                            action: 'insert',
                            location_id: 'UNKNOWN',
                            payload: linePayload,
                            status: 'pending',
                            created_at: new Date().toISOString(),
                            attempt_count: 0,
                            last_error: null
                        });
                    }

                    // Queue PO Sync
                    await db.sales_queue.add({
                        id: crypto.randomUUID(),
                        entity: 'purchase_orders',
                        action: poId ? 'update' : 'insert',
                        location_id: 'UNKNOWN',
                        payload: {
                            id,
                            location_id: 'UNKNOWN',
                            supplier_id: data.supplier_id,
                            status: targetStatus,
                            expected_date: data.expected_date ? new Date(data.expected_date).toISOString() : null,
                            reference_number: data.reference_number || null,
                            notes: data.notes || null
                        },
                        status: 'pending',
                        created_at: new Date().toISOString(),
                        attempt_count: 0,
                        last_error: null
                    });
                });

                toast.success(targetStatus === 'approved' ? "PO Approved!" : "Draft Saved");
                router.push('/app/purchasing/orders');
            })();
        } catch (e) {
            console.error(e);
            toast.error("Failed to save PO");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReceive = () => {
        // Proceed to GRN Page with PO ID as query param
        // Assuming we create a way to init GRN from PO
        // For now, just navigate
        router.push(`/app/purchasing/grn/new?po_id=${poId}`);
    }

    const isReadOnly = status !== 'draft';

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <Label>Supplier</Label>
                    <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={watch('supplier_id')}
                        onChange={(e) => setValue('supplier_id', e.target.value)}
                        disabled={isReadOnly}
                    >
                        <option value="" disabled>Select Supplier</option>
                        {suppliers?.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    {errors.supplier_id && <p className="text-red-500 text-sm">{errors.supplier_id.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Expected Date</Label>
                    <Input type="date" {...register('expected_date')} disabled={isReadOnly} />
                </div>

                <div className="space-y-2">
                    <Label>Reference No / Quote</Label>
                    <Input {...register('reference_number')} disabled={isReadOnly} />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Notes</Label>
                <Input {...register('notes')} disabled={isReadOnly} />
            </div>

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted">
                        <tr>
                            <th className="p-3">Item</th>
                            <th className="p-3 w-32">Qty Ordered</th>
                            <th className="p-3 w-32">Est. Cost</th>
                            <th className="p-3 w-32">Total</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {fields.map((field, index) => {
                            const itemId = watch(`lines.${index}.item_id`);
                            const qty = watch(`lines.${index}.quantity_ordered`) || 0;
                            const cost = watch(`lines.${index}.unit_cost`) || 0;

                            return (
                                <tr key={field.id}>
                                    <td className="p-2">
                                        <select
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={itemId}
                                            onChange={(e) => setValue(`lines.${index}.item_id`, e.target.value)}
                                            disabled={isReadOnly}
                                        >
                                            <option value="" disabled>Select Item</option>
                                            {items?.map(i => (
                                                <option key={i.id} value={i.id}>{i.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-2">
                                        <Input type="number" step="1" {...register(`lines.${index}.quantity_ordered`, { valueAsNumber: true })} disabled={isReadOnly} />
                                    </td>
                                    <td className="p-2">
                                        <Input type="number" step="0.01" {...register(`lines.${index}.unit_cost`, { valueAsNumber: true })} disabled={isReadOnly} />
                                    </td>
                                    <td className="p-2">
                                        {(qty * cost).toFixed(2)}
                                    </td>
                                    <td className="p-2 text-right">
                                        {!isReadOnly && (
                                            <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!isReadOnly && (
                    <div className="p-4 bg-muted/20">
                        <Button variant="outline" size="sm" onClick={() => append({ item_id: '', quantity_ordered: 1, unit_cost: 0 })}>
                            <Plus className="w-4 h-4 mr-2" /> Add Item
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-4">
                {status === 'draft' && (
                    <>
                        <Button variant="outline" onClick={() => handleSave('draft')} disabled={isSubmitting}>
                            <Save className="w-4 h-4 mr-2" /> Save Draft
                        </Button>
                        <Button onClick={() => handleSave('approved')} disabled={isSubmitting}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Approve
                        </Button>
                    </>
                )}
                {status === 'approved' && (
                    <Button onClick={handleReceive} className="bg-green-600 hover:bg-green-700">
                        <PackageCheck className="w-4 h-4 mr-2" /> Receive Stock
                    </Button>
                )}
            </div>
        </div>
    );
}
