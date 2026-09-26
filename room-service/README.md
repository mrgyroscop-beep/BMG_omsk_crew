# BMG match rooms

Cloudflare Worker and D1 storage for the match lobby. Players create or join a room with a six-character code, submit a roster, and confirm readiness. No account is required; the browser receives a random participant token and D1 stores only its SHA-256 hash.

Rooms expire after 24 hours. The host closes the room for both players; a guest can leave and free the second slot.

## Local development

```powershell
npm install
npm run db:migrate:local
npm run dev
```

The frontend uses the deployed Worker by default. Set `window.BMG_ROOM_API_BASE` before `script.js` loads to point a development build at another `/api` endpoint.

## Deployment

```powershell
npm run db:migrate:remote
npm run deploy
```

The D1 database id and allowed browser origins are configured in `wrangler.jsonc`.
