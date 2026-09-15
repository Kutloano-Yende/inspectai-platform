# InspectAI Landlord Web Application

Next.js application for landlords to manage inspections and view inspection reports.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Opens at `http://localhost:3000`

## Building

```bash
pnpm build
pnpm start
```

## Architecture

- **Next.js 15** with App Router
- **React 19** (RC)
- **React Query** for server state management
- **@inspectai/ui** for design system
- **React Hook Form** for form handling
- **TypeScript** for type safety

## Features (Phase A)

- Authentication flow (login/logout)
- Protected routes with session verification
- Organization isolation
- Inspections list with filtering and pagination
- Real API integration
- Loading/error/empty states
- Responsive design
- Accessibility baseline
