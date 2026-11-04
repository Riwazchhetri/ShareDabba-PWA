# ShareDabba PWA

A unified, mobile-first file-hosting and creator workspace prototype.

## Current status

This repository starts with a frontend prototype. It is **not yet a production file-hosting or monetization service**.

Included:
- Responsive creator dashboard
- File selection and local demo file list
- Demo share-link dialog
- Placeholder earnings, withdrawals, referrals and admin screens
- PWA web manifest

Not yet included:
- User authentication or server-side roles
- Authenticated persistent cloud uploads or downloads
- Database-backed file records
- Real share links, streaming or download delivery
- Ad-provider callbacks, verified earnings or payouts
- Production admin controls

Files selected in the current prototype remain in browser memory; their contents are not uploaded. Demo views and earnings are not real.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

## Cloudinary connection

Set `CLOUDINARY_URL` as a private environment variable on the backend service in Render. Use the Cloudinary connection URL shown in your Cloudinary dashboard; never commit it to GitHub or place it in frontend code. The backend exposes `GET /api/storage/status` to verify the connection. This status check does not enable public uploads; upload endpoints must be added behind user authentication and authorization.

## Planned architecture

One PWA and one backend:
- React + TypeScript + Vite frontend
- Node.js + TypeScript API
- PostgreSQL database
- S3-compatible object storage (Cloudflare R2 or another provider)
- Signed, time-limited upload/download URLs
- Share routes for videos, APKs, PDFs, ZIPs, images and other allowed files

## Build sequence

1. Stabilize the frontend and app configuration.
2. Add backend API, database schema and authentication.
3. Add private object storage and resumable uploads.
4. Implement share pages and safe video playback/downloads.
5. Add event tracking and fraud-resistant monetization accounting.
6. Add creator wallet, withdrawal requests and admin audit controls.
7. Add PWA install/offline behavior and deploy.

Do not put secrets or provider credentials in frontend code. Use server-side environment variables.