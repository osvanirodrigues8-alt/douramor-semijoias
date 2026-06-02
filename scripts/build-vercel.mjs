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

// Cria wrapper Node.js que adapta a interface Fetch API → Node.js http
const serverPath = join(root, 'dist', 'server', 'server.js').replace(/\\/g, '/')
const wrapperCode = `
import server from '${serverPath}'

export default async function handler(req, res) {
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

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: body?.length ? body : undefined,
  })

  const response = await server.fetch(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  const buffer = await response.arrayBuffer()
  res.end(Buffer.from(buffer))
}
`
writeFileSync(join(funcDir, 'wrapper.mjs'), wrapperCode)

await build({
  entryPoints: [join(funcDir, 'wrapper.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(funcDir, 'index.js'),
  external: [],
  minify: false,
})

// Remove wrapper temporário
import { unlinkSync } from 'fs'
unlinkSync(join(funcDir, 'wrapper.mjs'))

// .vc-config.json para Node.js Function
writeFileSync(join(funcDir, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs20.x',
  handler: 'index.js',
  launcherType: 'Nodejs',
}))

// 5. Routing config
writeFileSync(join(outDir, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    // Assets estáticos
    {
      src: '^/assets/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    // Tudo mais → Edge Function SSR
    { src: '^/(.*)$', dest: '/render' },
  ],
}))

console.log('✅ Vercel output gerado em .vercel/output/')
