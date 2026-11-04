# ShareDabba API

The initial API foundation is intentionally small.

## Endpoints

- `GET /api/health` — confirms that the API process is running.
- `GET /api/ready` — checks whether PostgreSQL is configured and reachable.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install` in the repository root.
3. Copy `.env.example` to `.env`.
4. Add a PostgreSQL connection string to `DATABASE_URL`.
5. Apply `database/schema.sql` to a new PostgreSQL database.
6. Run `npm run dev`.

The Vite frontend runs on port 5173 and the API runs on port 4000.

## Security notes

- This foundation does not yet implement registration, login, sessions, password hashing, upload authorization or payout processing.
- Never store plaintext passwords. The future authentication module must hash passwords server-side with a modern password-hashing algorithm.
- Do not accept client-submitted earnings as authoritative. Earnings must be derived from validated server-side provider callbacks and fraud checks.
- Do not expose storage credentials to the browser. The future upload flow should use short-lived signed URLs.
- Restrict admin access with server-side role checks before building admin actions.
