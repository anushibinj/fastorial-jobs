# Frontend

Next.js (App Router), TypeScript, Tailwind, shadcn/ui. Package manager: pnpm.

```bash
cp .env.example .env.local
pnpm install
pnpm dev          # http://localhost:3000, proxies /api/** to API_BASE_URL
pnpm lint && pnpm typecheck && pnpm test
pnpm build        # next build + service worker bundle
```

See `../docs/local-development.md` and `../docs/deploy.md`. Note: this Next.js version has breaking
changes, see `AGENTS.md` and `node_modules/next/dist/docs/` before changing framework level code.
