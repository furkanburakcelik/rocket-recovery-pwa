#!/usr/bin/env node
const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const LAT       = 31.04486
const LON       = -103.52794
const RADIUS_KM = 5
const MIN_ZOOM  = 13
const MAX_ZOOM  = 16

const TILE_URL = (z, x, y) =>
  `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`

const OUT_DIR = path.join(__dirname, 'public', 'tiles')

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y }
}

function degPerKmAtLat(lat) {
  const kmPerDeg = 111.32 * Math.cos(lat * Math.PI / 180)
  return 1 / kmPerDeg
}

const tiles = []
for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
  const deltaLat = RADIUS_KM / 111.32
  const deltaLon = degPerKmAtLat(LAT) * RADIUS_KM
  const topLeft     = latLonToTile(LAT + deltaLat, LON - deltaLon, z)
  const bottomRight = latLonToTile(LAT - deltaLat, LON + deltaLon, z)
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ z, x, y })
    }
  }
}

console.log(`Center: ${LAT}, ${LON}  |  Radius: ${RADIUS_KM}km  |  Zoom: ${MIN_ZOOM}–${MAX_ZOOM}`)
console.log(`Total tiles: ${tiles.length}`)

let done = 0, skipped = 0
const CONCURRENT = 8
const DELAY_MS   = 50

function downloadTile({ z, x, y }) {
  return new Promise((resolve) => {
    const dir  = path.join(OUT_DIR, String(z), String(x))
    const file = path.join(dir, `${y}.png`)
    if (fs.existsSync(file)) { skipped++; done++; resolve(); return }
    fs.mkdirSync(dir, { recursive: true })
    const url = TILE_URL(z, x, y)
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'RocketGroundStation/1.0',
        'Referer': 'https://www.usgs.gov/'
      }
    }, (res) => {
      if (res.statusCode !== 200) { done++; process.stdout.write(`\r[${done}/${tiles.length}]`); resolve(); return }
      const ws = fs.createWriteStream(file)
      res.pipe(ws)
      ws.on('finish', () => { done++; process.stdout.write(`\r[${done}/${tiles.length}] (${skipped} cached)`); resolve() })
    })
    req.on('error', () => { done++; resolve() })
  })
}

async function run() {
  const startMs = Date.now()
  for (let i = 0; i < tiles.length; i += CONCURRENT) {
    const batch = tiles.slice(i, i + CONCURRENT)
    await Promise.all(batch.map(downloadTile))
    if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS))
  }
  const secs = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`\nDone in ${secs}s. Output: ${OUT_DIR}`)
}

run().catch(console.error)
