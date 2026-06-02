import { Box, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { createRoute, Link, redirect } from '@tanstack/react-router'
import { SiBun } from 'react-icons/si'
import { TbBrandReact, TbLogin, TbRocket } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute } from '@/frontend/hooks/useAuth'
import { authClient } from '@/lib/auth-client'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.ensureQueryData({
        queryKey: ['auth', 'session'],
        queryFn: async () => {
          const session = await authClient.getSession()
          return session.data ? { user: session.data.user } : { user: null }
        },
      })
      if (data?.user) {
        const user = data.user as any
        throw redirect({ to: getDefaultRoute((user.role ?? 'USER') as any) })
      }
    } catch (e) {
      if (e instanceof Error) return
      throw e
    }
  },
  component: HomePage,
})

function HomePage() {
  return (
    <Box style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar — always visible, full width */}
      <Box px={{ base: 'md', sm: 'xl' }} py="sm" style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <ThemeToggle />
      </Box>

      {/* Main content — centered, fills remaining space */}
      <Container
        size="sm"
        px={{ base: 'md', sm: 'xl' }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Stack align="center" gap="md" w="100%">
          <Group gap="md">
            <SiBun
              size={48}
              color="#fbf0df"
              style={{ width: 'clamp(40px, 10vw, 64px)', height: 'clamp(40px, 10vw, 64px)' }}
            />
            <TbBrandReact
              size={48}
              color="#61dafb"
              style={{ width: 'clamp(40px, 10vw, 64px)', height: 'clamp(40px, 10vw, 64px)' }}
            />
          </Group>

          <Title order={1} ta="center" fz={{ base: 'xl', sm: '2xl', md: '3xl' }}>
            Bun + Elysia + Vite + React
          </Title>

          <Text c="dimmed" ta="center" maw={480} fz={{ base: 'sm', sm: 'md' }} px={{ base: 'xs', sm: 0 }}>
            Full-stack starter template with Mantine UI, TanStack Router, and session-based auth.
          </Text>

          <Group gap="sm" wrap="wrap" justify="center" w="100%" maw={{ base: '100%', xs: 320 }}>
            <Button
              component={Link}
              to="/login"
              leftSection={<TbLogin size={18} />}
              variant="filled"
              fullWidth
              style={{ flex: '1 1 120px', minWidth: 120 }}
            >
              Login
            </Button>
            <Button
              component={Link}
              to="/dashboard"
              leftSection={<TbRocket size={18} />}
              variant="light"
              fullWidth
              style={{ flex: '1 1 120px', minWidth: 120 }}
            >
              Dashboard
            </Button>
          </Group>
        </Stack>
      </Container>
    </Box>
  )
}
