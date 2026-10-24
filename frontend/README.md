# LeadFinder Pro — web app

The browser front end of LeadFinder Pro: leads, pipeline, tasks, email and WhatsApp outreach,
reports and team management. It talks to the API in `../backend` (see `../backend/README.md`
for setup, features and the admin account).

## Development

You need Node.js and npm.

```sh
npm i
npm run dev
```

The dev server listens on port 8080 on all network interfaces and forwards `/api` to the backend
(`API_TARGET`, default `http://127.0.0.1:5000`).

## Production build

`npm run build` creates a standalone Node server in `.output/`; start it with
`node .output/server/index.mjs` (`PORT` sets the port). It serves pages only, so `/api` needs a
reverse proxy to the backend in front of it.

## Icons

`public/favicon.svg` is the source logo. `favicon.ico`, `apple-touch-icon.png` and `icon-512.png`
are rendered from it.
