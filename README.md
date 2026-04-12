# AgentForge

**One API key. 300+ AI agents. Zero configuration.**

AgentForge is a unified API gateway and marketplace for AI agents. Use a single API key to access hundreds of AI agents — no need to manage individual API keys, authentication, or billing for each one.

[Live Demo](https://patreon.zeabur.app) | [API Docs](https://patreon.zeabur.app/#/docs) | [Browse Agents](https://patreon.zeabur.app/#/agents)

## Why AgentForge?

Most AI agent platforms make you manage separate API keys, auth flows, and billing for every agent you use. AgentForge gives you **one key to rule them all**.

- **Unified API** — Call any agent through a single REST endpoint
- **300+ agents** — Pre-loaded with trending agents from GitHub and HuggingFace
- **Creator economy** — Publish your own agents and earn revenue (90% creator share)
- **Built for developers** — RESTful API, streaming support, API key auth, rate limiting

## Quick Start

### Use the API (no install needed)

```bash
# 1. Get your API key at https://patreon.zeabur.app/#/settings/api-keys
# 2. Call any agent:

curl -X POST https://patreon.zeabur.app/api/agents/AGENT_ID/invoke \
  -H "Authorization: Bearer af_k_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```

### Python

```python
import requests

response = requests.post(
    "https://patreon.zeabur.app/api/agents/AGENT_ID/invoke",
    headers={"Authorization": "Bearer af_k_your_key_here"},
    json={"messages": [{"role": "user", "content": "Hello!"}]}
)
print(response.json())
```

### JavaScript

```javascript
const response = await fetch(
  "https://patreon.zeabur.app/api/agents/AGENT_ID/invoke",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer af_k_your_key_here",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello!" }],
    }),
  }
);
const data = await response.json();
```

## Features

### For Users
- Browse and discover 300+ AI agents, tools, and APIs
- One API key to access all agents
- Free and paid agents with transparent pricing
- Streaming support for real-time responses
- Usage tracking and billing history

### For Creators
- Publish unlimited agents with your own pricing
- 90% revenue share (10% platform fee)
- Stripe Connect payouts to your bank account
- Analytics dashboard with subscriber metrics
- API proxy — we handle auth, rate limiting, and billing

### Platform
- Google OAuth + email/password authentication
- Two-factor authentication (TOTP)
- Rate limiting (1000 req/hour, 10000 req/day per key)
- Agent health monitoring
- Auto-import from GitHub trending and HuggingFace

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents/:id/invoke` | Invoke an agent |
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/:id` | Get agent details |
| `GET` | `/api/agents/:id/health` | Check agent health |
| `GET` | `/api/stats` | Platform statistics |

Full API documentation: [patreon.zeabur.app/#/docs](https://patreon.zeabur.app/#/docs)

## Self-Hosting

### Prerequisites
- Node.js 20+
- PostgreSQL

### Setup

```bash
git clone https://github.com/doggychip/agentforge.git
cd agentforge
npm install

# Set environment variables
export DATABASE_URL=postgresql://user:password@host:5432/agentforge

# Start development server (auto-migrates and seeds)
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | No | Stripe API key for payments |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `SMTP_HOST` | No | SMTP server for emails |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |

### Deploy to Zeabur

1. Push to GitHub
2. Create project in [Zeabur](https://zeabur.com)
3. Import the repo + add PostgreSQL service
4. Zeabur auto-injects `DATABASE_URL`

## Tech Stack

- **Frontend**: React 18, Tailwind CSS, shadcn/ui, TanStack Query, wouter
- **Backend**: Express 5, Drizzle ORM, Passport
- **Database**: PostgreSQL
- **Payments**: Stripe Connect
- **Auth**: bcrypt, Google OAuth, TOTP 2FA
- **Deploy**: Docker / Zeabur

## Project Structure

```
agentforge/
├── client/src/          # React frontend
│   ├── pages/           # Route pages
│   ├── components/      # Shared components
│   └── hooks/           # Auth, query hooks
├── server/
│   ├── routes.ts        # API endpoints
│   ├── storage.ts       # Database layer
│   └── db.ts            # Connection + migrations
├── shared/
│   └── schema.ts        # Drizzle schema + types
└── Dockerfile
```

## Contributing

Pull requests welcome. For major changes, open an issue first.

## License

MIT
