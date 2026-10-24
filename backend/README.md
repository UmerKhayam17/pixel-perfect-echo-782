# LeadFinder backend

Express + MongoDB API that runs a Python scraper for each lead search.

```
frontend (React, :8080) ──HTTP──▶ Express API (:5000) ──▶ MongoDB (leadfinder db)
                                        │ spawn, NDJSON over stdout, pause/resume/cancel over stdin
                                        ▼
                               scraper/main.py (Python)
                                 ├─ Google Places API   (when GOOGLE_PLACES_API_KEY is set)
                                 ├─ Google Maps via Playwright (otherwise)
                                 └─ website crawl for public emails
```

## Setup

```powershell
cd backend
copy .env.example .env      # adjust if needed
npm install
npm run scraper:setup       # creates scraper/.venv, installs httpx + playwright + Chromium
npm run dev                 # API on http://localhost:5000/api
```

**Opening the app:** use `http://localhost:8080` on this computer, or `http://<this computer's IP>:8080`
(e.g. `http://192.168.88.39:8080`) from any phone or laptop on the same network. The frontend
server forwards `/api` to this backend (see `frontend/vite.config.ts`), so the API itself stays
reachable only from this computer and sign-in works the same on every address. Run `ipconfig` to
find the IP. If other devices can't connect, allow Node.js (port 8080) through Windows Firewall
for your network type. Ask your router to reserve the IP so the address doesn't change.

MongoDB must be running locally (`mongodb://127.0.0.1:27017`). The frontend reads
`VITE_API_URL` (default `http://localhost:5000/api`).

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | DB status and the lead source new searches will use |
| GET | `/api/stats?tzOffset=` | Dashboard totals, 14-day activity, top countries |
| GET | `/api/leads?q=&country=&category=&searchId=&stage=&tag=&has=phone,email&missing=website&sort=&page=&limit=` | Paged leads (`all=true` for every match) |
| GET | `/api/leads/facets` | Distinct countries / categories / cities |
| POST | `/api/leads/bulk-delete` | `{ ids }` |
| DELETE | `/api/leads/:id` · `/api/leads?confirm=true` | Delete one lead / every lead |
| GET | `/api/searches` | Search history |
| POST | `/api/searches` | Start a search: `{ niche, country, city?, keyword?, maxResults, contactTypes, websiteFilter: "any" \| "with" \| "without" }` |
| GET | `/api/searches/:id` | Live progress + latest 8 leads |
| POST | `/api/searches/:id/pause` · `/resume` · `/cancel` | Control a running search |
| DELETE | `/api/searches/:id?withLeads=true` | Delete a finished search (optionally with its leads) |
| POST | `/api/leads` | Add a lead by hand |
| GET · PATCH | `/api/leads/:id` | Lead with its activity timeline and tasks / edit fields, stage, tags, deal value |
| POST | `/api/leads/bulk-update` | `{ ids, stage?, priority?, addTags?, removeTags? }` |
| POST | `/api/leads/:id/activities` | Log a note, call, email or meeting `{ type, text }` |
| PATCH · DELETE | `/api/activities/:id` | Edit / delete a timeline entry |
| GET · POST | `/api/tasks?status=open\|done\|all&leadId=` | Follow-up tasks |
| PATCH · DELETE | `/api/tasks/:id` | Edit, complete (`{ done: true }`) or delete a task |
| GET | `/api/pipeline?q=&tag=&perStage=` | Kanban columns: count, deal value and leads per stage |
| GET · POST · DELETE | `/api/exports` · `/api/exports/:id` | Export history (files are generated in the browser) |
| GET · PUT | `/api/settings` | Workspace settings, lead source, Places API key (write-only) |

### Security & sign-in

There is **no sign-up page** and no public way to create an account. The admin is created on the
server, and admins add every other account (admin or member) from **Team** in the app.

**Admin from `.env` (automatic):** set these in `backend/.env` and start the API:

```
ADMIN_NAME=Your Name
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-strong-password
```

On startup the account is created if that email doesn't exist yet. Existing accounts are never
changed, so restarting won't undo a password you changed in the app. You'll be asked to pick a new
password at first sign-in. After that, delete `ADMIN_PASSWORD` from `.env`.

**Or from the command line:**

```powershell
npm run admin -- create            # asks for name, email and a hidden password
npm run admin -- reset-password    # locked out? sets a new password and signs out all sessions
npm run admin -- list
```

Every API route except `/api/health`, `/api/auth/status` and `/api/auth/login` requires a signed-in user.

