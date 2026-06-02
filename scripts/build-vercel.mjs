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

await build({
  entryPoints: [join(root, 'dist', 'server', 'server.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser', // Edge runtime usa browser-like env
  outfile: join(funcDir, 'index.js'),
  external: ['node:*'],
  minify: false,
})

// .vc-config.json para Edge Function
writeFileSync(join(funcDir, '.vc-config.json'), JSON.stringify({
  runtime: 'edge',
  entrypoint: 'index.js',
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
