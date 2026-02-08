'use client';

import GrnForm from '@/components/purchasing/GrnForm';

export default function NewGrnPage() {
    return (
        <div className="p-6 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Create New GRN</h1>
            <GrnForm />
        </div>
    );
}
