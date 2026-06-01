# Production Deployment

Production URL: `https://pau.claricont.com`

The app is deployed as an isolated Docker Compose project on the VPS:

- App path: `/opt/pau/app`
- Compose project: `pau-production`
- Public ingress: existing Traefik on `80/443`
- App container port: internal Docker network only, no host port published
- Database: dedicated PostgreSQL container and `pau-postgres` volume
- Secrets: `/opt/pau/app/.env.production`, mode `0600`, not committed

## GitHub Actions

`Deploy Production` runs on pushes to `main` and manually through
`workflow_dispatch`.

Required GitHub Actions secrets:

- `VPS_HOST`: `5.129.231.24`
- `VPS_USER`: `root`
- `VPS_SSH_KEY`: private SSH key for the dedicated deploy key in
  `/root/.ssh/authorized_keys`. The public key is pinned to the
  `/usr/local/bin/pau-github-deploy` forced command.

The repository is public, so the VPS deploy script fetches it through HTTPS.
GitHub Actions can only ask the VPS wrapper to deploy the exact pushed SHA.
Bitrix and OpenRouter secrets stay only in `.env.production` on the VPS.

## Manual Deploy

```bash
cd /opt/pau/app
DEPLOY_REPO=https://github.com/Vladick-Pick/pau.git \
DEPLOY_REF=origin/main \
DEPLOY_HEALTH_URL=https://pau.claricont.com/api/health \
DEPLOY_DASHBOARD_URL=https://pau.claricont.com/api/dashboard \
bash scripts/deploy-production.sh
```

## Security Checks

The deploy script verifies:

- `/api/health` returns `200`
- `/api/dashboard` returns `401` before login
- `.env.production` and `.git/config` are not publicly reachable
- the app container does not run as root
- production compose does not publish host ports directly

Additional spot checks:

```bash
curl -i https://pau.claricont.com/api/health
curl -i https://pau.claricont.com/api/dashboard
curl -i https://pau.claricont.com/.env.production
curl -i https://pau.claricont.com/.git/config
docker compose -p pau-production --env-file /opt/pau/app/.env.production \
  -f /opt/pau/app/docker-compose.production.yml ps
```
