import * as d3 from 'd3'
import { useEffect, useRef } from 'react'

type NodeDatum = d3.SimulationNodeDatum & {
  id: string
  label: string
  sub?: string
  r: number
  color: string
  tx: string
}

type LinkDatum = d3.SimulationLinkDatum<NodeDatum> & { idx: number }

const NODES: NodeDatum[] = [
  { id: 'root', label: 'Base', sub: 'Template', r: 48, color: '#4f8ef7', tx: '#fff' },
  { id: 'bun', label: 'Bun', r: 28, color: '#f5d5aa', tx: '#1a0800' },
  { id: 'elysia', label: 'Elysia', r: 28, color: '#5bc8fb', tx: '#021726' },
  { id: 'react', label: 'React', r: 28, color: '#61dafb', tx: '#021726' },
  { id: 'vite', label: 'Vite', r: 28, color: '#a855f7', tx: '#fff' },
  { id: 'prisma', label: 'Prisma', r: 28, color: '#6366f1', tx: '#fff' },
  { id: 'pg', label: 'PG', r: 28, color: '#3d7ee8', tx: '#fff' },
  { id: 'redis', label: 'Redis', r: 28, color: '#ff4438', tx: '#fff' },
  { id: 'auth', label: 'Auth', r: 28, color: '#22c55e', tx: '#fff' },
]

const LINK_DEFS = [
  ['root', 'bun'],
  ['root', 'elysia'],
  ['root', 'react'],
  ['root', 'vite'],
  ['root', 'prisma'],
  ['root', 'pg'],
  ['root', 'redis'],
  ['root', 'auth'],
  ['bun', 'elysia'],
  ['react', 'vite'],
  ['prisma', 'pg'],
  ['auth', 'elysia'],
]

interface Props {
  width: number
  height: number
}

