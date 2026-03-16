# AgentForge

A subscription marketplace where developers publish AI agents, tools, and content — and both human developers and AI agents can discover, subscribe, and consume via API.

## Stack

- **Frontend**: React + Tailwind CSS + shadcn/ui + TanStack Query
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (falls back to in-memory if no `DATABASE_URL`)
- **Routing**: Hash-based (wouter) for iframe compatibility

## Local Development

```bash
npm install
npm run dev
```

Runs at `http://localhost:5000`. Without `DATABASE_URL`, it uses in-memory storage with seed data.

## With Postgres

```bash
# Set your database URL
export DATABASE_URL=postgresql://user:password@host:5432/agentforge

# Push schema to database
npm run db:push

# Start dev server (auto-seeds on first run)
npm run dev
```

## Deploy to Zeabur

1. Push this repo to GitHub
2. Create a new project in [Zeabur](https://zeabur.com)
3. Import the GitHub repo — Zeabur auto-detects Node.js/Express
4. Add a **PostgreSQL** service in the same project
5. Zeabur auto-injects `DATABASE_URL` — no manual env config needed
6. Run `db:push` via Zeabur CLI or set build command to: `npm run build && npm run db:push`

## Build

```bash
npm run build
npm run start
```

## Project Structure

```
├── client/           # React frontend (Vite)
│   └── src/
│       ├── pages/    # Home, Agents, AgentDetail, Creators, CreatorDetail
│       └── components/
├── server/           # Express backend
│   ├── db.ts         # Drizzle + pg connection
│   ├── storage.ts    # IStorage interface (Pg + Memory implementations)
│   └── routes.ts     # REST API routes
├── shared/
│   └── schema.ts     # Drizzle schema (creators, agents, subscriptions)
└── zbpack.json       # Zeabur deployment config
```
