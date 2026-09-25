# Staff PWA install and web push

Status: ready-for-agent
Blocked by: 09
Spec: Implementation Decisions > Architecture (PWA manifest plus web push); Adapter ports > WebPush; Notifications (staff also get web push)

## What to build

Make the staff area an installable PWA (manifest, icons, service worker) and add web push for staff on top of WhatsApp: a subscription flow per device, the real WebPush adapter using VAPID keys (no external account needed), and a staff channel in the Notifications module so every staff alert goes by WhatsApp and push.

## Acceptance criteria

- [ ] The staff area installs to the home screen on Android and iPhone; the install hint explains that iPhone push works only after installing.
- [ ] A staff member can enable push per device; subscriptions are stored per account and removed when the browser reports them gone.
- [ ] The WebPush port has a real VAPID implementation and the in-memory fake; VAPID keys come from env.
- [ ] Staff alerts send both WhatsApp and push; push never replaces WhatsApp.
- [ ] Tapping a push opens the relevant staff page.
- [ ] Tests: the Notifications module sends a staff alert on both channels (fakes); expired subscription removal.
