# Still Sailing — Backend API

A small Node.js + Express + TypeScript API that sits between the website and Supabase.
It is self-contained and can run from any checkout or server.

## Setup

1. **Node.js 20+** (22 recommended).
2. **Database:** in Supabase → SQL Editor, run the files in `db/` in order, once each:
   - `db/01-setup.sql` — tables, security rules, starter crews
   - `db/02-letters-and-daily-quests.sql` — letters in bottles + daily quest reset
3. **Settings:** `cp .env.example .env` and fill in the values.
4. Install and run:
   ```sh
   npm install
   npm run dev      # auto-restarts on changes
   # or for production:
   npm run build && npm start
   ```
5. Check it works: open http://localhost:4000/health → `{"ok":true}`

## How it works

- Requests that need a logged-in sailor send `Authorization: Bearer <accessToken>` (from `/auth/login`).
- The API talks to Supabase **as that sailor**, so the Row Level Security rules in `db/` still apply.
- Only the `/admin` routes use the secret service-role key.
- Errors always look like `{ "error": "A friendly message", "code"?: "..." }`.

## Endpoints

🔒 = needs `Authorization: Bearer <accessToken>`  🛡️ = needs `x-admin-key: <ADMIN_API_KEY>`

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password, sailorName }` | `201 { session \| null, needsConfirm }` |
| POST | `/auth/login` | `{ email, password }` | `{ session }` |
| POST | `/auth/refresh` | `{ refreshToken }` | `{ session }` |
| POST 🔒 | `/auth/logout` | — | `204` |

`session` = `{ accessToken, refreshToken, expiresAt, user: { id, email } }`. Access tokens last about an hour; call `/auth/refresh` before `expiresAt`.

### Profile
| Method | Path | Body | Returns |
|---|---|---|---|
| GET 🔒 | `/me` | — | `{ profile }` |
| PUT 🔒 | `/me/progress` | `{ totalXp, completedQuests, questsDay }` | `{ profile }` |
| GET 🔒 | `/me/rooms` | — | `{ roomIds }` (crews you joined) |

`profile` = `{ id, sailorName, totalXp, completedQuests, questsDay, createdAt }`. `totalXp` never goes down.

### Crew rooms & chat
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/rooms` | — | `{ rooms: [{ id, name, description, emoji, members }] }` |
| PUT 🔒 | `/rooms/:roomId/membership` | — | `204` (join) |
| DELETE 🔒 | `/rooms/:roomId/membership` | — | `204` (leave) |
| GET | `/rooms/:roomId/messages?limit=100&before=<id>` | — | `{ messages }` oldest first |
| POST 🔒 | `/rooms/:roomId/messages` | `{ body }` (1–280 chars) | `201 { message }` |
| GET | `/rooms/:roomId/stream` | — | Live messages (Server-Sent Events) |
| POST 🔒 | `/messages/:messageId/report` | — | `204` (3 reports hides it) |

`message` = `{ id, roomId, userId, sailorName, body, createdAt }`.
Posting needs you to have joined the crew (otherwise `403 not_member`) and is limited to one message every 2 seconds (`429`).

Live chat in the browser:
```js
const es = new EventSource(`${API_URL}/rooms/daily/stream`)
es.addEventListener('message', e => console.log(JSON.parse(e.data)))
```

### Letters in bottles
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/letters?limit=12` | — | `{ letters: [{ id, sailorName, body, createdAt }] }` approved only |
| POST 🔒 | `/letters` | `{ body }` (50–1500 chars) | `202 { status: "pending" }` — max 3/day (`429 daily_limit`) |

### Admin (moderation)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET 🛡️ | `/admin/letters?status=pending\|approved\|all` | — | `{ letters }` |
| POST 🛡️ | `/admin/letters/:id/approve` | — | `{ letter }` |
| DELETE 🛡️ | `/admin/letters/:id` | — | `204` (reject) |
| GET 🛡️ | `/admin/messages/hidden` | — | `{ messages }` with `reports` count |
| POST 🛡️ | `/admin/messages/:id/hide` | — | `204` |
| POST 🛡️ | `/admin/messages/:id/unhide` | — | `204` (also clears reports) |
| DELETE 🛡️ | `/admin/messages/:id` | — | `204` |
| PUT 🛡️ | `/admin/rooms/:id` | `{ name, description, emoji?, sortOrder? }` | `{ room }` (create/update) |
| DELETE 🛡️ | `/admin/rooms/:id` | — | `204` |

Example:
```sh
curl -H "x-admin-key: $ADMIN_API_KEY" http://localhost:4000/admin/letters
```

### Other
| GET | `/health` | → `{ ok: true }` |
|---|---|---|

## Project layout

```
.
├── db/                  SQL to run in Supabase
├── src/
│   ├── index.ts         starts the server
│   ├── app.ts           wires up middleware + routes
│   ├── env.ts           reads and checks .env
│   ├── supabase.ts      Supabase clients (anon / as-user / admin)
│   ├── messages.ts      message shape + live-update hub
│   ├── errors.ts        error responses
│   ├── middleware/      auth, admin key, rate limit
│   └── routes/          auth, profile, rooms, messages, letters, admin
└── .env.example
```