| Method | Path | |
|---|---|---|
| GET | `/api/auth/status` | `{ setupRequired, user }` |
| POST | `/api/auth/login` · `/logout` | `{ email, password, remember }` |
| GET · PUT | `/api/auth/me` | Own profile (changing email needs `currentPassword`) |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }`; signs out other sessions |
| GET · DELETE | `/api/auth/sessions` · `/:id` | Own signed-in devices; `DELETE /sessions` signs out the others |
| GET · POST · PUT · DELETE | `/api/users` · `/:id` · `POST /:id/password` | Team management (admin) |

- **Roles:** `admin` can do everything. `member` can work their leads, pipeline, tasks and
  campaigns, but can't find new leads, change settings, sender accounts or users, or delete leads.
- **Passwords** are hashed with scrypt. Accounts created or reset by an admin get a temporary
  password that must be changed at first sign-in.
- **Sessions** use a random token in an `HttpOnly`, `SameSite=Lax` cookie scoped to `/api`. Only
  its SHA-256 is stored, so sessions can be revoked. "Keep me signed in" lasts `SESSION_DAYS`;
  otherwise a session lasts 12 hours and ends when the browser closes.
- **Brute force:** after 5 failed logins per account or 30 per IP, sign-in is blocked for 15
  minutes. Unknown emails take the same time and get the same error as wrong passwords.
- **CSRF:** state-changing requests need the `X-Requested-With: LeadFinder` header and an allowed
  `Origin`. CORS only grants credentials to `CORS_ORIGIN`, so never set it to `*`.
- **Secrets at rest:** SMTP passwords and the Places API key are AES-256-GCM encrypted using
  `APP_SECRET`, or `backend/.app-secret` if that isn't set (generated on first start). **Back that
  file up:** without it, saved email passwords can't be read and must be re-entered.
- **Network:** the API listens on loopback only unless you set `HOST` (e.g. `0.0.0.0` to share it
  on your LAN). If you expose it beyond this computer, serve it over HTTPS and set
  `COOKIE_SECURE=true`.
- Headers: `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `Cache-Control: no-store` and a
  deny-all CSP on API responses. JSON bodies are capped at 1 MB.

**Locked out?** Run `npm run admin -- reset-password --email you@example.com` on the server. It
also reactivates the account. Your data is untouched.

### Staff access & activity tracking

**Who sees which leads** (`src/services/access.js`): admins see everything. A member sees only:
- leads from **searches and imports an admin shared with them** (Team → Access, or Search
  History → Share with staff),
- leads **assigned to them** (All Leads → select → Assign to…, or the Owner box on a lead), and
- leads from imports they made or leads they added.

**Finding new leads (running searches) is admin-only.** The server refuses it for members.

The server enforces this on every route: lists, filters, lead pages, edits, bulk actions,
pipeline, dashboard stats, tasks, email campaign audiences, WhatsApp and exports. Members get 404
for anyone else's lead. Duplicates and merging are admin-only.

**Per-member permissions** (Team → Access & permissions): import and email campaigns (on by
default); export (off by default). **Deleting leads is admin-only**, with no switch to allow it:
single delete, bulk delete and undoing an import (which deletes its leads) all return 403 for
members. Staff close a lead by moving it to Lost.

A member can also see single leads shared with them (`access.leadIds`). This happens when an
admin gives them a task on a lead they couldn't see, so the task's link works.

| Method | Path | |
|---|---|---|
| POST | `/api/leads/assign` | Admin: `{ ids, userId \| null }` |
| PUT | `/api/searches/:id/access` | Admin: `{ userIds }` — the members who can see this search |
| PUT | `/api/users/:id` | Admin: `{ access: { searchIds, importIds }, permissions: { … } }` |

**Activity tracking** (`src/services/audit.js`, admin page **Staff Activity**) records:
- every change made through the API, with a readable label ("Moved lead to Qualified"). This
  includes attempts the server refused, shown as "Tried to: …";
- lead views and exports;
- sign-ins, failed sign-ins and sign-outs;
- from the app, every page opened and every button, link, tab or menu item pressed.

Typed text and passwords are never stored. The summary works out active time (gaps under 5
minutes count as working), leads viewed and worked, calls, emails, WhatsApp messages, stage moves
and deals won. Entries expire after `AUDIT_RETENTION_DAYS` (default 180). Staff are told on the
sign-in and account pages that activity is recorded.

| Method | Path | |
|---|---|---|
| POST | `/api/audit/events` | App → page views and clicks (batched) |
| GET | `/api/audit?userId=&kind=&q=&from=&to=&before=` | Admin: the trail, newest first |
| GET | `/api/audit/summary?from=&to=` | Admin: per-person totals |
| GET | `/api/audit/lead/:id` | Admin: who viewed or changed a lead |

