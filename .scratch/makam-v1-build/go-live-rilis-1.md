# Go-live Rilis 1 checklist (ticket 65)

Rebuilt from ticket 65, spec "Release plan", and runbook "Promoting to production". Human-gated: an agent may prepare and rehearse; the switch runs only after the owner's gate.

## 0. Preconditions (owner) — all must be true

- [ ] **04** SumoPod merchant + `makam.co.id` domain auth (DKIM/SPF/DMARC verified); no address still on the suppression list.
- [ ] **Old-app data question answered** (ticket 65 AC1): carry over, archive, or confirm all test data; what happens to old-app SumoPod payments still open at the switch.
- [ ] **GlitchTip token** (`GLITCHTIP_AUTH_TOKEN` + `GLITCHTIP_*` CI vars, `MAKAM_GLITCHTIP_TOKEN` in each host env file) — ticket 72 "Releases".
- [ ] **Cosign key pairs** exist (staging + production); public keys installed by `deploy/install-host.sh` — ticket 72 "Rehearsal".
- [ ] **Live SumoPod keys** ready to install on the switch day (project key, webhook secret, webhook URL `https://makam.co.id/api/webhooks/sumopod`).
- [ ] UAT bayar terbukti (ticket 61 ACs) — needs `pay.sumopod.com` reachable + a working Admin Lokasi for the test order's Lokasi.

## 1. Rehearsal (ticket 72) — no nginx change

- [ ] `makam-prod` deployed once through the promotion on `127.0.0.1:3100` with **sandbox** keys.
- [ ] A forced failing healthcheck shows the **automatic rollback** to the previous digest.
- [ ] An **unsigned** image is refused by `makam-deploy`.
- [ ] One signed digest is deployed and healthy on staging; a `success` deployment status exists; a passed smoke test is recorded against it (the promotion refuses otherwise).

## 2. Promotion (owner only)

`promote.yml` ("Promosikan ke produksi") refuses unless, in order: actor is the repo owner; the typed tag equals the expected `vYYYY.MM.DD-N`; the newest staging deployment naming a digest is `success`; that digest has a passed smoke test. Then it signs with the **production** key and cuts the release.

```bash
gh api 'repos/andrianm28/makam/deployments?environment=production&per_page=1' \
  --jq '.[0] | {ref, digest: .payload.image_digest}'
gh release list
```

## 3. Switch (owner, on the day)

- [ ] Install live SumoPod key/secret/webhook URL on production only.
- [ ] Back up the current `makam.co.id` / `www` nginx block **verbatim**.
- [ ] Replace it with one proxying to `makam-prod` `web` (`127.0.0.1:3100`), keeping the Certbot certificate.
- [ ] `nginx -t` passes **before** reload.
- [ ] `makam-deploy --env prod` follows the production-signed digest (timer or by hand).

## 4. Post-switch verification

- [ ] `https://makam.co.id/api/health` reports DB + worker heartbeat.
- [ ] SumoPod webhook `https://makam.co.id/api/webhooks/sumopod` reaches v1 (test event 2xx).
- [ ] Uptime alarm watches production.
- [ ] A real Kode Masuk and one real booking complete on `makam.co.id`.

## 5. Rollback (documented, tested)

- [ ] `rollback.yml` owner-only: give an earlier release tag + reason; it re-signs that digest with the production key and records a rollback. By hand: `makam-deploy --env prod --digest sha256:<earlier>`. No new release is cut.
- [ ] Rollback only works while the previous image tolerates the new schema (migrations are forward-only; image rollback never undoes a migration).

## 6. Gate

- [ ] A named human confirms in ticket 65's `## Comments` that v1 is ready to replace the old app and the data question is answered.
