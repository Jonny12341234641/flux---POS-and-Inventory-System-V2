import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Support BOTH names so you don't get stuck.
    // Newer docs use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    // Your earlier setup might have NEXT_PUBLIC_SUPABASE_KEY
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_KEY;

    if (!url || !key) {
        throw new Error(
            "Missing Supabase env vars. Check .env.local for NEXT_PUBLIC_SUPABASE_URL and (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_KEY)."
        );
    }

    // We keep a copy of cookies so we can also apply them on redirects.
    let cookiesToSetForBrowser: Array<{
        name: string;
        value: string;
        options?: any;
    }> = [];

    const supabase = createServerClient(url, key, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSetForBrowser = cookiesToSet;

                // Make Server Components see the refreshed cookies on THIS request
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

                // Make the browser receive the refreshed cookies
                response = NextResponse.next({
                    request,
                });

                cookiesToSet.forEach(({ name, value, options }) =>
                    response.cookies.set(name, value, options)
                );
            },
        },
    });

    // IMPORTANT: getUser() re-validates against Supabase Auth server
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;

    const isLoginRoute = path === "/login" || path.startsWith("/login/");
    const isAppRoute = path === "/app" || path.startsWith("/app/");

    // If logged in, block /login and send to /app
    if (user && isLoginRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/app";

        const redirectResponse = NextResponse.redirect(redirectUrl);

        // Preserve any cookie updates that happened during getUser()
        cookiesToSetForBrowser.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
        );

        return redirectResponse;
    }

    // If NOT logged in, block /app and send to /login
    if (!user && isAppRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";

        const redirectResponse = NextResponse.redirect(redirectUrl);

        cookiesToSetForBrowser.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
        );

        return redirectResponse;
    }

    return response;
}
