'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import { ScrollArea } from "@/components/ui/scroll-area" 
import { Button } from "@/components/ui/button"
import { GraduationCap } from "lucide-react"

interface HelpModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-indigo-600" />
                        Flux POS Help & Training
                    </DialogTitle>
                    <DialogDescription>
                        Quick guides for common operations.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="pos" className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="pos">Processing Sales</TabsTrigger>
                        <TabsTrigger value="grn">Receiving Stock</TabsTrigger>
                        <TabsTrigger value="sync">End of Day</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-y-auto mt-4 pr-2">
                        <TabsContent value="pos" className="space-y-4">
                            <h3 className="font-semibold text-lg">How to Process a Sale</h3>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                                <li>Navigate to the <strong>POS</strong> page from the sidebar.</li>
                                <li>Search for items using the search bar (Name or Barcode).</li>
                                <li>Tap an item to add it to the cart. If the item is batch-tracked, you'll be prompted to select a batch.</li>
                                <li>Adjust quantities in the cart panel on the right.</li>
                                <li>Select a Customer (optional) or leave as "Walk-in Customer".</li>
                                <li>Click <strong>Charge</strong> and select a payment method (Cash, Card, QR).</li>
                                <li>Confirm payment to finalize. The invoice will print (or download PDF).</li>
                            </ol>
                            <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-800">
                                <strong>Tip:</strong> If offline, sales are saved locally and synced when you reconnect.
                            </div>
                        </TabsContent>

                        <TabsContent value="grn" className="space-y-4">
                            <h3 className="font-semibold text-lg">Receiving Stock (GRN)</h3>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                                <li>Go to <strong>Purchasing (GRN)</strong>.</li>
                                <li>Click <strong>New GRN</strong>.</li>
                                <li>Select the <strong>Supplier</strong> and enter the <strong>Invoice #</strong>.</li>
                                <li>Add items to the list. For each item:
                                    <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
                                        <li>Enter Quantity Received.</li>
                                        <li>Enter/Scan <strong>Batch Number</strong> and <strong>Expiry Date</strong> (Critical for tracking!).</li>
                                        <li>Confirm cost price.</li>
                                    </ul>
                                </li>
                                <li>Click <strong>Save GRN</strong> to update inventory immediately.</li>
                            </ol>
                        </TabsContent>

                        <TabsContent value="sync" className="space-y-4">
                            <h3 className="font-semibold text-lg">End of Day & Syncing</h3>
                            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                                <li>Ensure you are connected to the internet (Wifi/Data).</li>
                                <li>Check the <strong>Sync</strong> status in the sidebar or top bar.</li>
                                <li>If the indicator is <span className="text-green-600 font-bold">Green</span>, all data is synced.</li>
                                <li>If <span className="text-amber-600 font-bold">Amber/Red</span>, go to the <strong>Sync</strong> page.</li>
                                <li>Click <strong>Force Sync</strong> to push any pending sales or GRNs to the cloud.</li>
                                <li>Once synced, you can safely close the register.</li>
                            </ol>
                            <div className="bg-red-50 p-3 rounded-md text-xs text-red-800">
                                <strong>Warning:</strong> Do not clear your browser cache/history if you have unsynced data!
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
