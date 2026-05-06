# Nyenrode Academic Research Assistant

A web-based academic research and writing copilot for Nyenrode Business Universiteit students. Wraps Anthropic's Claude API with a domain-tuned system prompt distilled from the [academic-research-skills](https://github.com/dietervlaminck-tech/academic-research-skills) plugin and an NBU-branded chat interface. Supports Microsoft (Entra ID) SSO restricted to the Nyenrode tenant.

The student types in the browser; the server holds the API key.

## Stack

- Next.js 16 (App Router) + TypeScript
- `@anthropic-ai/sdk` for streaming chat
- `next-auth` v5 (Auth.js) with Microsoft Entra ID provider
- Vanilla CSS with Nyenrode brand variables
- Single serverless API route at `/api/chat`, protected by middleware when SSO is on

## Run locally (open access — no SSO)

```bash
npm install
cp .env.example .env.local
# edit .env.local: set ANTHROPIC_API_KEY (leave AUTH_ENABLED=false)
npm run dev
```

Open http://localhost:3000.

## Enabling Microsoft SSO

Authentication is gated by the `AUTH_ENABLED` environment variable. Flip it to `true` once Azure is set up; until then the app runs open so you can test.

### One-time Azure setup (Nyenrode IT)

1. **Register an application** in the Nyenrode Azure Entra ID tenant (Azure portal → Microsoft Entra ID → App registrations → New registration).
2. **Redirect URIs** (Web platform):
   - `http://localhost:3000/api/auth/callback/microsoft-entra-id` (dev)
   - `https://<your-app>.vercel.app/api/auth/callback/microsoft-entra-id` (prod)
3. **API permissions**: `Microsoft Graph → User.Read` (delegated). Grant admin consent.
4. **Create a client secret** under *Certificates & secrets*. Copy the value (shown once).
5. Note three values:
   - **Directory (tenant) ID**
   - **Application (client) ID**
   - **Client secret value**

### Configure environment variables

```bash
AUTH_ENABLED=true
AUTH_SECRET=<run: openssl rand -base64 32>
AZURE_AD_TENANT_ID=<tenant id>
AZURE_AD_CLIENT_ID=<client id>
AZURE_AD_CLIENT_SECRET=<client secret value>
```

With `AUTH_ENABLED=true`:
- Visiting any page redirects unauthenticated users to `/signin`.
- The sign-in button starts the Microsoft OAuth flow.
- The `signIn` callback in [auth.ts](auth.ts) verifies the user's `tid` claim matches `AZURE_AD_TENANT_ID` — accounts from any other tenant get rejected.
- Sessions are JWT-based, 30-day max age. Sign-out clears the cookie.

With `AUTH_ENABLED=false` (or unset): SSO is bypassed entirely. No Azure vars are required.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
vercel env add ANTHROPIC_API_KEY production
# When ready to enable SSO:
vercel env add AUTH_ENABLED production       # value: true
vercel env add AUTH_SECRET production
vercel env add AZURE_AD_TENANT_ID production
vercel env add AZURE_AD_CLIENT_ID production
vercel env add AZURE_AD_CLIENT_SECRET production
vercel --prod
```

Or push to GitHub and import at https://vercel.com/new — Vercel auto-detects Next.js. Add the same env vars under **Project Settings → Environment Variables**, then redeploy.

After enabling SSO in production, register the Vercel production URL as an additional redirect URI on the Azure app registration.

## Project structure

```
app/
  api/chat/route.ts                — streaming chat endpoint (server-side)
  api/auth/[...nextauth]/route.ts  — Auth.js handler
  signin/page.tsx                   — branded Microsoft sign-in page
  layout.tsx                        — root layout with header + sign-out
  page.tsx                          — chat UI
  globals.css                       — Nyenrode brand styles
auth.ts                             — Auth.js config + tenant gate
middleware.ts                       — conditional auth enforcement
lib/systemPrompt.ts                 — distilled academic-research skill prompt
```

## Configuration

- **Model**: `claude-sonnet-4-6` (edit [app/api/chat/route.ts](app/api/chat/route.ts)).
- **System prompt**: edit [lib/systemPrompt.ts](lib/systemPrompt.ts).
- **Branding tokens**: edit `:root` CSS variables in [app/globals.css](app/globals.css).
- **Allowed tenant**: `AZURE_AD_TENANT_ID` env var. Use `common` to allow any Microsoft account (not recommended for production).

## Notes & next steps

- **No rate limiting** — even with SSO, a signed-in student could rack up tokens. Consider Vercel KV + a per-user counter.
- **No conversation persistence** — chats live only in the browser tab. Add a database (Vercel Postgres, Supabase) if students need history.
- **Citations are not verified** — the system prompt forbids fabrication, but no Semantic Scholar lookup is wired up. Sensible next feature.
- **Group-based access** (e.g. only students, not staff) is not implemented. Would require requesting `GroupMember.Read.All` and checking group claims in the `signIn` callback.
