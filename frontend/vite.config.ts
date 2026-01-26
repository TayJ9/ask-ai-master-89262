import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy WebSocket requests for voice interviews
      '/voice': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      // Proxy webhooks to backend
      '/webhooks': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600, // Increase warning threshold slightly
    minify: 'esbuild', // Use esbuild for faster builds
    sourcemap: false, // Disable sourcemaps in production for smaller bundle
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor chunks for better caching and smaller initial bundle
          if (id.includes('node_modules')) {
            // React and React DOM
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Radix UI components
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }
            // React Query
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            // UI utilities
            if (id.includes('lucide-react') || id.includes('class-variance-authority') || 
                id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'ui-vendor';
            }
            // Framer Motion (can be large)
            if (id.includes('framer-motion')) {
              return 'framer-motion';
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
            // Router and navigation
            if (id.includes('wouter') || id.includes('router')) {
              return 'router-vendor';
            }
            // Other node_modules - split into smaller chunks if still too large
            return 'vendor';
          }
        },
      },
    },
  },
  base: "/",
  // Expose environment variables to the client
  // Support both VITE_API_URL (Vite convention) and NEXT_PUBLIC_API_URL (Vercel convention)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  define: {
    // Make NEXT_PUBLIC_API_URL available via import.meta.env
    'import.meta.env.NEXT_PUBLIC_API_URL': JSON.stringify(process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || ''),
  },
});
