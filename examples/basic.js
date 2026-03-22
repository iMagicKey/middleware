import { createServer } from 'node:http'
import { bodyParser, cors, rateLimit } from '../src/index.js'

function compose(...middlewares) {
    return function (req, res, finalHandler) {
        let idx = 0
        function next(err) {
            if (err) return finalHandler(err)
            const fn = middlewares[idx++]
            if (!fn) return finalHandler()
            fn(req, res, next)
        }
        next()
    }
}

const handle = compose(cors({ origin: '*' }), rateLimit({ windowMs: 60_000, max: 10 }), bodyParser({ limit: 100_000 }))

const server = createServer((req, res) => {
    handle(req, res, (err) => {
        if (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ method: req.method, body: req.body ?? null }))
    })
})

server.listen(3000, () => console.log('Server running on http://localhost:3000'))
