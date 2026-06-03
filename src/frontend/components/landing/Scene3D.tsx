import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

// ── Orbit config ──────────────────────────────────────────────────────
const ORBITERS = [
  { label: 'Bun',        color: '#f5d5aa', r: 3.0, spd: 0.32, phi0: 0,    tilt: 0.12  },
  { label: 'Elysia',     color: '#5bc8fb', r: 2.6, spd: 0.52, phi0: 0.78, tilt: -0.28 },
  { label: 'React',      color: '#61dafb', r: 3.3, spd: 0.42, phi0: 1.57, tilt: 0.38  },
  { label: 'Vite',       color: '#a855f7', r: 2.5, spd: 0.68, phi0: 2.35, tilt: -0.48 },
  { label: 'Prisma',     color: '#6366f1', r: 3.5, spd: 0.28, phi0: 3.14, tilt: 0.22  },
  { label: 'PG',         color: '#3d7ee8', r: 2.8, spd: 0.48, phi0: 3.93, tilt: -0.15 },
  { label: 'Redis',      color: '#ff4438', r: 3.1, spd: 0.38, phi0: 4.71, tilt: 0.55  },
  { label: 'Auth',       color: '#22c55e', r: 2.7, spd: 0.58, phi0: 5.50, tilt: -0.42 },
]

// ── Star field (pure Three.js Points — no drei, no async) ─────────────
function StarField() {
  const obj = useMemo(() => {
    const n   = 3000
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 40 + Math.random() * 40
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.7 })
    return new THREE.Points(geo, mat)
  }, [])

  return <primitive object={obj} />
}

// ── Center glowing sphere (standard material, no external shaders) ─────
function CenterSphere() {
  const meshRef  = useRef<THREE.Mesh>(null!)
  const glowRef  = useRef<THREE.Mesh>(null!)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    meshRef.current.rotation.y = t * 0.3
    meshRef.current.rotation.x = Math.sin(t * 0.2) * 0.2
    // subtle scale pulse
    const s = 1 + Math.sin(t * 1.5) * 0.04
    meshRef.current.scale.setScalar(s)
    glowRef.current.scale.setScalar(s * 1.3)
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshStandardMaterial color="#1e40af" emissive="#1d4ed8" emissiveIntensity={0.8} roughness={0.2} metalness={0.5} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.85, 16, 16]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

// ── Orbit ring ────────────────────────────────────────────────────────
function OrbitRing({ r, tilt }: { r: number; tilt: number }) {
  const obj = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r * Math.cos(tilt), Math.sin(tilt) * r, Math.sin(a) * r * Math.cos(tilt)))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#1e3a5f', transparent: true, opacity: 0.4 }))
  }, [r, tilt])
  return <primitive object={obj} />
}

// ── Connection lines ──────────────────────────────────────────────────
function ConnectionLines() {
  const lines = useMemo(() => ORBITERS.map(o => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.18 }))
  }), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    ORBITERS.forEach((o, i) => {
      const phi = o.phi0 + t * o.spd
      const attr = lines[i].geometry.attributes.position as THREE.BufferAttribute
      attr.setXYZ(1, Math.cos(phi) * o.r * Math.cos(o.tilt), Math.sin(o.tilt) * o.r, Math.sin(phi) * o.r * Math.cos(o.tilt))
      attr.needsUpdate = true
    })
  })

  return <>{lines.map((l, i) => <primitive key={i} object={l} />)}</>
}

// ── Orbiting node ─────────────────────────────────────────────────────
type OrbiterProps = typeof ORBITERS[0]

function Orbiter({ color, r, spd, phi0, tilt }: OrbiterProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRef  = useRef<THREE.Mesh>(null!)
  const [hov, setHov] = useState(false)
  const { gl } = useThree()
  const sv = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame(({ clock }) => {
    const phi = phi0 + clock.getElapsedTime() * spd
    groupRef.current.position.set(
      Math.cos(phi) * r * Math.cos(tilt),
      Math.sin(tilt) * r,
      Math.sin(phi) * r * Math.cos(tilt),
    )
    sv.setScalar(hov ? 1.5 : 1)
    meshRef.current.scale.lerp(sv, 0.12)
  })

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}
        onPointerEnter={() => { setHov(true);  gl.domElement.style.cursor = 'pointer' }}
        onPointerLeave={() => { setHov(false); gl.domElement.style.cursor = 'default'  }}
      >
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hov ? 1.2 : 0.5} roughness={0.2} metalness={0.4} />
      </mesh>
    </group>
  )
}

// ── Camera parallax ───────────────────────────────────────────────────
function CameraRig() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])
  useFrame(() => {
    camera.position.x += (mouse.current.x * 1.8 - camera.position.x) * 0.04
    camera.position.y += (mouse.current.y * 0.9 - camera.position.y) * 0.04
    camera.lookAt(0, 0, 0)
  })
  return null
}

// ── Public export — NO Suspense, NO drei, pure R3F ────────────────────
export function Scene3D() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: [0, 0, 7.5], fov: 52 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#09090f']} />

      <ambientLight intensity={0.3} />
      <pointLight position={[4, 6, 4]}   color="#60a5fa" intensity={50} distance={18} />
      <pointLight position={[-4, -4, 2]}  color="#818cf8" intensity={25} distance={14} />
      <pointLight position={[0, 0, 3]}   color="#ffffff"  intensity={10} distance={8}  />

      <StarField />
      <CenterSphere />
      {ORBITERS.map(o => <OrbitRing key={o.label} r={o.r} tilt={o.tilt} />)}
      <ConnectionLines />
      {ORBITERS.map(o => <Orbiter key={o.label} {...o} />)}
      <CameraRig />
    </Canvas>
  )
}
