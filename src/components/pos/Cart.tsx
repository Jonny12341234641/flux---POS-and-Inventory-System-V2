'use client';

import React from 'react';
import { Item, StockLot } from '@/types/phase0';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Trash2, Tag } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export interface CartItem {
    item: Item;
    lot?: StockLot;
    qty: number;
    maxQty: number; // Stock availability
    unitPrice: number;
    discountAmount: number; // Per unit
}

interface CartProps {
    items: CartItem[];
    onUpdateQty: (index: number, newQty: number) => void;
    onRemove: (index: number) => void;
    onPayment: () => void;
}

export function Cart({ items, onUpdateQty, onRemove, onPayment }: CartProps) {
    const subtotal = items.reduce((sum, i) => sum + (i.qty * i.unitPrice), 0);
    const totalDiscount = items.reduce((sum, i) => sum + (i.qty * i.discountAmount), 0);
    const netTotal = subtotal - totalDiscount;

    return (
        <Card className="flex flex-col h-full bg-white shadow-lg border-slate-200">
            <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="flex justify-between items-center text-lg">
                    <span>Current Sale</span>
                    <span className="text-sm font-normal text-slate-500">{items.length} Items</span>
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                            <Tag className="h-8 w-8 opacity-40" />
                        </div>
                        <p>Cart is empty</p>
                        <p className="text-xs">Scan items or search to add</p>
                    </div>
                ) : (
                    items.map((line, idx) => (
                        <div key={`${line.item.id}-${line.lot?.id}-${idx}`} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm transition-all group">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-slate-800 text-sm line-clamp-1">{line.item.name}</h4>
                                    <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                        <span>${line.unitPrice.toFixed(2)}</span>
                                        {line.lot && (
                                            <span className="bg-indigo-100 text-indigo-700 px-1 rounded">
                                                Batch: {line.lot.batch_number}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="font-semibold text-slate-900 text-sm">
                                    ${(line.qty * line.unitPrice).toFixed(2)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center gap-1 rounded-md bg-white border border-slate-200">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-none rounded-l-md hover:bg-slate-100"
                                        onClick={() => onUpdateQty(idx, Math.max(1, line.qty - 1))}
                                        disabled={line.qty <= 1}
                                    >
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-8 text-center text-sm font-medium">{line.qty}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-none rounded-r-md hover:bg-slate-100"
                                        onClick={() => onUpdateQty(idx, Math.min(line.maxQty, line.qty + 1))}
                                        disabled={line.qty >= line.maxQty}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => onRemove(idx)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </CardContent>

            <div className="bg-slate-50 p-4 border-t border-slate-200 space-y-3">
                <div className="space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    {totalDiscount > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>Discount</span>
                            <span>-${totalDiscount.toFixed(2)}</span>
                        </div>
                    )}
                </div>
                <Separator />
                <div className="flex justify-between items-end">
                    <span className="text-slate-500 font-medium">Total</span>
                    <span className="text-2xl font-bold text-slate-900">${netTotal.toFixed(2)}</span>
                </div>

                <Button
                    className="w-full h-12 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                    onClick={onPayment}
                    disabled={items.length === 0}
                >
                    Charge ${(netTotal).toFixed(2)}
                </Button>
            </div>
        </Card>
    );
}
