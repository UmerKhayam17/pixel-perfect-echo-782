# Deploying LeadFinder Pro (Ubuntu + nginx + pm2)

How it runs in production:

- **nginx** serves the frontend (static files in `frontend/dist/client`) on your domain and
  forwards `/api/…` to the backend.
- **pm2** runs the backend API on `127.0.0.1` only, so it can't be reached from outside except
  through nginx.
- **MongoDB** runs on the same server. A normal single-server install is fine.

Paths below assume the code is in `/var/www/LeadPro` and the API port is `5001`.

## 1. Install the tools (once)

```bash
apt update
apt install -y nginx git python3-venv python3-pip
npm install -g pm2
```

Node.js 22+ and MongoDB 8 need to be installed already (`node -v`, `systemctl status mongod`).

## 2. Get the code

```bash
cd /var/www
git clone https://github.com/UmerKhayam17/pixel-perfect-echo-782 LeadPro
cd LeadPro
```

## 3. Backend

```bash
cd /var/www/LeadPro/backend
npm ci --omit=dev
cp .env.example .env
nano .env
```

Set at least:

| Setting | Value |
|---|---|
| `PORT` | `5001` (must match `proxy_pass` in the nginx file) |
| `HOST` | leave empty: the API only listens on this server |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/leadfinder` |
| `CORS_ORIGIN` | `https://your-domain.com,https://www.your-domain.com` |
| `COOKIE_SECURE` | `false` until HTTPS works (step 6), then `true` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your admin account (first start only) |

Set up the scraper (Python environment + Chromium and the system libraries it needs):

```bash
npm run scraper:setup -- --deps
```

Start the API with pm2 and make it start on boot:

```bash
cd /var/www/LeadPro
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints
pm2 logs leadpro-api # should show: python: …/scraper/.venv/bin/python and API listening on …:5001
```

After the first start:

- Back up `backend/.app-secret` somewhere safe. Saved email passwords can't be read without it.
- Sign in, choose a new password, then delete the `ADMIN_PASSWORD` line from `backend/.env`.

## 4. Frontend

```bash
cd /var/www/LeadPro/frontend
cp .env.example .env     # the defaults are right for nginx (VITE_API_URL=/api)
npm ci
npm run build            # creates dist/client/
```

## 5. nginx

```bash
cp /var/www/LeadPro/deploy/nginx/leadpro.conf /etc/nginx/sites-available/leadpro
nano /etc/nginx/sites-available/leadpro     # set server_name to your domain
ln -sf /etc/nginx/sites-available/leadpro /etc/nginx/sites-enabled/leadpro
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Point your domain's DNS **A record** (and `www`) at the server's IP. Then open
`http://your-domain.com` and sign in.

Firewall: only SSH and web traffic.

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 6. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Then set `COOKIE_SECURE=true` in `backend/.env` and run `pm2 restart leadpro-api`. Certbot
renews the certificate automatically.

## Updating

```bash
cd /var/www/LeadPro
bash deploy/update.sh
```

This pulls the code, installs packages, rebuilds the frontend and reloads the API.

## Troubleshooting

| Problem | Check |
|---|---|
| Page loads but sign-in fails | `pm2 logs leadpro-api`; `CORS_ORIGIN` must include the exact address in the browser bar. `COOKIE_SECURE=true` only works over https. |
| 502 Bad Gateway on `/api` | The API isn't running (`pm2 status`) or `PORT` doesn't match `proxy_pass`. |
| A page shows 404 after refresh | The nginx `location /` must have `try_files $uri /_shell.html;`. |
| Find Leads fails | `npm run scraper:setup -- --deps` again; the log line `python:` must point to `scraper/.venv`. |
| Old version after an update | Hard refresh (Ctrl+F5); `dist/client/_shell.html` is served with `no-cache`. |
