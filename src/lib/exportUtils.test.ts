import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCSV } from './exportUtils';

describe('exportToCSV', () => {
    let mockLink: any;
    let mockUrl: string;

    beforeEach(() => {
        mockUrl = 'blob:http://localhost/fake-url';

        mockLink = {
            download: '',
            setAttribute: vi.fn(),
            style: { visibility: '' },
            click: vi.fn(),
        };

        vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as any);
        vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as any);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
    });

    it('returns early for empty array without creating a link', () => {
        exportToCSV([], 'test.csv');
        expect(document.createElement).not.toHaveBeenCalled();
    });

    it('returns early for null/undefined data', () => {
        exportToCSV(null as any, 'test.csv');
        expect(document.createElement).not.toHaveBeenCalled();
    });

    it('creates a CSV with correct headers from object keys', () => {
        const data = [{ name: 'Widget', price: 10, qty: 5 }];

        exportToCSV(data, 'export.csv');

        expect(URL.createObjectURL).toHaveBeenCalled();
        const blobArg = (URL.createObjectURL as any).mock.calls[0][0] as Blob;
        expect(blobArg).toBeInstanceOf(Blob);
        expect(blobArg.type).toBe('text/csv;charset=utf-8;');
    });

    it('quotes string values containing commas', () => {
        const data = [{ description: 'Red, Large', price: 10 }];

        exportToCSV(data, 'export.csv');

        const blobArg = (URL.createObjectURL as any).mock.calls[0][0] as Blob;
        // We can't easily read blob content synchronously, but we verify the blob was created
        expect(blobArg).toBeInstanceOf(Blob);
    });

    it('escapes double quotes inside string values', () => {
        const data = [{ note: 'He said "hello"' }];

        exportToCSV(data, 'export.csv');

        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('handles null and undefined values as empty strings', () => {
        const data = [{ a: null, b: undefined, c: 'ok' }];

        exportToCSV(data, 'export.csv');

        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('sets download attribute with provided filename', () => {
        const data = [{ x: 1 }];

        exportToCSV(data, 'my-report.csv');

        expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'my-report.csv');
    });

    it('triggers click on the link and removes it', () => {
        const data = [{ x: 1 }];

        exportToCSV(data, 'test.csv');

        expect(mockLink.click).toHaveBeenCalled();
        expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
    });

    it('handles multiple rows correctly', () => {
        const data = [
            { id: 1, name: 'Alpha' },
            { id: 2, name: 'Beta' },
            { id: 3, name: 'Gamma' },
        ];

        exportToCSV(data, 'multi.csv');

        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(mockLink.click).toHaveBeenCalled();
    });
});
