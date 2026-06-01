import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Card,
  Container,
  Divider,
  Group,
  Menu,
  NavLink,
  Pagination,
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
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@xyflow/react/dist/style.css'
import { modals } from '@mantine/modals'
import {
  TbApi,
  TbBug,
  TbChevronRight,
  TbCircleFilled,
  TbCode,
  TbDatabase,
  TbDots,
  TbFileText,
  TbLayoutDashboard,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLock,
  TbLockOpen,
  TbLogout,
  TbRefresh,
  TbRuler2,
  TbServer,
  TbSettings,
  TbShieldCheck,
  TbShieldOff,
  TbSitemap,
  TbTrash,
  TbUser,
  TbUserSearch,
  TbUsers,
  TbWifi,
} from 'react-icons/tb'
import { AppLogsPanel } from '@/frontend/components/dev/AppLogsPanel'
import { DatabasePanel } from '@/frontend/components/dev/DatabasePanel'
import { FileHealthPanel } from '@/frontend/components/dev/FileHealthPanel'
import { OverviewPanel } from '@/frontend/components/dev/OverviewPanel'
import { PlaceholderPanel } from '@/frontend/components/dev/PlaceholderPanel'
import { ProjectPanel } from '@/frontend/components/dev/ProjectPanel'
import { UserLogsPanel } from '@/frontend/components/dev/UserLogsPanel'
import { UsersPanel } from '@/frontend/components/dev/UsersPanel'
import { ApiDocsPanel } from '@/frontend/components/dev/ApiDocsPanel'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { TicketsPanel } from '@/frontend/components/TicketsPanel'
import { type Role, useLogout, useSession } from '@/frontend/hooks/useAuth'
import { usePresence } from '@/frontend/hooks/usePresence'
import { apiFetch } from '@/frontend/lib/apiFetch'
import { authClient } from '@/lib/auth-client'
import { rootRoute } from './__root'

const validTabs = [
  'overview',
  'users',
  'tickets',
  'app-logs',
  'user-logs',
  'database',
  'project',
  'file-health',
  'api-docs',
  'settings',
] as const

export const devRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev',
  validateSearch: (search: Record<string, unknown>) => ({
    tab: validTabs.includes(search.tab as any) ? (search.tab as string) : 'overview',
  }),
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: async () => {
          const session = await authClient.getSession()
          return session.data ? { user: session.data.user } : { user: null }
        },
      })
      if (!data?.user) throw redirect({ to: '/login' })
      const user = data.user as any
      if (user.blocked) throw redirect({ to: '/blocked' })
      if (user.role !== 'SUPER_ADMIN') throw redirect({ to: '/profile' })
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
  { label: 'Tickets', icon: TbBug, key: 'tickets' },
  { label: 'App Logs', icon: TbServer, key: 'app-logs' },
  { label: 'User Logs', icon: TbUserSearch, key: 'user-logs' },
  { label: 'Database', icon: TbDatabase, key: 'database' },
  { label: 'Project', icon: TbSitemap, key: 'project' },
  { label: 'File Health', icon: TbRuler2, key: 'file-health' },
  { label: 'API Docs', icon: TbApi, key: 'api-docs' },
  { label: 'Settings', icon: TbSettings, key: 'settings' },
]

