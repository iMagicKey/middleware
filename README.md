# imagic-middleware

> Reusable HTTP middleware for imagic-web-server: body parsing, CORS, and rate limiting.

## Install

```bash
npm install imagic-middleware
```

## Quick Start

```js
import { bodyParser, cors, rateLimit } from 'imagic-middleware'

// With imagic-web-server
server.use(cors({ origin: 'https://example.com' }))
server.use(rateLimit({ windowMs: 60_000, max: 100 }))
server.use(bodyParser({ limit: 2 * 1024 * 1024 })) // 2MB
```

## API

All three functions return a middleware with the signature `(req, res, next) => void`, compatible with `imagic-web-server`'s `use()` and `createRoute()`.

---

### `bodyParser(options?)`

```ts
bodyParser(options?: { limit?: number }): (req, res, next) => void
```

Parses the incoming request body and sets `req.body` to the parsed value.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `1048576` (1 MB) | Maximum allowed body size in bytes |

**Content-Type handling:**

| Content-Type | Result |
|--------------|--------|
| `application/json` | `req.body` = parsed object via `JSON.parse` |
| `application/x-www-form-urlencoded` | `req.body` = parsed object via `URLSearchParams` |
| Any other | `req.body = {}` — no error, `next()` called normally |

**Error conditions:**

| Situation | Behavior |
|-----------|----------|
| Body exceeds `limit` | `req.destroy(error)` is called; `next` is **not** called |
| Invalid JSON | `next(error)` is called with a parse error |

---

### `cors(options?)`

```ts
cors(options?: {
    origin?: '*' | string | string[] | ((origin: string) => boolean)
    methods?: string[]
    allowedHeaders?: string[]
    credentials?: boolean
    maxAge?: number
}): (req, res, next) => void
```

Sets CORS response headers and handles `OPTIONS` preflight requests automatically.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `'*' \| string \| string[] \| function` | `'*'` | Allowed origin(s). Function receives the request `Origin` and returns `boolean`. |
| `methods` | `string[]` | `['GET','HEAD','PUT','PATCH','POST','DELETE']` | Allowed HTTP methods |
| `allowedHeaders` | `string[]` | `['Content-Type','Authorization']` | Allowed request headers |
| `credentials` | `boolean` | `false` | Sets `Access-Control-Allow-Credentials: true` |
| `maxAge` | `number` | `86400` | Preflight cache duration in seconds (`Access-Control-Max-Age`) |

**Preflight:** When the request method is `OPTIONS`, the middleware responds immediately with `204 No Content` and does **not** call `next`.

**Blocked origin:** When the request origin does not match the configured `origin`, no `Access-Control-Allow-Origin` header is set. `next` is still called.

---

### `rateLimit(options?)`

```ts
rateLimit(options?: {
    windowMs?: number
    max?: number
    keyFn?: (req: IncomingMessage) => string
    message?: string
}): (req, res, next) => void
```

In-memory rate limiter. Counts requests per key within a sliding time window.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `windowMs` | `number` | `60000` | Length of the time window in milliseconds |
| `max` | `number` | `100` | Maximum requests per key per window |
| `keyFn` | `function` | `req.socket.remoteAddress` | Extracts a string key from the request (e.g. API key, user ID) |
| `message` | `string` | `'Too Many Requests'` | Body message in the 429 response |

**Response headers set on every request:**

| Header | Value |
|--------|-------|
| `X-RateLimit-Limit` | Configured `max` |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

**Over limit:** Responds with `429` and JSON body `{ "error": "Too Many Requests", "message": "..." }`. Does **not** call `next`.

**Storage:** In-memory `Map`. Expired entries are cleaned up lazily on each request. The store resets on process restart — not suitable for multi-process or multi-instance deployments.

---

## Error Handling

| Middleware | Error Condition | Behavior |
|------------|-----------------|----------|
| `bodyParser` | Body exceeds limit | `req.destroy(err)` — connection closed, `next` not called |
| `bodyParser` | Invalid JSON | `next(err)` — error passed to next handler |
| `cors` | Origin blocked | No CORS headers set; `next()` called normally |
| `cors` | `OPTIONS` preflight | `204` response sent; `next` not called |
| `rateLimit` | Limit exceeded | `429` JSON response; `next` not called |

## Examples

See the [`examples/`](./examples) directory for runnable scripts.

```bash
node examples/basic.js
```

### Compose with a plain `node:http` server

```js
import { createServer } from 'node:http'
import { bodyParser, cors, rateLimit } from 'imagic-middleware'

function compose(...middlewares) {
    return (req, res, done) => {
        let i = 0
        const next = (err) => {
            if (err) return done(err)
            const fn = middlewares[i++]
            if (!fn) return done()
            fn(req, res, next)
        }
        next()
    }
}

const handle = compose(
    cors({ origin: '*' }),
    rateLimit({ windowMs: 60_000, max: 100 }),
    bodyParser()
)

createServer((req, res) => {
    handle(req, res, (err) => {
        if (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ body: req.body }))
    })
}).listen(3000)
```

## License

MIT
