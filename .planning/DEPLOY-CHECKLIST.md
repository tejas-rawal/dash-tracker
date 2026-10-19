# Deploy Checklist

Checks that need a real production deployment and can't be verified locally. Work through them on the first production deploy, and again whenever the proxy or hosting setup changes.

## Reverse-proxy hop count (from Phase 16 UAT, threat T-16-03)

**Why:** the 60/min upstream bucket and the 5-concurrent-stream cap both key on `req.ip`, and `req.ip` only reads `X-Forwarded-For` through `TRUST_PROXY_HOPS` (`src/server/app.ts`). Left at `0` behind a proxy, every rider looks like the proxy, so the whole service shares 5 streams and one 60/min bucket. Set too high, clients can forge `X-Forwarded-For` and dodge both limits.

- [ ] Set `TRUST_PROXY_HOPS` to the number of reverse proxies you control in front of the app:

  | In front of the app | Value |
  |---|---|
  | Nothing, clients connect directly | `0` |
  | One load balancer or PaaS router (Render, Fly, Railway, Heroku, AWS ALB, a single nginx) | `1` |
  | Cloudflare in front of a load balancer or router | `2` |

- [ ] Open 5 `GET /api/v1/predictions/stream?stop=349` streams from one network (for example a phone on cellular), then connect from a different network. The second network must get `200`, not `429`.
- [ ] Trigger the cap once and read the log line `Concurrent stream cap reached for <key>`. `<key>` must be your public IP (or its IPv6 /56), never an internal or proxy address.
