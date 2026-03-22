import { describe, it } from 'node:test'
import { expect } from 'chai'
import { EventEmitter } from 'node:events'
import { bodyParser } from '../src/modules/bodyParser.js'
import { cors } from '../src/modules/cors.js'
import { rateLimit } from '../src/modules/rateLimit.js'

function mockReq(options = {}) {
    const req = new EventEmitter()
    req.headers = options.headers || {}
    req.method = options.method || 'GET'
    req.socket = { remoteAddress: options.ip || '127.0.0.1' }
    req.destroy = (err) => req.emit('error', err)
    return req
}

function mockRes() {
    const headers = {}
    let statusCode = 200
    let body = null
    return {
        headers,
        get statusCode() {
            return statusCode
        },
        setHeader(k, v) {
            headers[k] = v
        },
        writeHead(code) {
            statusCode = code
        },
        end(data) {
            body = data
        },
        get body() {
            return body
        },
    }
}

// Helper to emit body data on a req mock
function emitBody(req, data) {
    const buf = Buffer.from(data, 'utf8')
    req.emit('data', buf)
    req.emit('end')
}

describe('bodyParser', () => {
    it('parses JSON body correctly', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'application/json' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({ hello: 'world' })
            done()
        })
        emitBody(req, JSON.stringify({ hello: 'world' }))
    })

    it('parses URL-encoded body correctly', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'application/x-www-form-urlencoded' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({ foo: 'bar', baz: 'qux' })
            done()
        })
        emitBody(req, 'foo=bar&baz=qux')
    })

    it('sets req.body = {} for non-matching content-type', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'text/plain' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({})
            done()
        })
    })

    it('sets req.body = {} when content-type is missing', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: {} })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({})
            done()
        })
    })

    it('calls next(err) when body exceeds limit', (_, done) => {
        const middleware = bodyParser({ limit: 10 })
        const req = mockReq({ headers: { 'content-type': 'application/json' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.instanceOf(Error)
            expect(err.message).to.equal('Request body too large')
            done()
        })
        emitBody(req, JSON.stringify({ data: 'this is longer than 10 bytes' }))
    })

    it('calls next(err) on invalid JSON', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'application/json' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.instanceOf(Error)
            done()
        })
        emitBody(req, '{invalid json}')
    })

    it('handles empty JSON body (empty object)', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'application/json' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({})
            done()
        })
        emitBody(req, '{}')
    })

    it('handles chunked data across multiple data events', (_, done) => {
        const middleware = bodyParser()
        const req = mockReq({ headers: { 'content-type': 'application/json' } })
        const res = mockRes()
        middleware(req, res, (err) => {
            expect(err).to.be.undefined
            expect(req.body).to.deep.equal({ a: 1 })
            done()
        })
        const full = JSON.stringify({ a: 1 })
        req.emit('data', Buffer.from(full.slice(0, 3)))
        req.emit('data', Buffer.from(full.slice(3)))
        req.emit('end')
    })
})

