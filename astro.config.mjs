// @ts-check
import { defineConfig, envField } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
    site: 'https://jymmantenimientos.com',
    output: 'server',
    adapter: vercel(),
    vite: {
        plugins: [tailwindcss()],
    },

    integrations: [
        react(),
        sitemap({
            filter: (page) => {
                const path = new URL(page).pathname;
                return !['/panel', '/auth', '/api'].some(
                    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
                );
            },
        }),
    ],

    env: {
        schema: {
            // Cliente
            PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public' }),
            PUBLIC_SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'client', access: 'public' }),

            // Servidor
            SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
            DIRECT_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
            APP_URL: envField.string({ context: 'server', access: 'public', default: 'http://localhost:4321' }),
            APP_TIMEZONE: envField.string({ context: 'server', access: 'public', default: 'America/Costa_Rica' }),

            // Fase 2 / 3 (opcionales por ahora)
            GOOGLE_MAPS_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            PUBLIC_VAPID_PUBLIC_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
            VAPID_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            VAPID_SUBJECT: envField.string({ context: 'server', access: 'secret', optional: true }),
        },
    },
});
