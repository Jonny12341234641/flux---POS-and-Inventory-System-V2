export function exportToCSV(data: any[], filename: string) {
    if (!data || !data.length) {
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','), // Header row
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                // Handle strings with commas or quotes
                if (typeof value === 'string') {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                // Handle dates/nulls
                if (value === null || value === undefined) {
                    return '';
                }
                return value;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
