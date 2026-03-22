# AGENT — imagic-middleware

## Purpose

Provides three production-ready HTTP middleware functions — body parsing, CORS headers, and in-memory rate limiting — compatible with `imagic-web-server` and any connect-style middleware chain.

## Package

- npm: `imagic-middleware`
- import (local): `import { bodyParser, cors, rateLimit } from '../src/index.js'`
- import (installed): `import { bodyParser, cors, rateLimit } from 'imagic-middleware'`
- zero runtime deps (uses `node:http`, `node:crypto` built-ins)

## Exports

All three exports return a middleware function: `(req: IncomingMessage, res: ServerResponse, next: (err?) => void) => void`

---

### `bodyParser(options?): Middleware`

- `options.limit` {number} [1048576] — max body size in bytes (1 MB default)
- returns: middleware that sets `req.body` after parsing
- throws: never (errors passed to `next` or trigger `req.destroy`)

Parsing behavior by `Content-Type`:

| Content-Type | `req.body` value |
|--------------|-----------------|
| `application/json` | Parsed object from `JSON.parse` |
| `application/x-www-form-urlencoded` | Object from `URLSearchParams` |
| anything else | `{}` |

Error behavior:

| Condition | Action |
|-----------|--------|
| Body size > `limit` | `req.destroy(err)` — connection destroyed; `next` NOT called |
| JSON parse failure | `next(err)` — error forwarded to next handler |

---

### `cors(options?): Middleware`

- `options.origin` {'*' | string | string[] | (origin: string) => boolean} ['*'] — allowed origin(s)
- `options.methods` {string[]} [['GET','HEAD','PUT','PATCH','POST','DELETE']] — allowed methods
- `options.allowedHeaders` {string[]} [['Content-Type','Authorization']] — allowed request headers
- `options.credentials` {boolean} [false] — if true, sets `Access-Control-Allow-Credentials: true`
- `options.maxAge` {number} [86400] — preflight cache duration in seconds
- returns: middleware
- throws: never

Behavior:

| Condition | Action |
|-----------|--------|
| `OPTIONS` preflight | Sends `204 No Content` immediately; `next` NOT called |
| Origin allowed | Sets `Access-Control-Allow-Origin` + other CORS headers; calls `next` |
| Origin blocked | No `Access-Control-Allow-Origin` header set; `next` is still called |

---

### `rateLimit(options?): Middleware`

- `options.windowMs` {number} [60000] — time window in ms
- `options.max` {number} [100] — max requests per key per window
- `options.keyFn` {(req) => string} [req.socket.remoteAddress] — key extractor function
- `options.message` {string} ['Too Many Requests'] — message field in 429 response body
- returns: middleware
- throws: never

Headers set on every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds).

| Condition | Action |
|-----------|--------|
| Under limit | Sets headers; calls `next` |
| Over limit | Responds `429` with `{ "error": "Too Many Requests", "message": "..." }`; `next` NOT called |

Storage: in-memory `Map`. Expired entries lazily cleaned on each request. Resets on process restart.

## Usage Patterns

### With imagic-web-server

```js
import { bodyParser, cors, rateLimit } from '../src/index.js'

server.use(cors({ origin: ['https://app.example.com', 'https://admin.example.com'] }))
server.use(rateLimit({ windowMs: 60_000, max: 200 }))
server.use(bodyParser({ limit: 2 * 1024 * 1024 })) // 2MB
```

### Custom origin function

```js
const allowedOrigins = new Set(['https://app.example.com', 'https://staging.example.com'])

server.use(cors({
    origin: (origin) => allowedOrigins.has(origin),
    credentials: true,
}))
```

### Per-route rate limiting

```js
// Strict limit for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Too many login attempts' })

server.createRoute({ url: '/auth/login', methods: ['POST'] }, authLimiter, handler)
```

### Rate limit by API key instead of IP

```js
const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 1000,
    keyFn: (req) => req.headers['x-api-key'] ?? req.socket.remoteAddress,
})
```

### Compose with plain node:http

```js
import { createServer } from 'node:http'
import { bodyParser, cors, rateLimit } from '../src/index.js'

function compose(...fns) {
    return (req, res, done) => {
        let i = 0
        const next = (err) => {
            if (err) return done(err)
            const fn = fns[i++]
            if (!fn) return done()
            fn(req, res, next)
        }
        next()
    }
}

const handle = compose(cors(), rateLimit(), bodyParser())

createServer((req, res) => {
    handle(req, res, (err) => {
        if (err) { res.writeHead(500); res.end(err.message); return }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ body: req.body }))
    })
}).listen(3000)
```

## Constraints / Gotchas

- **`bodyParser` on body overflow**: uses `req.destroy()`, not `next(err)`. The connection is terminated. There is no JSON 413 response.
- **`cors` OPTIONS handling**: the middleware responds `204` and does NOT call `next` for preflight requests. Any middleware or handler registered after `cors` will not run for OPTIONS.
- **`cors` blocked origin**: when origin is blocked, `next()` is still called. You must implement your own blocking logic if you want to reject blocked-origin requests outright.
- **`rateLimit` is not distributed**: the counter is stored in a local `Map`. In a cluster or multi-process setup, each process has its own counter. Use an external store (Redis etc.) for distributed rate limiting.
- **`rateLimit` cleanup is lazy**: memory grows until a key's window expires and a new request arrives. Under high cardinality of `keyFn` values with long windows, memory usage can increase.
- **`rateLimit` `keyFn` must be synchronous**: it is called inline; async key functions are not supported.
- **Middleware order matters**: always apply `cors` before `rateLimit` and `bodyParser` so OPTIONS preflights are handled before hitting the rate limiter. Apply `bodyParser` last.
- **`req.body` is not set** by default in Node.js — always add `bodyParser` to any route that reads the request body.
- **`credentials: true` and `origin: '*'`**: browsers reject credentialed requests with wildcard origin. When using `credentials: true`, set `origin` to an explicit domain or function.