### Notifications & lead distribution

**Notifications** (bell in the header, plus optional desktop alerts) go to:
- the staff member, when leads are assigned to them (one notification per batch);
- the staff member, when a campaign is shared with them, or an admin gives them a task;
- whoever the task belongs to, 15 minutes before it's due (or once if it's already overdue);
- the lead's owner, or else the campaign's creator, when a business replies to an email;
- admins, when a search finishes.

They expire after 90 days.

**Distributing leads** (admin, `POST /api/leads/distribute`, `services/distribute.js`):
- Pick staff and a method:
  - `even` takes turns after sorting by opportunity, so the best leads are spread fairly;
  - `balanced` gives each lead to whoever has the fewest open leads.
- By default only unowned leads are split, and won/lost leads are never moved.
- `preview: true` shows the split without changing anything.
- It's available from Search History ("Distribute leads to staff…") and from All Leads (selection
  or current filters).

**Auto-assignment:** when starting a search, an admin can tick staff (`autoDistributeTo`). Each
new business found is assigned to the next person in turn. The rotation is stored on the search
(`PUT /api/searches/:id/distribution` changes it), and each person is notified when the search
finishes.

| Method | Path | |
|---|---|---|
| GET | `/api/notifications` | Own latest 50 + unread count |
| POST | `/api/notifications/:id/read` · `/read-all` | Mark read |


### Is this number on WhatsApp?

wa.me links can't report back, so the app asks. After WhatsApp opens (lead page or the bulk
queue), staff answer **Sent**, **Not on WhatsApp** or **I didn't send it**
(`POST /api/leads/:id/whatsapp-result { result: sent | not_on_whatsapp | not_sent, text }`).

- Only **Sent** logs the message and moves a New lead to Contacted; it also marks the lead
  *On WhatsApp*. **Not on WhatsApp** marks it, adds a timeline entry and doesn't count as contact.
- `Lead.whatsappStatus` is `unknown | yes | no` (with who checked and when). It can be set by hand
  from the badge on the lead page.
- `Lead.phoneType` (`mobile | landline | unknown | none`) is worked out from the number for
  Pakistan, India, UAE, Saudi Arabia and the UK (`services/phone.js`). Landlines get a badge.
- All Leads → WhatsApp filter: on WhatsApp, not on WhatsApp, mobile not tried yet, landline
  (`?whatsapp=yes|no|unknown|landline`).
- The bulk WhatsApp queue always leaves out numbers marked *Not on WhatsApp*, and skips landlines
  unless you untick it. Reports show "not on WhatsApp" counts overall and per staff member.

### Priority, pinning and tasks

- **Priority** (low / medium / high): click the badge on a lead's page, use the lead's ⋯ menu in
  All Leads, or select leads and use **Priority / pin**. Non-default priorities show in the list.
- **Pin**: pinned leads stay at the top of All Leads and each Pipeline column, for everyone who
  can see them. Use the **Pin** button on the lead page, the ⋯ menu, or the bulk bar
  (`PATCH /api/leads/:id { pinned }`, `POST /api/leads/bulk-update { ids, pinned }`).
