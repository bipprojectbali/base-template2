import { Badge, Group, Stack, Text } from '@mantine/core'
import { Handle, Position } from '@xyflow/react'
import { useState } from 'react'
import { AUTH_COLORS, CATEGORY_COLORS, COVERAGE_COLORS, type EnvVar, METHOD_COLORS } from '../shared'

export function openInEditor(relativePath: string) {
  fetch('/__open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relativePath, lineNumber: '1', columnNumber: '1' }),
  }).catch(() => {})
}

export function RouteNode({
  data,
}: {
  data: { method: string; path: string; auth: string; category: string; description: string }
}) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        minWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={METHOD_COLORS[data.method] || 'gray'} variant="filled">
          {data.method}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {data.path}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" lineClamp={1}>
        {data.description}
      </Text>
      <Group gap={4} mt={4}>
        <Badge size="xs" variant="dot" color={AUTH_COLORS[data.auth] || 'gray'}>
          {data.auth}
        </Badge>
        <Badge size="xs" variant="light" color={CATEGORY_COLORS[data.category] || 'gray'}>
          {data.category}
        </Badge>
      </Group>
    </div>
  )
}

export function FileNode2({
  data,
}: {
  data: {
    path: string
    category: string
    lines: number
    exports: string[]
    imports: { from: string; names: string[] }[]
  }
}) {
  const name = data.path.split('/').pop() || data.path
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        minWidth: 180,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
      onDoubleClick={() => openInEditor(data.path)}
      title="Double-click to open in editor"
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-violet-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-violet-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="filled">
          {data.category}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {name}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" ff="monospace">
        {data.path}
      </Text>
      <Group gap={8} mt={4}>
        <Text size="xs" c="dimmed">
          {data.lines} lines
        </Text>
        {data.exports.length > 0 && (
          <Badge size="xs" variant="light" color="green">
            {data.exports.length} exports
          </Badge>
        )}
        {data.imports.length > 0 && (
          <Badge size="xs" variant="light" color="blue">
            {data.imports.length} imports
          </Badge>
        )}
      </Group>
    </button>
  )
}

export function FlowNode({ data }: { data: { label: string; description?: string; color?: string; type?: string } }) {
  const isDiamond = data.type === 'decision'
  return (
    <div
      style={{
        padding: isDiamond ? 12 : 8,
        borderRadius: isDiamond ? 4 : 8,
        border: `2px solid var(--mantine-color-${data.color || 'blue'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: isDiamond ? 120 : 160,
        textAlign: 'center',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={{ background: `var(--mantine-color-${data.color || 'blue'}-6)` }}
      />
      <Text size="xs" fw={700}>
        {data.label}
      </Text>
      {data.description && (
        <Text size="xs" c="dimmed">
          {data.description}
        </Text>
      )}
    </div>
  )
}

export function EnvVarNode({ data }: { data: EnvVar }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.isSet ? 'green' : 'red'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 200,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={data.required ? 'red' : 'gray'} variant="filled">
          {data.required ? 'required' : 'optional'}
        </Badge>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="light">
          {data.category}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace">
        {data.name}
      </Text>
      <Text size="xs" c="dimmed">
        {data.description}
      </Text>
      <Group gap={6} mt={4}>
        <Badge size="xs" color={data.isSet ? 'green' : 'red'} variant="dot">
          {data.isSet ? 'set' : 'unset'}
        </Badge>
        {data.default && (
          <Text size="xs" c="dimmed">
            default: {data.default}
          </Text>
        )}
      </Group>
    </div>
  )
}

export function SourceNode({
  data,
}: {
  data: { path: string; lines: number; exports: string[]; coverage: string; testedBy: string[] }
}) {
  const name = data.path.split('/').pop() || data.path
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${COVERAGE_COLORS[data.coverage] || 'gray'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
      onDoubleClick={() => openInEditor(data.path)}
      title="Double-click to open in editor"
    >
      <Handle type="target" position={Position.Right} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Handle type="source" position={Position.Left} style={{ background: 'var(--mantine-color-green-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={COVERAGE_COLORS[data.coverage] || 'gray'} variant="filled">
          {data.coverage}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {name}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" ff="monospace">
        {data.path}
      </Text>
      <Group gap={8} mt={4}>
        <Text size="xs" c="dimmed">
          {data.lines} lines
        </Text>
        <Badge size="xs" variant="light" color="green">
          {data.exports.length} exports
        </Badge>
      </Group>
    </button>
  )
}

export function TestNodeComp({ data }: { data: { path: string; lines: number; type: string } }) {
  const name = data.path.split('/').pop() || data.path
  const typeColor = data.type === 'unit' ? 'blue' : data.type === 'integration' ? 'green' : 'violet'
  return (
    <button
      type="button"
      style={{
        padding: 8,
        borderRadius: 8,
        border: `1px solid var(--mantine-color-${typeColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
      onDoubleClick={() => openInEditor(data.path)}
      title="Double-click to open in editor"
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${typeColor}-6)` }} />
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${typeColor}-6)` }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={typeColor} variant="filled">
          {data.type}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {name}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {data.lines} lines
      </Text>
    </button>
  )
}

export function PackageNode({
  data,
}: {
  data: { name: string; version: string; type: string; category: string; usedBy: string[] }
}) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `1px solid var(--mantine-color-${data.type === 'runtime' ? 'green' : 'orange'}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-blue-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={data.type === 'runtime' ? 'green' : 'orange'} variant="filled">
          {data.type}
        </Badge>
        <Badge size="xs" color={CATEGORY_COLORS[data.category] || 'gray'} variant="light">
          {data.category}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace">
        {data.name}
      </Text>
      <Text size="xs" c="dimmed">
        {data.version}
      </Text>
      {data.usedBy.length > 0 && (
        <Badge size="xs" variant="light" mt={4}>
          {data.usedBy.length} files
        </Badge>
      )}
    </div>
  )
}

export function MigrationNode({ data }: { data: { name: string; createdAt: string; changes: string[]; sql: string } }) {
  const [showSql, setShowSql] = useState(false)
  const date = new Date(data.createdAt).toLocaleDateString()
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-body)',
        minWidth: 220,
        maxWidth: 260,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--mantine-color-orange-6)' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--mantine-color-orange-6)' }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color="orange" variant="filled">
          {date}
        </Badge>
      </Group>
      <Text size="xs" fw={700} ff="monospace" lineClamp={1}>
        {data.name}
      </Text>
      <Stack gap={2} mt={4}>
        {data.changes.map((c) => {
          const color = c.startsWith('CREATE')
            ? 'green'
            : c.startsWith('ALTER')
              ? 'yellow'
              : c.startsWith('DROP')
                ? 'red'
                : 'gray'
          return (
            <Badge key={c} size="xs" variant="light" color={color} ff="monospace">
              {c}
            </Badge>
          )
        })}
      </Stack>
      {data.sql && (
        <Text size="xs" c="blue" mt={4} style={{ cursor: 'pointer' }} onClick={() => setShowSql(!showSql)}>
          {showSql ? 'Hide SQL' : 'Show SQL'}
        </Text>
      )}
      {showSql && (
        <Text
          size="xs"
          ff="monospace"
          c="dimmed"
          mt={4}
          style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}
        >
          {data.sql}
        </Text>
      )}
    </div>
  )
}

export function SessionUserNode({
  data,
}: {
  data: {
    userName: string
    userEmail: string
    userRole: string
    userBlocked: boolean
    isOnline: boolean
    sessionCount: number
    isExpired: boolean
  }
}) {
  const roleColor = data.userRole === 'SUPER_ADMIN' ? 'red' : data.userRole === 'ADMIN' ? 'orange' : 'blue'
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.userBlocked ? 'red' : roleColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 180,
      }}
    >
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${roleColor}-6)` }} />
      <Group gap={6} mb={4}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: `var(--mantine-color-${data.isOnline ? 'green' : 'gray'}-6)`,
          }}
        />
        <Text size="xs" fw={700}>
          {data.userName}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {data.userEmail}
      </Text>
      <Group gap={4} mt={4}>
        <Badge size="xs" color={roleColor} variant="filled">
          {data.userRole}
        </Badge>
        {data.userBlocked && (
          <Badge size="xs" color="red" variant="filled">
            BLOCKED
          </Badge>
        )}
        <Badge size="xs" variant="light">
          {data.sessionCount} sessions
        </Badge>
      </Group>
    </div>
  )
}

