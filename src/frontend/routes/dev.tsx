import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Menu,
  NavLink,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import {
  TbChevronRight,
  TbCode,
  TbDatabase,
  TbDots,
  TbLayoutDashboard,
  TbLock,
  TbLockOpen,
  TbLogout,
  TbServer,
  TbSettings,
  TbShieldCheck,
  TbShieldOff,
  TbUser,
  TbUsers,
} from 'react-icons/tb'
import { useLogout, useSession, type Role } from '@/frontend/hooks/useAuth'

export const Route = createFileRoute('/dev')({
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: () => fetch('/api/auth/session', { credentials: 'include' }).then((r) => r.json()),
      })
      if (!data?.user) throw redirect({ to: '/login' })
      if (data.user.blocked) throw redirect({ to: '/blocked' })
      if (data.user.role !== 'SUPER_ADMIN') throw redirect({ to: '/profile' })
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: DevPage,
})

interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
}

const navItems = [
  { label: 'Overview', icon: TbLayoutDashboard, key: 'overview' },
  { label: 'Users', icon: TbUsers, key: 'users' },
  { label: 'Database', icon: TbDatabase, key: 'database' },
  { label: 'Server', icon: TbServer, key: 'server' },
  { label: 'Settings', icon: TbSettings, key: 'settings' },
]

function DevPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const [active, setActive] = useState('overview')

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <AppShell.Section>
          <Group gap="xs" mb="md">
            <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
              <TbCode size={18} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="sm">Dev Console</Text>
              <Text size="xs" c="dimmed">Super Admin</Text>
            </div>
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {navItems.map((item) => (
            <NavLink
              key={item.key}
              label={item.label}
              leftSection={<item.icon size={18} />}
              rightSection={<TbChevronRight size={14} />}
              active={active === item.key}
              onClick={() => setActive(item.key)}
              variant="light"
              mb={4}
            />
          ))}
        </AppShell.Section>

        <AppShell.Section>
          <Box
            p="sm"
            style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}
          >
            <Group justify="space-between">
              <Group gap="xs">
                <Avatar color="red" radius="xl" size="sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Text size="xs" fw={500}>{user?.name}</Text>
                  <Text size="xs" c="dimmed">{user?.email}</Text>
                </div>
              </Group>
              <Tooltip label="Logout">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => logout.mutate()}
                  loading={logout.isPending}
                >
                  <TbLogout size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {active === 'overview' && <OverviewPanel />}
        {active === 'users' && <UsersPanel />}
        {active === 'database' && <PlaceholderPanel title="Database" desc="Database management dan monitoring akan ditampilkan di sini." icon={TbDatabase} />}
        {active === 'server' && <PlaceholderPanel title="Server" desc="Server logs dan monitoring akan ditampilkan di sini." icon={TbServer} />}
        {active === 'settings' && <PlaceholderPanel title="Settings" desc="System configuration akan ditampilkan di sini." icon={TbSettings} />}
      </AppShell.Main>
    </AppShell>
  )
}

// ─── Overview Panel ────────────────────────────────────

const overviewStats = [
  { title: 'Total Users', icon: TbUsers, color: 'blue' },
  { title: 'Admin', icon: TbShieldCheck, color: 'violet' },
  { title: 'Blocked', icon: TbLock, color: 'red' },
]

function OverviewPanel() {
  const { data } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })

  const users = data?.users ?? []
  const counts = {
    'Total Users': users.length,
    'Admin': users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length,
    'Blocked': users.filter((u) => u.blocked).length,
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Title order={3}>Overview</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {overviewStats.map((stat) => (
            <Card key={stat.title} withBorder padding="lg" radius="md">
              <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed" fw={500}>{stat.title}</Text>
                <ThemeIcon variant="light" color={stat.color} size="sm">
                  <stat.icon size={14} />
                </ThemeIcon>
              </Group>
              <Text fw={700} size="xl">{counts[stat.title as keyof typeof counts]}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}

// ─── Users Panel ───────────────────────────────────────

const roleBadge: Record<string, { color: string; label: string }> = {
  USER: { color: 'blue', label: 'User' },
  ADMIN: { color: 'violet', label: 'Admin' },
  SUPER_ADMIN: { color: 'red', label: 'Super Admin' },
}

function UsersPanel() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetch('/api/admin/users', { credentials: 'include' }).then((r) => r.json()) as Promise<{ users: AdminUser[] }>,
  })

  const { data: sessionData } = useSession()
  const currentUserId = sessionData?.user?.id

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  const toggleBlock = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      fetch(`/api/admin/users/${id}/block`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  const users = data?.users ?? []

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={3}>User Management</Title>
          <Badge variant="light" size="lg">{users.length} users</Badge>
        </Group>

        <Card withBorder radius="md" p={0}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>User</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text ta="center" c="dimmed" py="md">Loading...</Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {users.map((u) => {
                const isSelf = u.id === currentUserId
                const badge = roleBadge[u.role] ?? roleBadge.USER

                return (
                  <Table.Tr key={u.id} opacity={u.blocked ? 0.5 : 1}>
                    <Table.Td>
                      <Group gap="sm">
                        <Avatar color={badge.color} radius="xl" size="sm">
                          {u.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <div>
                          <Text size="sm" fw={500}>
                            {u.name} {isSelf && <Text span c="dimmed" size="xs">(you)</Text>}
                          </Text>
                          <Text size="xs" c="dimmed">{u.email}</Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={badge.color} variant="light" size="sm">
                        {badge.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {u.blocked ? (
                        <Badge color="red" variant="filled" size="sm">Blocked</Badge>
                      ) : (
                        <Badge color="green" variant="light" size="sm">Active</Badge>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {!isSelf && u.role !== 'SUPER_ADMIN' && (
                        <Menu shadow="md" width={200} position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray">
                              <TbDots size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Label>Role</Menu.Label>
                            {u.role !== 'ADMIN' && (
                              <Menu.Item
                                leftSection={<TbShieldCheck size={14} />}
                                onClick={() => changeRole.mutate({ id: u.id, role: 'ADMIN' })}
                              >
                                Angkat jadi Admin
                              </Menu.Item>
                            )}
                            {u.role === 'ADMIN' && (
                              <Menu.Item
                                leftSection={<TbShieldOff size={14} />}
                                onClick={() => changeRole.mutate({ id: u.id, role: 'USER' })}
                              >
                                Turunkan ke User
                              </Menu.Item>
                            )}

                            <Menu.Divider />
                            <Menu.Label>Status</Menu.Label>
                            {u.blocked ? (
                              <Menu.Item
                                leftSection={<TbLockOpen size={14} />}
                                color="green"
                                onClick={() => toggleBlock.mutate({ id: u.id, blocked: false })}
                              >
                                Unblock User
                              </Menu.Item>
                            ) : (
                              <Menu.Item
                                leftSection={<TbLock size={14} />}
                                color="red"
                                onClick={() => toggleBlock.mutate({ id: u.id, blocked: true })}
                              >
                                Block User
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
    </Container>
  )
}

// ─── Placeholder Panel ─────────────────────────────────

function PlaceholderPanel({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ComponentType<{ size: number }> }) {
  return (
    <Container size="lg">
      <Stack align="center" justify="center" gap="md" mih={400}>
        <ThemeIcon size={64} variant="light" color="gray" radius="xl">
          <Icon size={32} />
        </ThemeIcon>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" ta="center" maw={400}>{desc}</Text>
      </Stack>
    </Container>
  )
}