- **Tasks on any lead**: **Tasks → New task** has a lead search box. Admins pick who it's for
  (default: the lead's owner); the assignee is notified. Admins can reassign a task later
  (`PATCH /api/tasks/:id { assignedTo }`). Members' own tasks are always their own.
- **Who's working on what**:
  - All Leads → *Working on it*: owner, who last worked on the lead and when, and who has open
    tasks on it.
  - Lead page → *Who's working on it*: owner, open tasks with their assignees, everyone who has
    contacted or updated the lead, and (admins) the full view/change history.
  - Team page: leads each person owns and their open / overdue tasks, linking to their leads.
  - Tasks page: filter by person (admins), *My tasks*, or everyone's.

### Reports

**Reports** (sidebar, under Dashboard) — `GET /api/reports?from=&to=&tzOffset=&searchId=&userId=`.

- Ranges: 7 / 30 / 90 days, this month, this year (daily buckets; weekly over 45 days). Filter by campaign, and (admins) by staff member.
- KPIs: new leads, leads contacted, outreach count, deals won + value, win rate (won ÷ won+lost moved in the period), open pipeline value, email replies, tasks completed, contact rate.
- Charts: leads added vs contacted over time; outreach by channel (calls / WhatsApp / emails / meetings, stacked); current stage of leads added in the period. Every chart has a "View as table".
- Tables: team performance (admins only, CSV export), campaign performance — leads, phone/email coverage, contacted, qualified+, won, value, average opportunity (CSV export), and email campaigns sent/replied/bounced in the period.
- Staff see **My performance**: only their own activity on the leads shared with them; `userId` is ignored for members.
- Work is attributed by the activity's `userId`, so very old activity logged before user IDs were recorded counts in team totals but not per person.
### Lead insights: ratings, website audit, opportunity score

Searches now also save each business's **Google rating, review count, open/closed status and map
location**. Every website found gets a quick audit: reachable, HTTPS, mobile-friendly (viewport
tag), load time, platform (WordPress, Wix, Shopify…), footer © year and social links. All of this
comes from pages the scraper already downloads, so it adds almost no time.

The **opportunity score** (0–100, `src/models/opportunity.js`) ranks leads for web and marketing
services. Problems raise it: no website, a broken site, no HTTPS, not mobile-friendly, slow,
outdated, or built with a DIY builder. So does a solid, reachable business: many reviews, a high
rating, a phone number. Permanently closed businesses score 0. Each point comes with a reason
shown in the app.

For leads you already have, **enrich** runs `scraper/enrich.py` in the background: website audit,
missing emails and socials, and a fresh Google rating from each lead's profile. One job runs at a
time.

| Method | Path | |
|---|---|---|
| GET · POST | `/api/leads/enrich` | Job status / start `{ ids \| query, website, google, onlyMissing }` |
| POST | `/api/leads/enrich/cancel` | Stop the job |

`GET /api/leads` also accepts `sort=opportunity|rating|reviews`, `minRating`, `minReviews`,
`minOpportunity` and `hideClosed=true`.

### WhatsApp outreach

Click-to-chat links (`https://wa.me/<number>?text=…`). They're free and need no WhatsApp API. The
message opens prefilled and the user presses send. Numbers are converted to international format
using the lead's country (`src/services/whatsapp.js`), and Pakistani/Indian/UAE/Saudi/UK landlines
are flagged.

**Admin-set message formats:** an admin picks a WhatsApp template for each search (campaign) and a
default in Settings. A lead gets the template of the newest campaign it came from that has one,
else the default. When **Settings → "Staff must send the admin's message"** is on (the default),
members see that exact personalised message before opening WhatsApp and can't change it. The
server ignores any other text they send. Only admins can create, edit or delete WhatsApp templates.
Once WhatsApp opens, the text can still be edited inside WhatsApp itself. The app logs the message
it prepared. Each message opened is logged on the lead as a `whatsapp` activity, so the send queue
skips leads already messaged. Templates have a `channel` of `email` or `whatsapp`.

| Method | Path | |
|---|---|---|
| POST | `/api/whatsapp/render` | `{ leadId, body }` → `{ text, number, likelyMobile, url }` |
| GET | `/api/whatsapp/format/:leadId` | The admin's message for this lead's campaign, personalised, plus `mustUse` |
| PUT | `/api/searches/:id/whatsapp` | Admin: `{ templateId \| null }` — the campaign's WhatsApp message |
| POST | `/api/whatsapp/queue` | `{ leadIds \| query, body, onlyNotMessaged }` → personalised links per lead |

### Follow-up sequences & reply tracking

A campaign can have up to 5 **follow-ups** (`followUps: [{ delayDays, subject, body }]`). An empty
subject means "Re: <first subject>". Follow-ups are sent in the same thread (`In-Reply-To` /
`References`). The sequence stops for anyone who replies, unsubscribes, bounces or is marked
won/lost. The daily limit counts follow-ups too.

**Reply tracking** (per sender, `imap.enabled`) reads the inbox over IMAP every 3 minutes
(`src/services/replies.js`; on first run it looks back 14 days):

- **Replies** are matched by thread headers, else by sender address. The new text, without the
  quoted original, goes on the lead's timeline (`email_reply`), a "Reply to …" task is created and
  follow-ups stop.
- **"Unsubscribe" / "stop" replies** and **bounces** (mailer-daemon notices) put the address on the
  do-not-email list.
- **Out-of-office** auto-replies are ignored.

IMAP defaults follow the SMTP provider (Gmail, Outlook, Zoho, Yahoo) and use the same login.

| Method | Path | |
|---|---|---|
| POST | `/api/senders/:id/test-imap` | Connect and check the inbox now |
| POST | `/api/campaigns/:id/recipients/:rid/replied` | Mark a recipient as replied by hand |

### Backups

The API backs up the whole database once a day (gzipped Extended JSON in `backend/backups/`,
kept `BACKUP_KEEP_DAYS` days). Settings → Backups lets admins back up now and download files.

```powershell
npm run backup                    # back up now
npm run restore                   # list backups
npm run restore -- <file name>    # restore (stop the API first; takes a safety backup first)
```

Keep copies off this computer, together with `backend/.app-secret`. Without it, saved email
passwords in a restored database can't be decrypted.

### Import & duplicates

| Method | Path | |
|---|---|---|
| POST | `/api/imports/analyze` | Dry run: classify mapped rows as new / existing / repeated in file / invalid |
| POST · GET | `/api/imports` | Import rows (`{ rows, filename, options }`) / import history |
| DELETE | `/api/imports/:id` | Undo: deletes leads the import created that are still "new" |
| GET | `/api/leads/duplicates?matchOn=` | Groups of existing leads that look like the same business |
| POST | `/api/leads/merge` · `/api/leads/duplicates/ignore` | Merge a group into one lead / mark it "not duplicates" |

Files are parsed in the browser (CSV, XLSX, XLS; up to 20,000 rows). The server re-checks every row
before writing, and never creates a duplicate. A row matches an existing lead, or an earlier row,
when any enabled key is equal (`src/models/leadKeys.js`):

- **Google profile:** place id, from the lead or its Maps URL.
- **Email:** case-insensitive.
- **Phone:** last 9 digits, so `0300 1234567` = `+92 300 1234567`.
- **Website:** domain only; shared hosts like facebook.com or wa.me are ignored.
- **Name + city:** case, punctuation and words like "Pvt Ltd" are ignored.

Duplicates can be skipped or used to fill empty fields on the existing lead; nothing is
overwritten. Rows repeated within a file are folded into the first copy. Searches also recognise a
listing already saved under another name by its Google place id. Merging moves notes, tasks and
campaign history onto the kept lead.

### Email campaigns

| Method | Path | |
|---|---|---|
| GET · POST · PUT · DELETE | `/api/senders` · `/api/senders/:id` | SMTP accounts (password is write-only) |
| POST | `/api/senders/:id/test` | `{ to }` — send a test email |
| GET · POST · PUT · DELETE | `/api/templates` · `/api/templates/:id` | Reusable subject + body with `{{mergeFields}}` |
| GET · POST · PUT · DELETE | `/api/campaigns` · `/api/campaigns/:id` | Campaigns; `GET /:id` includes the per-recipient send log |
| POST | `/api/campaigns/audience` · `/preview` · `/test` | Reach counts, rendered preview, test send |
| POST | `/api/campaigns/:id/start` · `/pause` · `/resume` · `/cancel` | Control sending |
| GET · POST · DELETE | `/api/suppressions` · `/api/suppressions/:email` | Do-not-email list |

Emails are sent by a background worker in the API process (`services/email.js`), one at a time at
the campaign's pace (±30% jitter) and within each sender's daily limit. Progress lives in MongoDB,
so a campaign that was sending when the server stopped carries on after a restart. Login or
connection errors pause the campaign. A 55x rejection marks that recipient failed and adds the
address to the do-not-email list. Each sent email is logged on the lead's timeline.

### CRM

Every lead has a pipeline `stage` (new → contacted → qualified → proposal → won / lost), priority,
tags, contact person, deal value and a 0–100 `score` (how complete its contact data is). Stage
changes are written to the lead's activity timeline automatically. Logging a call, email or
meeting, or completing a task of that type, sets `lastContactedAt` and moves a `new` lead to
`contacted`. Deleting a lead also deletes its activities and tasks. When a search is deleted
"with leads", leads that have moved past `new` are kept. Re-scraping a business never overwrites
its CRM fields.

Leads are de-duplicated by business name + city across all searches. The lead source
(`auto` / `google_maps` / `google_places`) and the Places API key can be set from the
Settings page; `GOOGLE_PLACES_API_KEY` in `.env` is used as a fallback key.

## Notes

- **Google Places API** returns at most 60 results per query and is billed per request.
- **Google Maps scraping** goes against Google's Terms of Service; keep volumes modest. If Google
  changes its markup, update the selectors at the top of `scraper/sources/google_maps.py`.
  Set `SCRAPER_HEADLESS=false` to watch the browser while debugging.
- Debug the scraper alone: `scraper\.venv\Scripts\python scraper\main.py "{\"niche\":\"Dentists\",\"country\":\"Ireland\",\"city\":\"Dublin\",\"maxResults\":3,\"contactTypes\":[\"phone\",\"email\"]}"`
