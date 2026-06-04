/**
 * Post-build script: transforma o output do TanStack Start
 * no formato Vercel Build Output API (.vercel/output/)
 */
import { execSync } from 'child_process'
import { cpSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// 1. Build normal (sem Cloudflare)
console.log('🔨 Building TanStack Start...')
execSync('npm run build', { stdio: 'inherit', cwd: root })

// 2. Limpa output anterior
const outDir = join(root, '.vercel', 'output')
rmSync(outDir, { recursive: true, force: true })

// 3. Arquivos estáticos → .vercel/output/static/
console.log('📦 Copiando assets estáticos...')
mkdirSync(join(outDir, 'static'), { recursive: true })
cpSync(join(root, 'dist', 'client'), join(outDir, 'static'), { recursive: true })

// 4. Bundle do servidor → .vercel/output/functions/render.func/
console.log('⚡ Bundlando Edge Function...')
const funcDir = join(outDir, 'functions', 'render.func')
mkdirSync(funcDir, { recursive: true })

// Cria wrapper CJS que adapta a interface Fetch API → Node.js http
const serverPath = join(root, 'dist', 'server', 'server.js').replace(/\\/g, '/')
const wrapperCode = `
let _server = null
async function getServer() {
  if (!_server) _server = (await import('${serverPath}')).default
  return _server
}

module.exports = async function handler(req, res) {
  const server = await getServer()
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
  const headers = new Headers(req.headers)

  let body = undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  const request = new Request(url.toString(), { method: req.method, headers, body: body?.length ? body : undefined })
  const response = await server.fetch(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}
`
writeFileSync(join(funcDir, 'wrapper.cjs'), wrapperCode)

await build({
  entryPoints: [join(funcDir, 'wrapper.cjs')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: join(funcDir, 'index.js'),
  external: ['./server.js'],  // server.js será importado dinamicamente em runtime
  minify: false,
})

// Copia server.js e assets para a função poder importá-los em runtime
cpSync(join(root, 'dist', 'server'), funcDir, { recursive: true })

import { unlinkSync } from 'fs'
unlinkSync(join(funcDir, 'wrapper.cjs'))

// .vc-config.json para Node.js Function
writeFileSync(join(funcDir, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs20.x',
  handler: 'index.js',
  launcherType: 'Nodejs',
  maxDuration: 90,
}))

// 5. Routing config — filesystem handle serve arquivos estáticos primeiro
writeFileSync(join(outDir, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    // Cache headers para assets
    {
      src: '^/assets/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    // Serve arquivos estáticos de .vercel/output/static/
    { handle: 'filesystem' },
    // Tudo que não for estático → Node.js SSR
    { src: '^/(.*)$', dest: '/render' },
  ],
}))

console.log('✅ Vercel output gerado em .vercel/output/')
