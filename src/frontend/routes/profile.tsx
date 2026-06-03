import { Badge, Button, Container, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { createRoute, Link, redirect } from '@tanstack/react-router'
import { TbLogout, TbUser } from 'react-icons/tb'
import { Background3D } from '@/frontend/components/Background3D'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { UserAvatar } from '@/frontend/components/UserAvatar'
import { useLogout, useSession } from '@/frontend/hooks/useAuth'
import { authClient } from '@/lib/auth-client'
import { rootRoute } from './__root'

export const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
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
    } catch (e) {
      if (e instanceof Error) throw redirect({ to: '/login' })
      throw e
    }
  },
  component: ProfilePage,
})

const roleBadgeColor: Record<string, string> = {
  USER: 'blue',
  QC: 'cyan',
  ADMIN: 'violet',
  SUPER_ADMIN: 'red',
}

function ProfilePage() {
  const { data } = useSession()
  const logout = useLogout()
  const user = data?.user

  return (
    <>
      <Background3D />
      <Container size="sm" px={{ base: 'md', sm: 'lg' }} py={{ base: 'md', sm: 'xl' }}>
      <Stack gap="md">
        {/* Header row — stacks on very small screens */}
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={2} fz={{ base: 'xl', sm: '2xl' }}>
            Profile
          </Title>
          <Group gap="xs" wrap="wrap">
            <ThemeToggle size="sm" />
            {user?.role === 'SUPER_ADMIN' && (
              <Button component={Link} to="/dev" variant="light" size="xs">
                Dev Console
              </Button>
            )}
            {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <Button component={Link} to="/dashboard" variant="light" size="xs">
                Dashboard
              </Button>
            )}
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<TbLogout size={14} />}
              onClick={() =>
                modals.openConfirmModal({
                  title: 'Logout',
                  children: <Text size="sm">Are you sure you want to logout?</Text>,
                  labels: { confirm: 'Logout', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: () => logout.mutate(),
                })
              }
              loading={logout.isPending}
            >
              Logout
            </Button>
          </Group>
        </Group>

        {/* Avatar card */}
        <Paper withBorder p={{ base: 'lg', sm: 'xl' }} radius="md">
          <Stack align="center" gap="md">
            <UserAvatar user={user} color="blue" size={80} />
            <div style={{ textAlign: 'center' }}>
              <Text fw={600} size="lg">
                {user?.name}
              </Text>
              <Text c="dimmed" size="sm" style={{ wordBreak: 'break-all' }}>
                {user?.email}
              </Text>
            </div>
            <Badge color={roleBadgeColor[user?.role ?? 'USER']} variant="light" size="lg">
              {user?.role}
            </Badge>
          </Stack>
        </Paper>

        {/* Account info card */}
        <Paper withBorder p={{ base: 'md', sm: 'lg' }} radius="md">
          <Stack gap="sm">
            <Group gap="xs">
              <TbUser size={16} />
              <Text fw={500} size="sm">
                Account Info
              </Text>
            </Group>
            <Divider />
            {[
              { label: 'Name', value: user?.name },
              { label: 'Email', value: user?.email },
              { label: 'Role', value: user?.role },
            ].map(({ label, value }) => (
              <Group key={label} justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                  {label}
                </Text>
                <Text size="sm" ta="right" style={{ wordBreak: 'break-all' }}>
                  {value}
                </Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      </Stack>
    </Container>
    </>
  )
}
