# Jobs app

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, PostgreSQL. Package manager: pnpm.
Serves the site, the admin UI and the JSON API (`/api/**`, code in `server/`).

```bash
cp .env.example .env.local       # needs a PostgreSQL database, see ../docs/local-development.md
pnpm install
pnpm dev          # http://localhost:3000, migrates the database on start
pnpm lint && pnpm typecheck && pnpm test
TEST_DB_URL=jdbc:postgresql://localhost:5432/fastorial_jobs pnpm test   # also runs the database tests
pnpm build        # next build + service worker bundle (no database needed)
```

See `../docs/local-development.md` and `../docs/deploy.md`. Note: this Next.js version has breaking
changes, see `AGENTS.md` and `node_modules/next/dist/docs/` before changing framework level code.
