import { useEffect, useRef } from 'react'

// ── Orbit config ──────────────────────────────────────────────────────
const ORBITERS = [
  { label: 'Bun',    color: '#f5d5aa', r: 175, spd: 0.32, phi0: 0,    tilt: 0.15  },
  { label: 'Elysia', color: '#5bc8fb', r: 150, spd: 0.52, phi0: 0.78, tilt: -0.28 },
  { label: 'React',  color: '#61dafb', r: 200, spd: 0.42, phi0: 1.57, tilt: 0.38  },
  { label: 'Vite',   color: '#a855f7', r: 140, spd: 0.68, phi0: 2.35, tilt: -0.48 },
  { label: 'Prisma', color: '#6366f1', r: 215, spd: 0.28, phi0: 3.14, tilt: 0.22  },
  { label: 'PG',     color: '#3d7ee8', r: 162, spd: 0.48, phi0: 3.93, tilt: -0.15 },
  { label: 'Redis',  color: '#ff4438', r: 190, spd: 0.38, phi0: 4.71, tilt: 0.55  },
  { label: 'Auth',   color: '#22c55e', r: 158, spd: 0.58, phi0: 5.50, tilt: -0.42 },
]

const FOV = 380

function hex2rgb(hex: string) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

function rotate(x: number, y: number, z: number, camX: number, camY: number) {
  const cY = Math.cos(camY), sY = Math.sin(camY)
  const x1 = x*cY - z*sY, z1 = x*sY + z*cY
  const cX = Math.cos(camX), sX = Math.sin(camX)
  return { x: x1, y: y*cX - z1*sX, z: y*sX + z1*cX }
}

function proj(x: number, y: number, z: number, cx: number, cy: number) {
  const s = FOV / (FOV + z)
  return { sx: x*s + cx, sy: y*s + cy, scale: s }
}

// ── Canvas 2D — zero external dependencies ────────────────────────────
export function Scene3D() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let camX = 0, camY = 0, tCamX = 0, tCamY = 0

    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width  = canvas.offsetWidth  * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const onMouse = (e: MouseEvent) => {
      tCamY =  (e.clientX / innerWidth  - 0.5) * 0.7
      tCamX = -(e.clientY / innerHeight - 0.5) * 0.45
    }
    window.addEventListener('mousemove', onMouse)

    // Stars
    const STARS = Array.from({ length: 280 }, () => ({
      x: (Math.random() - 0.5) * 2200,
      y: (Math.random() - 0.5) * 2200,
      z: Math.random() * 600 + 100,
      s: Math.random() * 1.4 + 0.4,
    }))

    let t = 0
    const draw = () => {
      t += 0.016
      camX += (tCamX - camX) * 0.04
      camY += (tCamY - camY) * 0.04

      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      const dpr = Math.min(devicePixelRatio, 2)

      // Background
      ctx.fillStyle = '#09090f'
      ctx.fillRect(0, 0, W, H)

      // Stars
      STARS.forEach(st => {
        const r = rotate(st.x, st.y, st.z, camX, camY)
        if (r.z > -FOV + 50) {
          const p = proj(r.x, r.y, r.z, cx, cy)
          const alpha = Math.min(0.9, (r.z + 700) / 900) * 0.7
          ctx.beginPath()
          ctx.arc(p.sx, p.sy, Math.max(0.5, st.s * p.scale * dpr), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`
          ctx.fill()
        }
      })

      // Orbiter 3D positions
      const ops = ORBITERS.map(o => {
        const phi = o.phi0 + t * o.spd
        const ox = Math.cos(phi) * o.r * Math.cos(o.tilt)
        const oy = Math.sin(o.tilt) * o.r
        const oz = Math.sin(phi) * o.r * Math.cos(o.tilt)
        const rv = rotate(ox, oy, oz, camX, camY)
        const p  = proj(rv.x, rv.y, rv.z, cx, cy)
        return { ...o, ...p, rz: rv.z }
      })

      // Orbit rings
      ORBITERS.forEach(o => {
        ctx.beginPath()
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2
          const rv = rotate(Math.cos(a)*o.r*Math.cos(o.tilt), Math.sin(o.tilt)*o.r, Math.sin(a)*o.r*Math.cos(o.tilt), camX, camY)
          const p  = proj(rv.x, rv.y, rv.z, cx, cy)
          i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)
        }
        ctx.closePath()
        ctx.strokeStyle = 'rgba(30,58,100,0.45)'
        ctx.lineWidth = 1
        ctx.stroke()
      })

      // Center projected
      const cP = proj(0, 0, 0, cx, cy)

      // Connection lines
      ops.forEach(op => {
        ctx.beginPath()
        ctx.moveTo(cP.sx, cP.sy)
        ctx.lineTo(op.sx, op.sy)
        const a = Math.max(0.05, 0.22 - op.rz / 2000)
        ctx.strokeStyle = `rgba(${hex2rgb(op.color)},${a.toFixed(2)})`
        ctx.lineWidth = 1
        ctx.stroke()
      })

      // Center sphere glow
      const pulse = 1 + Math.sin(t * 1.6) * 0.04
      const CR = 40 * dpr * pulse
      const gC = ctx.createRadialGradient(cP.sx, cP.sy, 0, cP.sx, cP.sy, CR * 2.5)
      gC.addColorStop(0, 'rgba(79,142,247,0.85)')
      gC.addColorStop(0.5, 'rgba(29,78,216,0.35)')
      gC.addColorStop(1, 'rgba(29,78,216,0)')
      ctx.beginPath(); ctx.arc(cP.sx, cP.sy, CR * 2.5, 0, Math.PI*2)
      ctx.fillStyle = gC; ctx.fill()
      ctx.beginPath(); ctx.arc(cP.sx, cP.sy, CR, 0, Math.PI*2)
      ctx.fillStyle = '#1e40af'; ctx.fill()

      // Orbiters — depth sorted
      ops.sort((a, b) => b.rz - a.rz).forEach(op => {
        const R  = Math.max(5, 14 * op.scale * dpr)
        const rgb = hex2rgb(op.color)
        // Glow
        const gO = ctx.createRadialGradient(op.sx, op.sy, 0, op.sx, op.sy, R * 3)
        gO.addColorStop(0, `rgba(${rgb},0.45)`)
        gO.addColorStop(1, `rgba(${rgb},0)`)
        ctx.beginPath(); ctx.arc(op.sx, op.sy, R*3, 0, Math.PI*2)
        ctx.fillStyle = gO; ctx.fill()
        // Body
        ctx.beginPath(); ctx.arc(op.sx, op.sy, R, 0, Math.PI*2)
        ctx.fillStyle = op.color; ctx.fill()
        // Label
        const fs = Math.round(Math.max(9, 11 * op.scale) * dpr)
        ctx.font = `600 ${fs}px system-ui,sans-serif`
        ctx.fillStyle = `rgba(${rgb},0.9)`
        ctx.textAlign = 'center'
        ctx.fillText(op.label, op.sx, op.sy - R - 4*dpr)
      })

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('mousemove', onMouse) }
  }, [])

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}
