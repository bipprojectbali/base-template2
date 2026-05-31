import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { TbAlertTriangle, TbCheck, TbClipboardCheck, TbCopy, TbFileCheck, TbRefresh, TbRuler2, TbShieldOff, TbX } from 'react-icons/tb'
import { apiFetch } from '@/frontend/lib/apiFetch'

interface FileHealth {
  path: string
  category: string
  lines: number
  chars: number
  limitLines: number
  limitChars: number
  ratioLines: number
  ratioChars: number
  status: 'ok' | 'warn' | 'critical' | 'exempt'
  exempt: boolean
}

interface FileHealthResponse {
  files: FileHealth[]
  summary: {
    totalFiles: number
    totalLines: number
    totalChars: number
    hardLimitLines: number
    hardLimitChars: number
    byStatus: Record<string, number>
    byCategory: Record<string, number>
  }
  worstOffenders: FileHealth[]
}

const STATUS_META: Record<FileHealth['status'], { color: string; label: string; icon: typeof TbCheck }> = {
  ok: { color: 'green', label: 'OK', icon: TbCheck },
  warn: { color: 'yellow', label: 'Warning', icon: TbAlertTriangle },
  critical: { color: 'red', label: 'Critical', icon: TbX },
  exempt: { color: 'gray', label: 'Exempt', icon: TbShieldOff },
}

const STATS = [
  { key: 'totalFiles', title: 'Total Files', color: 'blue', icon: TbFileCheck },
  { key: 'ok', title: 'OK', color: 'green', icon: TbCheck },
  { key: 'warn', title: 'Warning', color: 'yellow', icon: TbAlertTriangle },
  { key: 'critical', title: 'Critical', color: 'red', icon: TbX },
] as const

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function ratioColor(ratio: number, exempt: boolean): string {
  if (exempt) return 'gray'
  if (ratio > 1) return 'red'
  if (ratio >= 0.8) return 'yellow'
  return 'green'
}

