import { useState, useEffect, useRef } from 'react'
import QrScanner from 'qr-scanner'
import './App.css'

type Phase = 'ENTRY' | 'DRIVING' | 'WALKING' | 'FOUND'

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const urlLat = params.get('lat') ? parseFloat(params.get('lat')!) : null
  const urlLon = params.get('lon') ? parseFloat(params.get('lon')!) : null
  const urlT   = params.get('t')   ? parseInt(params.get('t')!, 10) : null

  const [phase, setPhase] = useState<Phase>('ENTRY')
  const [rocketLat, setRocketLat] = useState<number | null>(urlLat)
  const [rocketLon, setRocketLon] = useState<number | null>(urlLon)
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [manualError, setManualError] = useState('')

  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLon, setUserLon] = useState<number | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [heading, setHeading] = useState<number>(0)
  const [compassGranted, setCompassGranted] = useState(false)
  const [foundAt, setFoundAt] = useState<string | null>(null)

  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // QR scanner — active when scanning=true
  useEffect(() => {
    if (!scanning || !videoRef.current) return
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        try {
          const url = new URL(result.data)
          const lat = parseFloat(url.searchParams.get('lat') ?? '')
          const lon = parseFloat(url.searchParams.get('lon') ?? '')
          if (!isNaN(lat) && !isNaN(lon)) {
            scanner.stop()
            setRocketLat(lat)
            setRocketLon(lon)
            setScanning(false)
            setPhase('DRIVING')
          }
        } catch { /* not a valid URL */ }
      },
      { returnDetailedScanResult: true, preferredCamera: 'environment' }
    )
    scanner.start()
    scannerRef.current = scanner
    return () => { scanner.stop(); scanner.destroy() }
  }, [scanning])

  // GPS watch — active only during WALKING
  useEffect(() => {
    if (phase !== 'WALKING') {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLon(pos.coords.longitude)
        setAccuracy(pos.coords.accuracy)
        setGpsError(null)
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 1000 },
    )
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [phase])

  // Auto-advance to FOUND when within 10m
  useEffect(() => {
    if (
      phase !== 'WALKING' ||
      userLat === null || userLon === null ||
      rocketLat === null || rocketLon === null
    ) return
    const dist = haversineDistance(userLat, userLon, rocketLat, rocketLon)
    if (dist < 10) {
      setFoundAt(new Date().toLocaleTimeString())
      setPhase('FOUND')
    }
  }, [userLat, userLon, phase, rocketLat, rocketLon])

  function startListening() {
    window.addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
      const h =
        typeof (e as any).webkitCompassHeading === 'number'
          ? (e as any).webkitCompassHeading  // iOS — manyetik kuzey'e göre
          : e.alpha ?? 0                      // Android
      setHeading(h)
    })
    setCompassGranted(true)
  }

  async function requestCompass() {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      const perm = await (DeviceOrientationEvent as any).requestPermission()
      if (perm === 'granted') startListening()
    } else {
      startListening()
    }
  }

  function confirmManual() {
    const lat = parseFloat(manualLat)
    const lon = parseFloat(manualLon)
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setManualError('LAT must be between -90 and 90')
      return
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setManualError('LON must be between -180 and 180')
      return
    }
    setRocketLat(lat)
    setRocketLon(lon)
    setManualError('')
    setPhase('DRIVING')
  }

  function reset() {
    setPhase('ENTRY')
    setRocketLat(urlLat)
    setRocketLon(urlLon)
    setUserLat(null)
    setUserLon(null)
    setAccuracy(null)
    setGpsError(null)
    setFoundAt(null)
    setManualLat('')
    setManualLon('')
    setManualError('')
  }

  const timeLabel = urlT
    ? (() => {
        const d = new Date(urlT * 1000)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
      })()
    : null

  const dist =
    phase === 'WALKING' &&
    userLat !== null && userLon !== null &&
    rocketLat !== null && rocketLon !== null
      ? haversineDistance(userLat, userLon, rocketLat, rocketLon)
      : null

  const arrowRot =
    userLat !== null && userLon !== null &&
    rocketLat !== null && rocketLon !== null
      ? (calcBearing(userLat, userLon, rocketLat, rocketLon) - heading + 360) % 360
      : 0

  // ── ENTRY ─────────────────────────────────────────────────────────────────────
  if (phase === 'ENTRY') {
    if (rocketLat !== null && rocketLon !== null) {
      return (
        <div className="screen">
          <h1 className="title green">✓ ROCKET LOCATED</h1>
          <div className="coords-block">
            <div className="coord-row">
              <span className="coord-label">LAT</span>
              <code className="coord-value">{rocketLat.toFixed(6)}</code>
            </div>
            <div className="coord-row">
              <span className="coord-label">LON</span>
              <code className="coord-value">{rocketLon.toFixed(6)}</code>
            </div>
            {timeLabel && (
              <div className="coord-row">
                <span className="coord-label">TIME</span>
                <code className="coord-value">{timeLabel}</code>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setPhase('DRIVING')}>
            START RECOVERY →
          </button>
        </div>
      )
    }

    if (scanning) {
      return (
        <div className="screen">
          <h1 className="title white">SCAN QR CODE</h1>
          <div className="scanner-wrap">
            <video ref={videoRef} className="scanner-video" />
          </div>
          <button className="btn btn-secondary" onClick={() => setScanning(false)}>
            CANCEL
          </button>
        </div>
      )
    }

    return (
      <div className="screen">
        <h1 className="title white">ENTER ROCKET COORDINATES</h1>
        <button className="btn btn-primary" onClick={() => setScanning(true)}>
          📷 SCAN QR CODE
        </button>
        <p className="tip">— or enter manually —</p>
        <div className="form-group">
          <label className="form-label">LAT</label>
          <input
            className="form-input"
            inputMode="decimal"
            placeholder="e.g. 31.044840"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">LON</label>
          <input
            className="form-input"
            inputMode="decimal"
            placeholder="e.g. -103.536240"
            value={manualLon}
            onChange={(e) => setManualLon(e.target.value)}
          />
        </div>
        {manualError && <p className="error-text">{manualError}</p>}
        <button className="btn btn-secondary" onClick={confirmManual}>
          CONFIRM
        </button>
      </div>
    )
  }

  // ── DRIVING ───────────────────────────────────────────────────────────────────
  if (phase === 'DRIVING') {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${rocketLat},${rocketLon}&travelmode=driving`
    return (
      <div className="screen">
        <h1 className="title white">DRIVE TO LANDING ZONE</h1>
        <div className="coords-small">
          <span>{rocketLat?.toFixed(6)}</span>
          <span>{rocketLon?.toFixed(6)}</span>
        </div>
        <a className="btn btn-primary" href={mapsUrl} target="_blank" rel="noreferrer">
          OPEN IN GOOGLE MAPS →
        </a>
        <a className="btn btn-secondary" href={`https://osmand.net/go?lat=${rocketLat}&lon=${rocketLon}&z=15`} target="_blank" rel="noreferrer">
          OPEN IN OSMAND (OFFLINE) →
        </a>
        <p className="tip">Tip: Pre-download offline map before departure</p>
        <button className="btn btn-secondary" onClick={() => setPhase('WALKING')}>
          I'VE ARRIVED — START WALKING
        </button>
      </div>
    )
  }

  // ── WALKING ───────────────────────────────────────────────────────────────────
  if (phase === 'WALKING') {
    return (
      <div className="screen">
        <h1 className="title white">WALK TO ROCKET</h1>

        {dist !== null ? (
          <div className="dist-label">{formatDist(dist)}</div>
        ) : (
          <div className="acquiring">Acquiring GPS...</div>
        )}

        <div className="arrow-wrap">
          <div
            className="arrow"
            style={{ transform: `rotate(${arrowRot}deg)`, transition: 'transform 0.3s ease' }}
          >
            ↑
          </div>
        </div>

        {accuracy !== null && (
          <p className={`accuracy ${accuracy > 50 ? 'warn' : 'ok'}`}>
            {accuracy > 50 ? '⚠ Low GPS accuracy  ' : ''}GPS ±{Math.round(accuracy)}m
          </p>
        )}

        {gpsError && <p className="error-text">{gpsError}</p>}

        {!compassGranted && (
          <button className="btn btn-secondary" onClick={requestCompass}>
            ENABLE COMPASS
          </button>
        )}
      </div>
    )
  }

  // ── FOUND ─────────────────────────────────────────────────────────────────────
  return (
    <div className="screen">
      <h1 className="title green">✓ ROCKET FOUND!</h1>
      {foundAt && <p className="found-time">Completed at {foundAt}</p>}
      <button className="btn btn-secondary" onClick={reset}>
        NEW MISSION
      </button>
    </div>
  )
}