describe('cors', () => {
    it('sets Access-Control-Allow-Origin: * by default', () => {
        const middleware = cors()
        const req = mockReq({ headers: { origin: 'http://example.com' } })
        const res = mockRes()
        let called = false
        middleware(req, res, () => {
            called = true
        })
        expect(called).to.be.true
        expect(res.headers['Access-Control-Allow-Origin']).to.equal('*')
    })

    it('sets specific origin when string provided', () => {
        const middleware = cors({ origin: 'https://myapp.com' })
        const req = mockReq({ headers: { origin: 'https://myapp.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Origin']).to.equal('https://myapp.com')
    })

    it('allows matching origin from array', () => {
        const middleware = cors({ origin: ['https://app1.com', 'https://app2.com'] })
        const req = mockReq({ headers: { origin: 'https://app1.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Origin']).to.equal('https://app1.com')
    })

    it('does not set allow-origin for non-matching origin in array', () => {
        const middleware = cors({ origin: ['https://app1.com'] })
        const req = mockReq({ headers: { origin: 'https://evil.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Origin']).to.be.undefined
    })

    it('handles function origin resolver — allowed', () => {
        const middleware = cors({ origin: (o) => o.endsWith('.myapp.com') })
        const req = mockReq({ headers: { origin: 'https://sub.myapp.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Origin']).to.equal('https://sub.myapp.com')
    })

    it('handles function origin resolver — blocked', () => {
        const middleware = cors({ origin: (o) => o.endsWith('.myapp.com') })
        const req = mockReq({ headers: { origin: 'https://evil.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Origin']).to.be.undefined
    })

    it('sets credentials header when credentials: true', () => {
        const middleware = cors({ credentials: true })
        const req = mockReq({ headers: { origin: 'https://app.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Credentials']).to.equal('true')
    })

    it('does not set credentials header by default', () => {
        const middleware = cors()
        const req = mockReq({ headers: { origin: 'https://app.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Credentials']).to.be.undefined
    })

    it('handles OPTIONS preflight: responds with 204 and correct headers', () => {
        const middleware = cors()
        const req = mockReq({ method: 'OPTIONS', headers: { origin: 'https://app.com' } })
        const res = mockRes()
        let nextCalled = false
        middleware(req, res, () => {
            nextCalled = true
        })
        expect(nextCalled).to.be.false
        expect(res.statusCode).to.equal(204)
        expect(res.headers['Access-Control-Allow-Methods']).to.include('GET')
        expect(res.headers['Access-Control-Allow-Headers']).to.include('Content-Type')
        expect(res.headers['Access-Control-Max-Age']).to.equal('86400')
    })

    it('respects custom maxAge option', () => {
        const middleware = cors({ maxAge: 3600 })
        const req = mockReq({ method: 'OPTIONS', headers: { origin: 'https://app.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Max-Age']).to.equal('3600')
    })

    it('respects custom methods option', () => {
        const middleware = cors({ methods: ['GET', 'POST'] })
        const req = mockReq({ method: 'OPTIONS', headers: { origin: 'https://app.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Methods']).to.equal('GET, POST')
    })

    it('respects custom allowedHeaders option', () => {
        const middleware = cors({ allowedHeaders: ['X-Custom-Header'] })
        const req = mockReq({ method: 'OPTIONS', headers: { origin: 'https://app.com' } })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['Access-Control-Allow-Headers']).to.equal('X-Custom-Header')
    })

    it('calls next() for non-OPTIONS request', () => {
        const middleware = cors()
        const req = mockReq({ method: 'GET', headers: {} })
        const res = mockRes()
        let called = false
        middleware(req, res, () => {
            called = true
        })
        expect(called).to.be.true
    })
})

describe('rateLimit', () => {
    it('allows requests under the limit', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 5 })
        const req = mockReq({ ip: '10.0.0.1' })
        const res = mockRes()
        let called = false
        middleware(req, res, () => {
            called = true
        })
        expect(called).to.be.true
        expect(res.statusCode).to.equal(200)
    })

    it('blocks with 429 when limit is exceeded', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 2 })
        const req1 = mockReq({ ip: '10.0.0.2' })
        const req2 = mockReq({ ip: '10.0.0.2' })
        const req3 = mockReq({ ip: '10.0.0.2' })
        const res1 = mockRes()
        const res2 = mockRes()
        const res3 = mockRes()
        middleware(req1, res1, () => {})
        middleware(req2, res2, () => {})
        let nextCalled = false
        middleware(req3, res3, () => {
            nextCalled = true
        })
        expect(nextCalled).to.be.false
        expect(res3.statusCode).to.equal(429)
        const parsed = JSON.parse(res3.body)
        expect(parsed.error).to.equal('Too Many Requests')
    })

    it('sets X-RateLimit-Limit header', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 50 })
        const req = mockReq({ ip: '10.0.0.3' })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['X-RateLimit-Limit']).to.equal('50')
    })

    it('sets X-RateLimit-Remaining header', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 10 })
        const req = mockReq({ ip: '10.0.0.4' })
        const res = mockRes()
        middleware(req, res, () => {})
        expect(res.headers['X-RateLimit-Remaining']).to.equal('9')
    })

    it('sets X-RateLimit-Reset header as Unix timestamp', () => {
        const before = Math.ceil((Date.now() + 60_000) / 1000)
        const middleware = rateLimit({ windowMs: 60_000, max: 10 })
        const req = mockReq({ ip: '10.0.0.5' })
        const res = mockRes()
        middleware(req, res, () => {})
        const reset = Number(res.headers['X-RateLimit-Reset'])
        expect(reset).to.be.at.least(before - 1)
        expect(reset).to.be.at.most(before + 2)
    })

    it('X-RateLimit-Remaining decrements with each request', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 5 })
        const ip = '10.0.0.6'
        for (let i = 0; i < 3; i++) {
            const req = mockReq({ ip })
            const res = mockRes()
            middleware(req, res, () => {})
            expect(res.headers['X-RateLimit-Remaining']).to.equal(String(5 - (i + 1)))
        }
    })

    it('uses custom keyFn', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 2, keyFn: (req) => req.headers['x-api-key'] })
        const makeReq = (key) => {
            const req = mockReq()
            req.headers['x-api-key'] = key
            return req
        }
        const res1 = mockRes()
        const res2 = mockRes()
        const res3 = mockRes()
        middleware(makeReq('key-A'), res1, () => {})
        middleware(makeReq('key-A'), res2, () => {})
        let blocked = false
        middleware(makeReq('key-A'), res3, () => {
            blocked = true
        })
        expect(blocked).to.be.false
        expect(res3.statusCode).to.equal(429)
    })

    it('uses custom message', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 1, message: 'Slow down!' })
        const ip = '10.0.0.7'
        middleware(mockReq({ ip }), mockRes(), () => {})
        const res = mockRes()
        let nextCalled = false
        middleware(mockReq({ ip }), res, () => {
            nextCalled = true
        })
        expect(nextCalled).to.be.false
        const parsed = JSON.parse(res.body)
        expect(parsed.message).to.equal('Slow down!')
    })

    it('resets count after window expires', async () => {
        const middleware = rateLimit({ windowMs: 50, max: 1 })
        const ip = '10.0.0.8'
        const res1 = mockRes()
        const res2 = mockRes()
        middleware(mockReq({ ip }), res1, () => {})
        // exhaust the limit
        middleware(mockReq({ ip }), mockRes(), () => {})
        // wait for window to expire
        await new Promise((resolve) => setTimeout(resolve, 100))
        // new window — should be allowed
        let allowed = false
        middleware(mockReq({ ip }), res2, () => {
            allowed = true
        })
        expect(allowed).to.be.true
    })

    it('X-RateLimit-Remaining is 0 when limit reached (not negative)', () => {
        const middleware = rateLimit({ windowMs: 60_000, max: 1 })
        const ip = '10.0.0.9'
        // first request hits the limit exactly
        const res1 = mockRes()
        middleware(mockReq({ ip }), res1, () => {})
        expect(res1.headers['X-RateLimit-Remaining']).to.equal('0')
        // second request exceeds
        const res2 = mockRes()
        middleware(mockReq({ ip }), res2, () => {})
        expect(res2.headers['X-RateLimit-Remaining']).to.equal('0')
    })
})
