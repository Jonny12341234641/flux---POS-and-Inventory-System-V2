'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditCard, Wallet, Banknote, Smartphone } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalAmount: number;
    onComplete: (payments: Payment[]) => void;
}

export interface Payment {
    method: 'cash' | 'card' | 'credit' | 'other';
    amount: number;
    reference_note?: string;
}

export function PaymentModal({ isOpen, onClose, totalAmount, onComplete }: PaymentModalProps) {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [currentAmount, setCurrentAmount] = useState<string>(totalAmount.toString());
    const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'other'>('cash');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            setPayments([]);
            setCurrentAmount(totalAmount.toString());
            setCurrentMethod('cash');
        }
    }, [isOpen, totalAmount]);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalAmount - totalPaid);

    // Auto-update current amount to remaining when opening or changing
    useEffect(() => {
        if (remaining > 0 && payments.length > 0) {
            setCurrentAmount(remaining.toFixed(2));
        } else if (payments.length === 0) {
            setCurrentAmount(totalAmount.toString());
        }
    }, [totalPaid, totalAmount]);

    const handleAddPayment = () => {
        const amt = parseFloat(currentAmount);
        if (isNaN(amt) || amt <= 0) return;

        if (amt > remaining + 0.01 && currentMethod !== 'cash') {
            alert('Amount exceeds remaining balance');
            return;
        }

        const newPayment: Payment = {
            method: currentMethod,
            amount: amt,
            reference_note: note
        };

        setPayments([...payments, newPayment]);
        setNote('');
        // Reset amount for next payment will happen via effect or manual
        // If paid in full, effect sets remaining to 0
    };

    const handleRemovePayment = (index: number) => {
        const newPayments = [...payments];
        newPayments.splice(index, 1);
        setPayments(newPayments);
    };

    const isComplete = totalPaid >= totalAmount - 0.01; // tolerance
    const changeDue = totalPaid - totalAmount;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Payment</DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    {/* Top Stats */}
                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-500">Total Due</span>
                            <span className="text-2xl font-bold">${totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className={`text-sm ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                {remaining > 0 ? 'Remaining' : 'Change Due'}
                            </span>
                            <span className={`text-xl font-bold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                ${remaining > 0 ? remaining.toFixed(2) : changeDue.toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* Payment Form */}
                    {!isComplete && (
                        <div className="space-y-4">
                            <Tabs value={currentMethod} onValueChange={(v: any) => setCurrentMethod(v)} className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="cash"><Banknote className="w-4 h-4 mr-2" />Cash</TabsTrigger>
                                    <TabsTrigger value="card"><CreditCard className="w-4 h-4 mr-2" />Card</TabsTrigger>
                                    <TabsTrigger value="other"><Wallet className="w-4 h-4 mr-2" />More</TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <div className="grid gap-2">
                                <Label>Amount</Label>
                                <Input
                                    type="number"
                                    value={currentAmount}
                                    onChange={e => setCurrentAmount(e.target.value)}
                                    className="text-lg font-mono"
                                />
                            </div>

                            {currentMethod !== 'cash' && (
                                <div className="grid gap-2">
                                    <Label>Reference Note (Optional)</Label>
                                    <Input
                                        placeholder="Auth Code / Ref"
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                    />
                                </div>
                            )}

                            <Button onClick={handleAddPayment} className="w-full" disabled={parseFloat(currentAmount) <= 0}>
                                Add Payment
                            </Button>
                        </div>
                    )}

                    {/* Payment List */}
                    {payments.length > 0 && (
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Payments Added</Label>
                            <div className="space-y-2">
                                {payments.map((p, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-2 border rounded bg-white text-sm">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">{p.method}</Badge>
                                            {p.reference_note && <span className="text-slate-400 text-xs">({p.reference_note})</span>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold">${p.amount.toFixed(2)}</span>
                                            {!isComplete && (
                                                <Button variant="ghost" size="icon" className="h-5 w-5 text-red-400" onClick={() => handleRemovePayment(idx)}>
                                                    &times;
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                    <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={!isComplete}
                        onClick={() => onComplete(payments)}
                    >
                        Complete Sale
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Badge({ variant, className, children }: any) {
    // Mini mock since we are inside a client component file and using many UI imports.
    // Easier to mock the simple wrapper if not using the full UI lib or just use the div.
    // Actually, I can import Badge from UI. I did in ProductSearch. 
    // I'll assume it's available.
    // Waiting, I didn't import Badge here. I'll add the import or simple mock.
    // Import added below.
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${variant === 'outline' ? 'border border-slate-200 text-slate-600' : 'bg-slate-100 text-slate-800'} ${className}`}>
            {children}
        </span>
    );
}
