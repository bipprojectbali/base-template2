import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

// ── Config ────────────────────────────────────────────────────────────
const N   = 80     // particle count
const BOX = [10, 5.5, 3.5] as const  // half-extents
const THRESH_SQ = 3.2 * 3.2          // connection distance²

// ── Particle network (Points + LineSegments, both via primitive) ──────
function ParticleNetwork() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  // Particle state (positions + velocities)
  const particles = useMemo(() =>
    Array.from({ length: N }, () => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * BOX[0] * 2,
        (Math.random() - 0.5) * BOX[1] * 2,
        (Math.random() - 0.5) * BOX[2] * 2,
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.004,
        (Math.random() - 0.5) * 0.004,
        (Math.random() - 0.5) * 0.002,
      ),
    }))
  , [])

  // Points geometry (positions updated per frame)
  const ptGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return g
  }, [])

  // LineSegments geometry (connections updated per frame)
  const lnGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // Max lines: N*(N-1)/2 pairs × 2 endpoints × 3 floats
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3))
    return g
  }, [])

  // Three.js objects (avoid <line> → SVG ambiguity, use primitive)
  const ptObj = useMemo(() =>
    new THREE.Points(ptGeo,
      new THREE.PointsMaterial({ color: '#4f8ef7', size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.55 })
    ), [ptGeo])

  const lnObj = useMemo(() =>
    new THREE.LineSegments(lnGeo,
      new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.11 })
    ), [lnGeo])

  // Mouse tracking
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])

  useFrame(() => {
    // Subtle camera parallax
    camera.position.x += (mouse.current.x * 1.4 - camera.position.x) * 0.03
    camera.position.y += (mouse.current.y * 0.7 - camera.position.y) * 0.03
    camera.lookAt(0, 0, 0)

    // Update particle positions (drift + boundary bounce)
    const ptAttr = ptGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      const p = particles[i]
      p.pos.addScaledVector(p.vel, 1)
      if (Math.abs(p.pos.x) > BOX[0]) p.vel.x *= -1
      if (Math.abs(p.pos.y) > BOX[1]) p.vel.y *= -1
      if (Math.abs(p.pos.z) > BOX[2]) p.vel.z *= -1
      ptAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z)
    }
    ptAttr.needsUpdate = true

    // Update connection lines (O(N²) — fine for N=80)
    const lnAttr = lnGeo.attributes.position as THREE.BufferAttribute
    let vi = 0
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = particles[i].pos.x - particles[j].pos.x
        const dy = particles[i].pos.y - particles[j].pos.y
        const dz = particles[i].pos.z - particles[j].pos.z
        if (dx*dx + dy*dy + dz*dz < THRESH_SQ) {
          lnAttr.setXYZ(vi++, particles[i].pos.x, particles[i].pos.y, particles[i].pos.z)
          lnAttr.setXYZ(vi++, particles[j].pos.x, particles[j].pos.y, particles[j].pos.z)
        }
      }
    }
    lnGeo.setDrawRange(0, vi)
    lnAttr.needsUpdate = true
  })

  return (
    <>
      <primitive object={ptObj} />
      <primitive object={lnObj} />
    </>
  )
}

// ── Public export ─────────────────────────────────────────────────────
// Renders as a fixed full-screen canvas behind all page content.
// Add <Background3D /> at the top of any page component — no extra
// z-index setup needed; content renders above automatically.
export function Background3D() {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      camera={{ position: [0, 0, 8], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
      dpr={Math.min(window.devicePixelRatio, 1.5)}
    >
      <Suspense fallback={null}>
        <ParticleNetwork />
      </Suspense>
    </Canvas>
  )
}
