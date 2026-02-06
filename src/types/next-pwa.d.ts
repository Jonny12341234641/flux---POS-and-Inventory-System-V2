declare module "@ducanh2912/next-pwa" {
    import { NextConfig } from "next";

    interface PluginOptions {
        dest?: string;
        disable?: boolean;
        register?: boolean;
        scope?: string;
        sw?: string;
        cacheOnFrontEndNav?: boolean;
        aggressiveFrontEndNavCaching?: boolean;
        reloadOnOnline?: boolean;
        swcMinify?: boolean;
        workboxOptions?: any;
        // Add other options as needed
    }

    const withPWAInit: (config?: PluginOptions) => (nextConfig: NextConfig) => NextConfig;
    export default withPWAInit;
}