export function TechNetwork({ width, height }: Props) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || width === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    // ── Defs ─────────────────────────────────────────────────────
    const defs = svg.append('defs')
    const filt = defs
      .append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
    filt.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'blur')
    const merge = filt.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const glow2 = defs
      .append('filter')
      .attr('id', 'glow2')
      .attr('x', '-100%')
      .attr('y', '-100%')
      .attr('width', '300%')
      .attr('height', '300%')
    glow2.append('feGaussianBlur').attr('stdDeviation', 12).attr('result', 'blur')
    const m2 = glow2.append('feMerge')
    m2.append('feMergeNode').attr('in', 'blur')
    m2.append('feMergeNode').attr('in', 'SourceGraphic')

    // ── Data ─────────────────────────────────────────────────────
    const nodes: NodeDatum[] = NODES.map((n) => ({ ...n }))
    const links: LinkDatum[] = LINK_DEFS.map(([s, t], i) => ({ source: s, target: t, idx: i }))

    // ── Groups ───────────────────────────────────────────────────
    const gLink = svg.append('g').attr('class', 'links')
    const gNode = svg.append('g').attr('class', 'nodes')

    // Inline animation keyframes
    svg.append('style').text(`
      @keyframes dash { to { stroke-dashoffset: -20 } }
      @keyframes pulse { 0%,100% { opacity:.18 } 50% { opacity:.32 } }
      @keyframes spin  { to { transform: rotate(360deg) } }
    `)

    // ── Links ────────────────────────────────────────────────────
    const linkSel = gLink
      .selectAll<SVGLineElement, LinkDatum>('line')
      .data(links)
      .join('line')
      .attr('stroke', 'rgba(99,163,255,0.22)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6 4')
      .style('animation', (_, i) => `dash ${2.2 + (i % 5) * 0.25}s linear infinite`)

    // ── Particle circles (RAF-driven) ────────────────────────────
    const PCOUNT = 2
    type Particle = { linkIdx: number; offset: number }
    const particleData: Particle[] = links.flatMap((_, i) =>
      Array.from({ length: PCOUNT }, (__, p) => ({ linkIdx: i, offset: p / PCOUNT })),
    )
    const partSel = gLink
      .selectAll<SVGCircleElement, Particle>('circle.pt')
      .data(particleData)
      .join('circle')
      .attr('class', 'pt')
      .attr('r', 2.5)
      .attr('fill', '#63a3ff')
      .attr('opacity', 0.65)

    // ── Nodes ────────────────────────────────────────────────────
    const nodeSel = gNode
      .selectAll<SVGGElement, NodeDatum>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'grab')

    // Outer pulse ring (root only)
    nodeSel
      .filter((d) => d.id === 'root')
      .append('circle')
      .attr('r', 70)
      .attr('fill', 'rgba(79,142,247,0.08)')
      .attr('stroke', 'rgba(79,142,247,0.2)')
      .attr('stroke-width', 1)
      .style('animation', 'pulse 3s ease-in-out infinite')

    // Node body
    nodeSel
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => d.color)
      .attr('stroke', 'rgba(255,255,255,0.18)')
      .attr('stroke-width', 1.5)
      .attr('filter', (d) => (d.id === 'root' ? 'url(#glow2)' : 'url(#glow)'))

    // Label
    nodeSel
      .append('text')
      .text((d) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', (d) => (d.sub ? 'auto' : 'central'))
      .attr('dy', (d) => (d.sub ? '-5' : '0'))
      .attr('fill', (d) => d.tx)
      .attr('font-size', (d) => (d.id === 'root' ? 15 : 11))
      .attr('font-weight', 800)
      .attr('font-family', 'system-ui, sans-serif')
      .attr('pointer-events', 'none')

    nodeSel
      .filter((d) => !!d.sub)
      .append('text')
      .text((d) => d.sub!)
      .attr('text-anchor', 'middle')
      .attr('dy', '12')
      .attr('fill', (d) => d.tx)
      .attr('font-size', 15)
      .attr('font-weight', 800)
      .attr('font-family', 'system-ui, sans-serif')
      .attr('pointer-events', 'none')

    // ── Hover ────────────────────────────────────────────────────
    nodeSel
      .on('mouseenter', function (_, d) {
        d3.select(this)
          .select('circle:nth-child(2)')
          .transition()
          .duration(180)
          .attr('r', d.r * 1.18)
        linkSel
          .attr('stroke', (l) => {
            const s = (l.source as NodeDatum).id,
              t = (l.target as NodeDatum).id
            return s === d.id || t === d.id ? 'rgba(99,163,255,0.7)' : 'rgba(99,163,255,0.08)'
          })
          .attr('stroke-width', (l) => {
            const s = (l.source as NodeDatum).id,
              t = (l.target as NodeDatum).id
            return s === d.id || t === d.id ? 2.5 : 1
          })
      })
      .on('mouseleave', function (_, d) {
        d3.select(this).select('circle:nth-child(2)').transition().duration(180).attr('r', d.r)
        linkSel.attr('stroke', 'rgba(99,163,255,0.22)').attr('stroke-width', 1.5)
      })

    // ── Drag ─────────────────────────────────────────────────────
    const drag = d3
      .drag<SVGGElement, NodeDatum>()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (e, d) => {
        d.fx = e.x
        d.fy = e.y
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
    nodeSel.call(drag)

    // ── Mouse repulsion ──────────────────────────────────────────
    svg
      .on('mousemove', (evt) => {
        const [mx, my] = d3.pointer(evt)
        nodes.forEach((n) => {
          const dx = (n.x ?? 0) - mx,
            dy = (n.y ?? 0) - my
          const dist = Math.hypot(dx, dy)
          if (dist < 160 && dist > 0) {
            const f = ((160 - dist) / 160) * 4
            n.vx = (n.vx ?? 0) + (dx / dist) * f
            n.vy = (n.vy ?? 0) + (dy / dist) * f
          }
        })
        sim.alphaTarget(0.08).restart()
      })
      .on('mouseleave', () => sim.alphaTarget(0))

    // ── Simulation ───────────────────────────────────────────────
    const sim = d3
      .forceSimulation<NodeDatum>(nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance(170)
          .strength(0.38),
      )
      .force('charge', d3.forceManyBody().strength(-520))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide<NodeDatum>((d) => d.r + 22),
      )

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as NodeDatum).x ?? 0)
        .attr('y1', (d) => (d.source as NodeDatum).y ?? 0)
        .attr('x2', (d) => (d.target as NodeDatum).x ?? 0)
        .attr('y2', (d) => (d.target as NodeDatum).y ?? 0)
      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // ── RAF loop for particles (runs even after sim cools) ───────
    let raf: number
    const tick = () => {
      const t = performance.now() / 1000
      partSel.each(function (p) {
        const lk = links[p.linkIdx]
        const sx = (lk.source as NodeDatum).x ?? 0,
          sy = (lk.source as NodeDatum).y ?? 0
        const tx = (lk.target as NodeDatum).x ?? 0,
          ty = (lk.target as NodeDatum).y ?? 0
        const prog = (t / (3 + p.linkIdx * 0.22) + p.offset) % 1
        d3.select(this)
          .attr('cx', sx + (tx - sx) * prog)
          .attr('cy', sy + (ty - sy) * prog)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      sim.stop()
      cancelAnimationFrame(raf)
      svg.on('mousemove', null).on('mouseleave', null)
    }
  }, [width, height])

  return <svg ref={ref} width={width} height={height} style={{ display: 'block' }} />
}
