import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  userLat: number
  userLon: number
  rocketLat: number
  rocketLon: number
}

const rocketIcon = L.divIcon({
  html: `<div style="font-size:24px;line-height:1;transform:translate(-50%,-100%)">🚀</div>`,
  className: '',
  iconAnchor: [0, 0],
})

const userIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#00ff00;border:2px solid #fff;transform:translate(-50%,-50%)"></div>`,
  className: '',
  iconAnchor: [0, 0],
})

export default function RecoveryMap({ userLat, userLon, rocketLat, rocketLon }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [rocketLat, rocketLon],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    })

    L.tileLayer('/tiles/{z}/{x}/{y}.png', {
      minZoom: 13,
      maxZoom: 16,
      errorTileUrl: '',
    }).addTo(map)

    L.marker([rocketLat, rocketLon], { icon: rocketIcon }).addTo(map)

    userMarkerRef.current = L.marker([userLat, userLon], { icon: userIcon }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !userMarkerRef.current) return
    userMarkerRef.current.setLatLng([userLat, userLon])
    mapRef.current.setView(
      [(userLat + rocketLat) / 2, (userLon + rocketLon) / 2],
      mapRef.current.getZoom(),
      { animate: true }
    )
  }, [userLat, userLon])

  return <div ref={containerRef} style={{ width: '100%', height: '300px', borderRadius: '8px', border: '1px solid #333' }} />
}