export function RoleAccessNode({ data }: { data: { label: string; routes: string[]; color: string; count: number } }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${data.color}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 150,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${data.color}-6)` }} />
      <Handle type="source" position={Position.Right} style={{ background: `var(--mantine-color-${data.color}-6)` }} />
      <Text size="xs" fw={700}>
        {data.label}
      </Text>
      <Badge size="xs" variant="light" color={data.color} mt={4}>
        {data.count} users
      </Badge>
      <Stack gap={2} mt={4}>
        {data.routes.map((r) => (
          <Text key={r} size="xs" c="dimmed" ff="monospace">
            {r}
          </Text>
        ))}
      </Stack>
    </div>
  )
}

export function EndpointHitNode({
  data,
}: {
  data: { method: string; path: string; hits: number; lastStatus: number; avgDuration: number }
}) {
  const statusColor = data.lastStatus >= 500 ? 'red' : data.lastStatus >= 400 ? 'yellow' : 'green'
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        border: `2px solid var(--mantine-color-${statusColor}-6)`,
        background: 'var(--mantine-color-body)',
        minWidth: 200,
        boxShadow:
          data.hits > 0 ? `0 0 ${Math.min(data.hits * 2, 20)}px var(--mantine-color-${statusColor}-3)` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: `var(--mantine-color-${statusColor}-6)` }} />
      <Group gap={6} mb={4}>
        <Badge size="xs" color={METHOD_COLORS[data.method] || 'gray'} variant="filled">
          {data.method}
        </Badge>
        <Text size="xs" fw={700} ff="monospace">
          {data.path}
        </Text>
      </Group>
      <Group gap={8}>
        <Badge size="xs" variant="light" color={statusColor}>
          {data.lastStatus || '—'}
        </Badge>
        <Text size="xs" c="dimmed">
          {data.hits} hits
        </Text>
        {data.avgDuration > 0 && (
          <Text size="xs" c="dimmed">
            {data.avgDuration}ms avg
          </Text>
        )}
      </Group>
    </div>
  )
}

export const projectNodeTypes = { route: RouteNode, file: FileNode2, flow: FlowNode }
export const envNodeTypes = { envVar: EnvVarNode, file: FileNode2 }
export const testNodeTypes = { source: SourceNode, test: TestNodeComp }
export const depNodeTypes = { package: PackageNode, file: FileNode2 }
export const migrationNodeTypes = { migration: MigrationNode }
export const sessionNodeTypes = { sessionUser: SessionUserNode, roleAccess: RoleAccessNode }
export const liveNodeTypes = { endpoint: EndpointHitNode, flow: FlowNode }
