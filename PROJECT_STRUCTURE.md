# POS App - Project Structure

## Overview
This is a **Next.js 15** Point of Sale (POS) application with Supabase backend, featuring offline-first architecture using Dexie (IndexedDB), real-time sync, and PWA capabilities.

---

## Directory Structure

```
pos-app-supabase/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── sync/                 # Sync endpoints
│   │   ├── reports/              # Report generation
│   │   └── due/                  # Due management
│   ├── dashboard/                # Dashboard page
│   ├── offline/                  # Offline fallback page
│   ├── service-worker/           # Service worker route
│   ├── service-worker.js         # Service worker file
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Global styles
│   └── manifest.ts               # PWA manifest
│
├── components/                   # Reusable React components
│   ├── LogoutButton.tsx          # Logout component
│   └── service-worker-register.tsx # SW registration
│
├── lib/                          # Utility functions & libraries
│   ├── validators/               # Zod validation schemas
│   │   ├── product.ts
│   │   ├── expense.ts
│   │   └── cash.ts
│   ├── utils/                    # Helper utilities
│   │   ├── download.ts           # Download utilities
│   │   └── csv.ts                # CSV export
│   ├── sync/                     # Sync engine
│   │   ├── sync-engine.ts        # Main sync logic
│   │   ├── queue.ts              # Sync queue
│   │   └── net-status.ts         # Network status
│   ├── dexie/                    # IndexedDB database
│   │   └── db.ts                 # Dexie schema
│   ├── prisma.ts                 # Prisma client
│   ├── productFormConfig.ts      # Product form config
│   └── utils.ts                  # General utilities
│
├── hooks/                        # Custom React hooks
│   └── (3 custom hooks)
│
├── app/actions/                  # Server actions
│   ├── customers.ts
│   ├── cash.ts
│   └── (more actions)
│
├── prisma/                       # Database schema & migrations
│   ├── schema.prisma             # Prisma schema
│   └── migrations/               # Migration history
│
├── public/                       # Static assets
│   ├── window.svg
│   ├── vercel.svg
│   ├── file.svg
│   └── next.svg
│
├── Configuration Files
│   ├── package.json              # Dependencies & scripts
│   ├── tsconfig.json             # TypeScript config
│   ├── tailwind.config.ts        # Tailwind CSS config
│   ├── postcss.config.mjs        # PostCSS config
│   ├── next.config.ts            # Next.js config
│   ├── eslint.config.mjs         # ESLint config
│   ├── middleware.ts             # Next.js middleware
│   ├── .env                      # Environment variables
│   ├── .env.local                # Local env overrides
│   ├── .gitignore                # Git ignore rules
│   └── README.md                 # Project documentation
```

---

## Key Technologies

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 |
| **Frontend** | React 18, TailwindCSS, shadcn/ui |
| **Backend** | Next.js API Routes, Prisma ORM |
| **Database** | Supabase (PostgreSQL) |
| **Offline DB** | Dexie (IndexedDB) |
| **State Management** | Zustand |
| **Data Fetching** | TanStack React Query |
| **Auth** | better-auth |
| **Validation** | Zod |
| **Charts** | Recharts |
| **PWA** | Service Workers |

---

## Core Features

### 1. **Offline-First Architecture**
- Local IndexedDB (Dexie) for offline data
- Sync engine for background synchronization
- Network status detection

### 2. **Real-Time Sync**
- Queue-based sync system
- Automatic sync on network reconnection
- Conflict resolution

### 3. **PWA Capabilities**
- Service worker registration
- Offline page fallback
- Web manifest

### 4. **Authentication**
- better-auth integration
- Middleware-based protection
- Logout functionality

### 5. **Data Management**
- Products, Customers, Cash, Expenses
- Server actions for mutations
- Zod validation schemas

### 6. **Reporting**
- CSV export functionality
- Report generation API
- Charts with Recharts

---

## Development Scripts

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

---

## Environment Variables

Required in `.env` or `.env.local`:
- Database connection strings
- Authentication secrets
- API endpoints

---

## Database Schema

Managed by Prisma with migrations in `prisma/migrations/`.

Key entities:
- Products
- Customers
- Transactions/Sales
- Expenses
- Cash Management

---

## API Routes

### `/api/sync`
- Handles data synchronization between client and server

### `/api/reports`
- Generates reports and exports

### `/api/due`
- Manages due/pending items

### `/service-worker`
- Service worker route handler

---

## Middleware

`middleware.ts` handles:
- Authentication checks
- Request routing
- Session validation

---

## Notes

- Uses **App Router** (not Pages Router)
- TypeScript throughout
- Tailwind CSS for styling
- shadcn/ui for component library
- Offline-first sync pattern
- PWA-ready with service workers
