## Server auto-update (git deploy)

This repo includes `deploy.sh`, a safe deploy script intended to run **on the server**.

### What it does

- Fetches the latest code from git
- Resets the working tree to the selected branch (default `main`)
- Installs dependencies with `pnpm` (`--frozen-lockfile`)
- Runs `pnpm run build`
- Optionally runs migrations (`RUN_MIGRATIONS=true`)
- Restarts your process via `systemd` (recommended) or `pm2`

### Typical setup (Ubuntu/Debian + systemd)

1) Put the app on the server (example path):

```bash
sudo mkdir -p /var/www/behberg-outreach
sudo chown -R "$USER":"$USER" /var/www/behberg-outreach
git clone <your-repo-url> /var/www/behberg-outreach
```

2) Copy the systemd unit template and edit paths if needed:

```bash
sudo cp /var/www/behberg-outreach/deploy/behberg-outreach.service /etc/systemd/system/behberg-outreach.service
sudo systemctl daemon-reload
sudo systemctl enable --now behberg-outreach
```

3) Run deploys (manual trigger):

```bash
cd /var/www/behberg-outreach
chmod +x deploy.sh
SERVICE_NAME=behberg-outreach ./deploy.sh
```

### If you use pm2 instead

```bash
PM2_APP_NAME=behberg-outreach ./deploy.sh
```

### Optional: run migrations during deploy

```bash
RUN_MIGRATIONS=true SERVICE_NAME=behberg-outreach ./deploy.sh
```

