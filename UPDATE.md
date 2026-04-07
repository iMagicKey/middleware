# UPDATE — imagic-middleware

> Audit performed: 2026-04-07. Version at time of audit: 1.1.1

---

## package.json

- [ ] Add repository field once a GitHub repo is created

---

## Tests

- [ ] Add integration tests using a real node:http server (not just mocks)

---

## API improvements (minor bump)

- [ ] `rateLimit`: add `skip` option — `(req) => boolean` — to bypass rate limiting for certain requests
- [ ] `cors`: expose `exposedHeaders` option for `Access-Control-Expose-Headers`
- [ ] `bodyParser`: add support for `text/plain` content type
- [ ] `bodyParser`: add support for `multipart/form-data` (file uploads)

---

## Backlog

- [ ] Add `helmet`-style security headers middleware
- [ ] Add `compression` middleware (gzip/deflate using node:zlib)
- [ ] Add `requestId` middleware (injects X-Request-ID header)
