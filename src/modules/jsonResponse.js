export function jsonResponse() {
    return function jsonResponseMiddleware(req, res, next) {
        res.jsonData = (data) => {
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ data, error: null }))
        }

        res.jsonError = (code, message) => {
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ data: null, error: { code, message } }))
        }

        next()
    }
}
