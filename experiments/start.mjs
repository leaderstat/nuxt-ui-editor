// Keep the document API on loopback, including in production.
process.env.NITRO_HOST = '127.0.0.1'
await import('../.output/server/index.mjs')
