import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/** When the API is down or on the wrong port, the default proxy error is often 500 + empty body — unusable for debugging. */
function attachApiProxyErrorHandler(
  proxy: { on: (ev: string, fn: (err: Error, req: unknown, res: unknown) => void) => void },
  targetLabel: string
) {
  proxy.on("error", (err, _req, res) => {
    const r = res as {
      writeHead?: (code: number, headers: Record<string, string>) => void;
      end?: (chunk: string) => void;
      headersSent?: boolean;
    };
    if (r?.writeHead && typeof r.end === "function" && !r.headersSent) {
      const body = JSON.stringify({
        error: "Backend unreachable",
        message: err?.message || String(err),
        details: `Vite proxy could not reach ${targetLabel}. Start the API from backend/ (npm run dev) and set PORT in backend/.env to 3001 (see vite.config.ts).`,
      });
      r.writeHead(502, { "Content-Type": "application/json" });
      r.end(body);
    }
  });
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
    dedupe: ['react', 'react-dom'], // Ensure only one instance of React is loaded
  },
  optimizeDeps: {
    include: ['react', 'react-dom'], // Pre-bundle React to ensure single instance
    force: false, // Only force if needed
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        // Use 127.0.0.1 (not "localhost") on Windows — some Node proxy stacks
        // resolve localhost to IPv6 first and can hang or fail to connect.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure(proxy) {
          attachApiProxyErrorHandler(proxy, "http://127.0.0.1:3001");
        },
      },
      // Proxy WebSocket requests for voice interviews
      '/voice': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          attachApiProxyErrorHandler(proxy, "ws://127.0.0.1:3001");
        },
      },
      // Proxy webhooks to backend
      '/webhooks': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure(proxy) {
          attachApiProxyErrorHandler(proxy, "http://127.0.0.1:3001");
        },
      },
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600, // Increase warning threshold slightly
    minify: 'esbuild', // Use esbuild for faster builds
    sourcemap: false, // Disable sourcemaps in production for smaller bundle
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        // CRITICAL FIX: The "Cannot set properties of undefined (setting 'Children')" error
        // happens when React is in a vendor chunk that loads asynchronously.
        // Solution: Keep React in the entry bundle (don't chunk it) to ensure synchronous loading
        manualChunks: (id) => {
          // Split vendor chunks for better caching and smaller initial bundle
          if (id.includes('node_modules')) {
            // React and React-DOM MUST be in entry bundle (not chunked) to prevent TDZ errors
            // Return undefined to keep React in the main entry chunk
            if (id.includes('node_modules/react/') || 
                id.includes('node_modules/react-dom/') ||
                id === 'react' || id === 'react-dom') {
              return undefined; // Keep in entry bundle, don't chunk
            }
            // Radix UI components - keep with React to prevent loading order issues
            if (id.includes('@radix-ui')) {
              return undefined; // Keep in entry bundle with React
            }
            // React Query - keep with React to prevent loading order issues
            if (id.includes('@tanstack/react-query')) {
              return undefined; // Keep in entry bundle with React
            }
            // Wouter router - keep with React to prevent loading order issues
            // Wouter also accesses React.Children and needs React to be available
            if (id.includes('wouter')) {
              return undefined; // Keep in entry bundle with React
            }
            // ElevenLabs React SDK - keep with React to prevent loading order issues
            // @elevenlabs/react also depends on React and may access React.Children
            if (id.includes('@elevenlabs/react')) {
              return undefined; // Keep in entry bundle with React
            }
            // UI utilities
            if (id.includes('lucide-react') || id.includes('class-variance-authority') || 
                id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-vendor';
            }
            // Framer Motion - keep with React to prevent loading order issues
            // Don't chunk framer-motion separately - it needs React to be available
            if (id.includes('framer-motion')) {
              return undefined; // Keep in entry bundle with React
            }
            // Validation libraries (Zod can be large)
            if (id.includes('zod')) {
              return 'validation-vendor';
            }
            // WebSocket and audio libraries
            if (id.includes('ws') || id.includes('socket') || id.includes('audio') || 
                id.includes('media') || id.includes('recorder')) {
              return 'media-vendor';
            }
            // Other router libraries (not wouter)
            if (id.includes('router')) {
              return 'router-vendor';
            }
            // PERFORMANCE: Split large vendor chunk by library type for better caching
            // Heavy form/table libraries
            if (id.includes('react-hook-form') || id.includes('react-table') || 
                id.includes('react-day-picker') || id.includes('date-fns')) {
              return 'form-vendor';
            }
            // Chart/visualization libraries
            if (id.includes('recharts') || id.includes('chart') || id.includes('d3')) {
              return 'chart-vendor';
            }
            // Animation libraries (framer-motion is motion-vendor)
            if (id.includes('embla-carousel') || id.includes('carousel')) {
              return 'animation-vendor';
            }
            // Other node_modules - split into smaller chunks if still too large
            return 'vendor';
          }
        },
      },
    },
  },
  base: "/",
  preview: {
    // Preview server should serve from the same directory as build output
    port: 4173,
    strictPort: false,
    // Explicitly set the directory to serve from (matches build.outDir)
    // This ensures preview serves from dist/public, not just dist
    // Note: vite preview should respect build.outDir, but we're being explicit
  },
  // Expose environment variables to the client
  // Support both VITE_API_URL (Vite convention) and NEXT_PUBLIC_API_URL (Vercel convention)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  define: {
    // Make NEXT_PUBLIC_API_URL available via import.meta.env
    'import.meta.env.NEXT_PUBLIC_API_URL': JSON.stringify(process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || ''),
    // Ensure React is available globally to prevent initialization errors
    'global': 'globalThis',
  },
});
