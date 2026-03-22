export function bodyParser(options = {}) {
    const limit = options.limit ?? 1024 * 1024
    return function bodyParserMiddleware(req, res, next) {
        const contentType = req.headers['content-type'] || ''
        if (!contentType.includes('application/json') && !contentType.includes('application/x-www-form-urlencoded')) {
            req.body = {}
            return next()
        }
        const chunks = []
        let size = 0
        let aborted = false
        req.on('data', (chunk) => {
            size += chunk.length
            if (size > limit) {
                aborted = true
                req.destroy(new Error('Request body too large'))
                return
            }
            chunks.push(chunk)
        })
        req.on('error', next)
        req.on('end', () => {
            if (aborted) return
            const raw = Buffer.concat(chunks).toString('utf8')
            try {
                if (contentType.includes('application/json')) {
                    req.body = JSON.parse(raw)
                    req.json = req.body
                } else {
                    req.body = Object.fromEntries(new URLSearchParams(raw))
                }
                next()
            } catch (err) {
                next(err)
            }
        })
    }
}
