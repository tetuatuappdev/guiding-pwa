# Guiding PWA

Standalone web app that targets the same Supabase project and backend APIs as the mobile app.

## Setup

1) Create `pwa/.env.local`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://guiding.onrender.com
```

2) Install and run:
```
npm install
npm run dev
```

## Notes
- The app registers a basic service worker from `public/sw.js`.
- Add PWA icons at `public/icons/icon-192.png` and `public/icons/icon-512.png`.
- Push notifications on iOS PWA are limited by platform support.
