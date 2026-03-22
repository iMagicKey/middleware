export function cors(options = {}) {
    const origin = options.origin ?? '*'
    const methods = (options.methods ?? ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']).join(', ')
    const allowedHeaders = (options.allowedHeaders ?? ['Content-Type', 'Authorization']).join(', ')
    const credentials = options.credentials ?? false
    const maxAge = options.maxAge ?? 86400

    if (origin === '*' && credentials === true) {
        throw new Error('CORS: credentials:true cannot be used with origin:"*"')
    }

    return function corsMiddleware(req, res, next) {
        const reqOrigin = req.headers.origin || ''
        let allowOrigin
        if (origin === '*') {
            allowOrigin = '*'
        } else if (typeof origin === 'function') {
            allowOrigin = origin(reqOrigin) ? reqOrigin : ''
        } else if (Array.isArray(origin)) {
            allowOrigin = origin.includes(reqOrigin) ? reqOrigin : ''
        } else {
            allowOrigin = origin
        }

        if (allowOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowOrigin)
        }
        if (credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true')
        }

        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', methods)
            res.setHeader('Access-Control-Allow-Headers', allowedHeaders)
            res.setHeader('Access-Control-Max-Age', String(maxAge))
            res.writeHead(204)
            res.end()
            return
        }

        next()
    }
}