function DevPage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user
  const { tab: active } = devRoute.useSearch()
  const navigate = useNavigate()
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 48em)')
  const setActive = (key: string) => {
    navigate({ to: '/dev', search: { tab: key } })
    closeMobile()
  }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dev:sidebar') === 'collapsed')
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('dev:sidebar', next ? 'collapsed' : 'open')
      return next
    })
  }
  const confirmLogout = () =>
    modals.openConfirmModal({
      title: 'Logout',
      children: <Text size="sm">Are you sure you want to logout?</Text>,
      labels: { confirm: 'Logout', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => logout.mutate(),
    })

  return (
    <AppShell
      header={{ height: 56, collapsed: !isMobile }}
      navbar={{
        width: collapsed ? 60 : 260,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding={{ base: 'sm', sm: 'md' }}
    >
      <AppShell.Header px="md" hiddenFrom="sm">
        <Group h="100%" justify="space-between">
          <Group gap="xs">
            <Burger opened={mobileOpened} onClick={toggleMobile} size="sm" />
            <ThemeIcon size="md" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
              <TbCode size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">
              Dev Console
            </Text>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p={collapsed ? 'xs' : 'md'}>
        <AppShell.Section>
          <Group gap="xs" mb="md" justify={collapsed ? 'center' : 'space-between'}>
            {collapsed ? (
              <Tooltip label="Expand sidebar" position="right">
                <ActionIcon variant="subtle" color="gray" size="lg" onClick={toggleSidebar}>
                  <TbLayoutSidebarLeftExpand size={18} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <>
                <Group gap="xs">
                  <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'red', to: 'orange' }}>
                    <TbCode size={18} />
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="sm">
                      Dev Console
                    </Text>
                    <Text size="xs" c="dimmed">
                      Super Admin
                    </Text>
                  </div>
                </Group>
                <Tooltip label="Minimize sidebar">
                  <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleSidebar}>
                    <TbLayoutSidebarLeftCollapse size={18} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>
        </AppShell.Section>

        <AppShell.Section grow>
          {navItems.map((item) =>
            collapsed ? (
              <Tooltip key={item.key} label={item.label} position="right">
                <ActionIcon
                  variant={active === item.key ? 'light' : 'subtle'}
                  color={active === item.key ? 'blue' : 'gray'}
                  size="lg"
                  onClick={() => setActive(item.key)}
                  mb={4}
                  style={{ width: '100%' }}
                >
                  <item.icon size={18} />
                </ActionIcon>
              </Tooltip>
            ) : (
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
            ),
          )}

          {collapsed ? <Divider my={6} /> : <Divider my={6} label="Apps" labelPosition="left" />}

          {collapsed ? (
            <Tooltip label="Dashboard" position="right">
              <ActionIcon
                variant="subtle"
                color="blue"
                size="lg"
                mb={4}
                style={{ width: '100%' }}
                onClick={() => navigate({ to: '/dashboard', search: { tab: 'dashboard' } })}
              >
                <TbLayoutDashboard size={18} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <NavLink
              label="Dashboard"
              leftSection={<TbLayoutDashboard size={18} />}
              rightSection={<TbChevronRight size={14} />}
              onClick={() => navigate({ to: '/dashboard', search: { tab: 'dashboard' } })}
              variant="light"
              mb={4}
            />
          )}
        </AppShell.Section>

        <AppShell.Section>
          <Box p={collapsed ? 'xs' : 'sm'} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {collapsed ? (
              <Stack align="center" gap={4}>
                <Tooltip label={user?.name} position="right">
                  <Avatar color="red" radius="xl" size="sm">
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
                <ThemeToggle size="sm" />
                <Tooltip label="Logout" position="right">
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={confirmLogout} loading={logout.isPending}>
                    <TbLogout size={14} />
                  </ActionIcon>
                </Tooltip>
              </Stack>
            ) : (
              <Group justify="space-between">
                <Group gap="xs">
                  <Avatar color="red" radius="xl" size="sm">
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <Text size="xs" fw={500}>
                      {user?.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user?.email}
                    </Text>
                  </div>
                </Group>
                <Group gap={4}>
                  <ThemeToggle size="sm" />
                  <Tooltip label="Logout">
                    <ActionIcon variant="subtle" color="red" onClick={confirmLogout} loading={logout.isPending}>
                      <TbLogout size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            )}
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        {active === 'overview' && <OverviewPanel />}
        {active === 'users' && <UsersPanel />}
        {active === 'tickets' && <TicketsPanel />}
        {active === 'app-logs' && <AppLogsPanel />}
        {active === 'user-logs' && <UserLogsPanel />}
        {active === 'database' && <DatabasePanel />}
        {active === 'project' && <ProjectPanel />}
        {active === 'file-health' && <FileHealthPanel />}
        {active === 'api-docs' && <ApiDocsPanel />}
        {active === 'settings' && (
          <PlaceholderPanel title="Settings" desc="System configuration akan ditampilkan di sini." icon={TbSettings} />
        )}
      </AppShell.Main>
    </AppShell>
  )
}
