# Deploy Archduke to Render

This repository is `/Users/jackgaletti/Projects/archduke-game`. No external deployment or live invite smoke test has been performed. The deployment needs the owner's GitHub/Render account access and explicit authorization to create the paid service. No domain purchase is needed.

## Private GitHub repository

1. Create a **private** GitHub repository named `archduke-game` in your own account. Keep the supplied artwork private.
2. From this repository, after reviewing the local commit, add that private repository as `origin` and push `main`:

   ```sh
   git remote add origin git@github.com:YOUR_GITHUB_ACCOUNT/archduke-game.git
   git push -u origin main
   ```

   Replace `YOUR_GITHUB_ACCOUNT` with the actual owner; no GitHub account name is assumed.
3. Connect Render to that GitHub account and authorize access only to this private repository.

## Blueprint deployment

1. In Render, choose **New → Blueprint**, select the private `archduke-game` repository and branch `main`, using root `render.yaml`.
2. Review the single paid Node web service. Region defaults to Oregon (near this workstation); choose a region near the group. Keep **one instance** and no autoscaling.
3. Set `PUBLIC_ORIGIN` to the exact Render HTTPS URL shown for this service, e.g. `https://YOUR_SERVICE_SLUG.onrender.com`, without a trailing slash. If its generated hostname is only known after creation, set/update this value in Environment and redeploy; invalid/missing production origins intentionally fail startup.
4. Runtime **24.18.1**; build **`npm ci && npm run build`**; start **`npm start`**; health path **`/healthz`**. Render supplies PORT; the server binds it on `0.0.0.0`. Frontend and WebSockets share this process.
5. Default **PERSISTENCE=memory**, **DATA_DIR=./data**, **MATCH_DELAY_MS=1000**. No disk. Do not publish the Vite dev server or choose a static-only host. Auto deploy is off to avoid interrupting a game when a branch changes.

The equivalent manual dashboard flow is **New → Web Service → connected private repo → Node**, with the exact values above and environment variables from `render.yaml`. Use a paid compute plan, single instance, HTTPS, and native WebSocket support. Review current pricing in your account before purchasing.

## Optional SQLite snapshot upgrade

After opting into the additional disk cost, attach a persistent disk to the SAME service, mounted at **`/var/data`** (e.g. 1 GB), and set:

```text
PERSISTENCE=sqlite
DATA_DIR=/var/data
```

The adapter creates `archduke.sqlite` at runtime, with WAL and FULL synchronous commits. No database/disk access occurs in the build. Keep one instance. The current memory-only game cannot be recovered retroactively when enabling SQLite; finish/abort it first.

A persistent disk is runtime-only and disables zero-downtime deploys. Expect a brief outage during replacement. Active SQLite games restore paused, requiring all players to reconnect and the current host to Resume. See [Render persistent disk restrictions](https://render.com/docs/disks).

## Verify the live service

- Open `https://YOUR_SERVICE_SLUG.onrender.com/healthz`: only `{"ok":true}` should appear.
- In one browser profile, enter a name and click Start game; copy its invite link, open it in another independent profile/device, and join through the branded name-only entry screen. Refresh and reopen the link to verify the same seat reconnects.
- Confirm ready/peek, draw/discard, match, one special interaction, and refresh/reconnect/pause/resume.
- Confirm invitation is HTTPS on the real origin, no mixed-content requests or console errors, and only one tab controls a seat.
- Complete a hosted four-round game before claiming real internet playtesting. Local tests do not prove worldwide timing fairness.

## Restart, rollback and logs

Memory mode: every restart/deploy/rollback resets active rooms. Announce it to your players and finish games first. Old links fail clearly. SQLite mode: the disk survives; active rooms restore paused. Do not downgrade to incompatible snapshot structures without a backup and migration review. To roll back compatible code, use Render's Deploys page to redeploy the previous successful commit, then perform the reconnect smoke test. No automated migration scheme between future incompatible schema versions is claimed.

SIGTERM disconnects sockets, commits pause/reconnect state through each room queue, closes the store and exits. Logs contain startup/operational failures only, without credentials or hidden hands. No live game/debug endpoints exist.

## Reference and validation

Blueprint fields follow [Render's official YAML specification](https://render.com/docs/blueprint-spec). Node hosting follows [Render web services](https://render.com/docs/web-services). Local structural/schema validation and production smoke-test results belong in IMPLEMENTATION_STATUS.md; local checks do not imply the Render account accepted or deployed this blueprint.
