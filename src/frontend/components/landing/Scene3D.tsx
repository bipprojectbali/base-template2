import { Float, Html, MeshDistortMaterial, Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

// ── Orbit data ────────────────────────────────────────────────────────
const ORBITERS = [
  { label: 'Bun', color: '#f5d5aa', r: 3.0, spd: 0.32, phi0: 0, tilt: 0.12 },
  { label: 'Elysia', color: '#5bc8fb', r: 2.6, spd: 0.52, phi0: 0.78, tilt: -0.28 },
  { label: 'React', color: '#61dafb', r: 3.3, spd: 0.42, phi0: 1.57, tilt: 0.38 },
  { label: 'Vite', color: '#a855f7', r: 2.5, spd: 0.68, phi0: 2.35, tilt: -0.48 },
  { label: 'Prisma', color: '#6366f1', r: 3.5, spd: 0.28, phi0: 3.14, tilt: 0.22 },
  { label: 'PostgreSQL', color: '#3d7ee8', r: 2.8, spd: 0.48, phi0: 3.93, tilt: -0.15 },
  { label: 'Redis', color: '#ff4438', r: 3.1, spd: 0.38, phi0: 4.71, tilt: 0.55 },
  { label: 'Auth', color: '#22c55e', r: 2.7, spd: 0.58, phi0: 5.5, tilt: -0.42 },
]

// ── Camera parallax ───────────────────────────────────────────────────
function CameraRig() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2
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

// ── Glowing center sphere ─────────────────────────────────────────────
function CenterSphere() {
  return (
    <Float speed={1.4} rotationIntensity={0.6} floatIntensity={0.4}>
      <mesh>
        <sphereGeometry args={[0.85, 64, 64]} />
        <MeshDistortMaterial
          color="#1e40af"
          emissive="#1d4ed8"
          emissiveIntensity={0.65}
          distort={0.38}
          speed={2.2}
          roughness={0.1}
          metalness={0.4}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.08, 32, 32]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.055} side={THREE.BackSide} />
      </mesh>
    </Float>
  )
}

// ── Static orbit ring (uses primitive to avoid SVG <line> ambiguity) ──
function OrbitRing({ r, tilt }: { r: number; tilt: number }) {
  const obj = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 2
      pts.push(
        new THREE.Vector3(Math.cos(a) * r * Math.cos(tilt), Math.sin(tilt) * r, Math.sin(a) * r * Math.cos(tilt)),
      )
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.1 })
    return new THREE.Line(geo, mat)
  }, [r, tilt])

  return <primitive object={obj} />
}

// ── Live connection lines center → orbiter ────────────────────────────
function ConnectionLines() {
  const lines = useMemo(
    () =>
      ORBITERS.map((o) => {
        const pos = new Float32Array(6) // 2 × vec3
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        const mat = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.14 })
        return new THREE.Line(geo, mat)
      }),
    [],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    ORBITERS.forEach((o, i) => {
      const phi = o.phi0 + t * o.spd
      const x = Math.cos(phi) * o.r * Math.cos(o.tilt)
      const y = Math.sin(o.tilt) * o.r
      const z = Math.sin(phi) * o.r * Math.cos(o.tilt)
      const attr = lines[i].geometry.attributes.position as THREE.BufferAttribute
      attr.setXYZ(1, x, y, z)
      attr.needsUpdate = true
    })
  })

  return (
    <>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </>
  )
}

// ── Orbiting tech node ────────────────────────────────────────────────
type OrbiterProps = (typeof ORBITERS)[0]

function Orbiter({ label, color, r, spd, phi0, tilt }: OrbiterProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)
  const { gl } = useThree()
  const scaleVec = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame(({ clock }) => {
    const phi = phi0 + clock.getElapsedTime() * spd
    groupRef.current.position.set(
      Math.cos(phi) * r * Math.cos(tilt),
      Math.sin(tilt) * r,
      Math.sin(phi) * r * Math.cos(tilt),
    )
    const target = hovered ? 1.45 : 1
    scaleVec.setScalar(target)
    meshRef.current.scale.lerp(scaleVec, 0.12)
  })

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        onPointerEnter={() => {
          setHovered(true)
          gl.domElement.style.cursor = 'pointer'
        }}
        onPointerLeave={() => {
          setHovered(false)
          gl.domElement.style.cursor = 'default'
        }}
      >
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.0 : 0.35}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>
      <Html center position={[0, 0.44, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <span
          style={{
            color,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'nowrap',
            textShadow: `0 0 10px ${color}99`,
            opacity: hovered ? 1 : 0.78,
            transition: 'opacity 0.2s',
          }}
        >
          {label}
        </span>
      </Html>
    </group>
  )
}

// ── Scene assembly ────────────────────────────────────────────────────
function SceneContent() {
  return (
    <>
      <Stars radius={80} depth={60} count={4000} factor={3} saturation={0} fade speed={0.6} />
      <fog attach="fog" args={['#09090f', 14, 30]} />

      <ambientLight intensity={0.25} />
      <pointLight position={[4, 6, 4]} color="#60a5fa" intensity={60} distance={18} />
      <pointLight position={[-4, -4, 2]} color="#818cf8" intensity={30} distance={14} />
      <pointLight position={[0, 0, 3]} color="#ffffff" intensity={12} distance={8} />

      <CenterSphere />

      {ORBITERS.map((o) => (
        <OrbitRing key={o.label} r={o.r} tilt={o.tilt} />
      ))}
      <ConnectionLines />
      {ORBITERS.map((o) => (
        <Orbiter key={o.label} {...o} />
      ))}

      <CameraRig />
    </>
  )
}

// ── Public export ─────────────────────────────────────────────────────
export function Scene3D() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      camera={{ position: [0, 0, 7.5], fov: 52 }}
      gl={{ antialias: true, alpha: false }}
      dpr={Math.min(window.devicePixelRatio, 2)}
    >
      <color attach="background" args={['#09090f']} />
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  )
}
