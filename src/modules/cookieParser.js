export function cookieParser() {
    return function cookieParserMiddleware(req, res, next) {
        const cookies = {}
        const header = req.headers.cookie
        if (header) {
            for (const pair of header.split(';')) {
                const eqIdx = pair.indexOf('=')
                if (eqIdx < 0) continue
                const name = pair.slice(0, eqIdx).trim()
                const val = pair.slice(eqIdx + 1).trim()
                try {
                    cookies[name] = decodeURIComponent(val)
                } catch {
                    cookies[name] = val
                }
            }
        }
        req.cookies = cookies

        res.setCookie = (name, value, options = {}) => {
            const parts = [`${name}=${encodeURIComponent(String(value))}`]
            if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`)
            if (options.maxAge != null) parts.push(`Max-Age=${Number(options.maxAge)}`)
            if (options.domain) parts.push(`Domain=${options.domain}`)
            if (options.path) parts.push(`Path=${options.path}`)
            if (options.secure) parts.push('Secure')
            if (options.httpOnly) parts.push('HttpOnly')
            if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
            res.appendHeader('Set-Cookie', parts.join('; '))
        }

        next()
    }
}
