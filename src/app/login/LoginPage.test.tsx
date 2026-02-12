import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock dependencies ---
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

const mockSignIn = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({
        auth: {
            signInWithPassword: mockSignIn,
        },
    }),
}));

import LoginPage from './page';

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders login form with email and password inputs', () => {
        render(<LoginPage />);

        expect(screen.getByText('Login', { selector: 'h1' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('usera@example.com')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    });

    it('renders login button', () => {
        render(<LoginPage />);
        expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
    });

    it('calls signInWithPassword on form submit', async () => {
        mockSignIn.mockResolvedValueOnce({ error: null });
        const user = userEvent.setup();

        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('usera@example.com'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
        await user.click(screen.getByRole('button', { name: /^login$/i }));

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123',
            });
        });
    });

    it('redirects to /app on successful login', async () => {
        mockSignIn.mockResolvedValueOnce({ error: null });
        const user = userEvent.setup();

        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('usera@example.com'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
        await user.click(screen.getByRole('button', { name: /^login$/i }));

        await waitFor(() => {
            expect(mockReplace).toHaveBeenCalledWith('/app');
        });
    });

    it('displays error message on auth failure', async () => {
        mockSignIn.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
        const user = userEvent.setup();

        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('usera@example.com'), 'wrong@test.com');
        await user.type(screen.getByPlaceholderText('••••••••'), 'badpass');
        await user.click(screen.getByRole('button', { name: /^login$/i }));

        await waitFor(() => {
            expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        });
    });

    it('shows "Logging in..." while loading', async () => {
        // Make signIn hang
        mockSignIn.mockImplementation(() => new Promise(() => { }));
        const user = userEvent.setup();

        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('usera@example.com'), 'test@test.com');
        await user.type(screen.getByPlaceholderText('••••••••'), 'pass');
        await user.click(screen.getByRole('button', { name: /^login$/i }));

        await waitFor(() => {
            expect(screen.getByText('Logging in...')).toBeInTheDocument();
        });
    });

    it('disables login button while loading', async () => {
        mockSignIn.mockImplementation(() => new Promise(() => { }));
        const user = userEvent.setup();

        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('usera@example.com'), 't@t.com');
        await user.type(screen.getByPlaceholderText('••••••••'), 'p');
        await user.click(screen.getByRole('button', { name: /^login$/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
        });
    });
});
