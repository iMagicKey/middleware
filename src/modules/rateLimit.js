export function rateLimit(options = {}) {
    const windowMs = options.windowMs ?? 60_000
    const max = options.max ?? 100
    const keyFn = options.keyFn ?? ((req) => req.socket?.remoteAddress ?? 'unknown')
    const message = options.message ?? 'Too Many Requests'
    const store = new Map()

    return function rateLimitMiddleware(req, res, next) {
        const now = Date.now()
        const key = keyFn(req)

        // lazy cleanup of expired entries
        for (const [k, v] of store) {
            if (v.resetAt <= now) store.delete(k)
        }

        let entry = store.get(key)
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs }
            store.set(key, entry)
        }

        entry.count++

        res.setHeader('X-RateLimit-Limit', String(max))
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)))
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

        if (entry.count > max) {
            res.writeHead(429, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Too Many Requests', message }))
            return
        }

        next()
    }
}