export function FileHealthPanel() {
  const queryClient = useQueryClient()
  const QUERY_KEY = ['admin', 'file-health']
  const { data, isLoading, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<FileHealthResponse>('/api/admin/file-health'),
    staleTime: 60_000,
  })

  const [statusFilter, setStatusFilter] = useState<'all' | FileHealth['status']>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const files = data?.files ?? []
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) set.add(f.category)
    return ['all', ...Array.from(set).sort()]
  }, [files])

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      return true
    })
  }, [files, statusFilter, categoryFilter])

  const allFilteredSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.path))
  const someFilteredSelected = filtered.some((f) => selected.has(f.path))

  function toggleRow(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const f of filtered) next.delete(f.path)
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const f of filtered) next.add(f.path)
        return next
      })
    }
  }

  function copyPaths(paths: string[]) {
    navigator.clipboard.writeText(paths.join('\n'))
    notifications.show({
      title: 'Copied',
      message: paths.length === 1 ? paths[0] : `${paths.length} paths copied`,
      color: 'green',
      icon: <TbClipboardCheck size={16} />,
      autoClose: 2000,
    })
  }

  const summary = data?.summary
  const counts: Record<string, number> = {
    totalFiles: summary?.totalFiles ?? 0,
    ok: summary?.byStatus.ok ?? 0,
    warn: summary?.byStatus.warn ?? 0,
    critical: summary?.byStatus.critical ?? 0,
  }

  return (
    <Container size="xl" px={{ base: 0, sm: 'md' }}>
      <Stack gap="lg">
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon size="lg" variant="light" color="orange">
              <TbRuler2 size={20} />
            </ThemeIcon>
            <div>
              <Title order={3}>File Health</Title>
              <Text size="xs" c="dimmed">
                Scan ukuran file project — rujukan: docs/FILE-HEALTH.md
              </Text>
            </div>
          </Group>
          <Tooltip label="Refresh scan">
            <ActionIcon
              variant="light"
              size="lg"
              onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
              loading={isFetching}
            >
              <TbRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {STATS.map((s) => (
            <Card key={s.key} withBorder padding="lg" radius="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed" fw={500}>
                  {s.title}
                </Text>
                <ThemeIcon variant="light" color={s.color} size="sm">
                  <s.icon size={14} />
                </ThemeIcon>
              </Group>
              <Text fw={700} size="xl">
                {isLoading ? '—' : fmtNumber(counts[s.key])}
              </Text>
            </Card>
          ))}
        </SimpleGrid>

        {summary && (
          <Card withBorder radius="md" p="md">
            <Group gap="lg" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed">
                  Total Lines
                </Text>
                <Text fw={600}>{fmtNumber(summary.totalLines)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Total Characters
                </Text>
                <Text fw={600}>{fmtNumber(summary.totalChars)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Hard Limit
                </Text>
                <Text fw={600}>
                  {summary.hardLimitLines} lines / {fmtNumber(summary.hardLimitChars)} chars
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Exempt
                </Text>
                <Text fw={600}>{fmtNumber(summary.byStatus.exempt ?? 0)}</Text>
              </div>
            </Group>
          </Card>
        )}

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap" gap="sm">
              <SegmentedControl
                size="xs"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                data={[
                  { label: `All (${files.length})`, value: 'all' },
                  { label: `OK (${counts.ok})`, value: 'ok' },
                  { label: `Warn (${counts.warn})`, value: 'warn' },
                  { label: `Critical (${counts.critical})`, value: 'critical' },
                  { label: `Exempt (${summary?.byStatus.exempt ?? 0})`, value: 'exempt' },
                ]}
              />
              <Select
                size="xs"
                w={220}
                value={categoryFilter}
                onChange={(v) => setCategoryFilter(v ?? 'all')}
                data={categories.map((c) => ({ value: c, label: c === 'all' ? 'All categories' : c }))}
                clearable={false}
              />
            </Group>
            <Group gap="xs">
              <Tooltip label={`Copy ${selected.size} selected path(s)`} withArrow>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<TbCopy size={14} />}
                  disabled={selected.size === 0}
                  onClick={() => copyPaths([...selected])}
                >
                  Copy Selected ({selected.size})
                </Button>
              </Tooltip>
              <Tooltip label={`Copy all ${filtered.length} visible paths`} withArrow>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  leftSection={<TbCopy size={14} />}
                  disabled={filtered.length === 0}
                  onClick={() => copyPaths(filtered.map((f) => f.path))}
                >
                  Copy All ({filtered.length})
                </Button>
              </Tooltip>
              {selected.size > 0 && (
                <Button size="xs" variant="subtle" color="gray" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              )}
            </Group>
          </Stack>
        </Card>

        <Card withBorder radius="md" p={0}>
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover striped="even">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      size="xs"
                      checked={allFilteredSelected}
                      indeterminate={someFilteredSelected && !allFilteredSelected}
                      onChange={toggleAll}
                      disabled={filtered.length === 0}
                    />
                  </Table.Th>
                  <Table.Th>Path</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th ta="right">Lines</Table.Th>
                  <Table.Th ta="right">Chars</Table.Th>
                  <Table.Th style={{ minWidth: 180 }}>Usage</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {isLoading && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text ta="center" c="dimmed" py="md">
                        Scanning project files...
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text ta="center" c="dimmed" py="md">
                        No files match the current filter.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {filtered.map((f) => {
                  const meta = STATUS_META[f.status]
                  const worst = Math.max(f.ratioLines, f.ratioChars)
                  const pct = Math.min(worst * 100, 200)
                  const isSelected = selected.has(f.path)
                  return (
                    <Table.Tr key={f.path} bg={isSelected ? 'var(--mantine-color-blue-light)' : undefined}>
                      <Table.Td>
                        <Checkbox size="xs" checked={isSelected} onChange={() => toggleRow(f.path)} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {f.path}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="xs" color="gray">
                          {f.category}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm">
                          {fmtNumber(f.lines)}
                          <Text span size="xs" c="dimmed">
                            {' '}
                            / {f.limitLines}
                          </Text>
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm">
                          {fmtNumber(f.chars)}
                          <Text span size="xs" c="dimmed">
                            {' '}
                            / {fmtNumber(f.limitChars)}
                          </Text>
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label={`${Math.round(worst * 100)}% of limit (worst of lines/chars)`}>
                          <Progress
                            value={Math.min(pct, 100)}
                            color={ratioColor(worst, f.exempt)}
                            size="md"
                            radius="xl"
                            striped={f.status === 'critical'}
                            animated={f.status === 'critical'}
                          />
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={meta.color} variant={f.status === 'critical' ? 'filled' : 'light'} size="sm">
                          <Group gap={4} wrap="nowrap">
                            <meta.icon size={10} />
                            {meta.label}
                          </Group>
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Copy path" withArrow>
                          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => copyPaths([f.path])}>
                            <TbCopy size={13} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </Stack>
    </Container>
  )
}
