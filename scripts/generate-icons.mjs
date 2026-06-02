// Genera iconos PNG para PWA desde un SVG inline.
// Ejecutar: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../public/icons')
await mkdir(outDir, { recursive: true })

const baseSvg = (size, bgColor = '#0f172a', maskable = false) => {
  const padding = maskable ? Math.round(size * 0.18) : 0
  const inner = size - padding * 2
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bgColor}"/>
  <g transform="translate(${padding} ${padding})">
    <rect width="${inner}" height="${inner}" rx="${inner * 0.22}" fill="#1e293b"/>
    <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle"
          font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700"
          font-size="${inner * 0.55}" fill="#f8fafc"
          transform="translate(${padding}, ${padding})">F</text>
  </g>
  <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700"
        font-size="${inner * 0.55}" fill="#f8fafc">F</text>
</svg>`)
}

const variants = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const v of variants) {
  await sharp(baseSvg(v.size, '#0f172a', v.maskable))
    .png()
    .toFile(resolve(outDir, v.name))
  console.log('Wrote', v.name)
}

// Apple touch en raíz también
await sharp(baseSvg(180))
  .png()
  .toFile(resolve(__dirname, '../public/apple-touch-icon.png'))
console.log('Wrote apple-touch-icon.png')

console.log('Done.')
