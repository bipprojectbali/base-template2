import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { createRoute, Link, redirect } from '@tanstack/react-router'
import { FcGoogle } from 'react-icons/fc'
import { SiBun, SiPostgresql, SiPrisma, SiReact, SiRedis, SiVite } from 'react-icons/si'
import { TbArrowRight, TbBolt, TbDatabase, TbKey, TbLogin, TbShieldCheck, TbUsers, TbWifi } from 'react-icons/tb'
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

const features = [
  {
    icon: TbShieldCheck,
    color: 'blue',
    title: 'Secure Authentication',
    description:
      'Better Auth v1 with Google OAuth, email/password, signed HttpOnly cookies, and Redis session storage.',
  },
  {
    icon: TbBolt,
    color: 'yellow',
    title: 'Lightning Fast Backend',
    description: 'Bun runtime + Elysia.js with full end-to-end type safety, automatic OpenAPI docs, and zero overhead.',
  },
  {
    icon: TbDatabase,
    color: 'teal',
    title: 'Type-Safe Database',
    description: 'Prisma ORM with PostgreSQL. Auto-generated client, migrations, and type-safe queries out of the box.',
  },
  {
    icon: TbWifi,
    color: 'violet',
    title: 'Real-Time Presence',
    description:
      'WebSocket-powered live presence tracking. Know who is online instantly across every connected client.',
  },
  {
    icon: TbUsers,
    color: 'pink',
    title: 'Role-Based Access',
    description:
      'Four built-in roles: USER, QC, ADMIN, and SUPER_ADMIN. Fine-grained route guards and permission layers.',
  },
  {
    icon: TbKey,
    color: 'orange',
    title: 'Dev Console',
    description:
      'Built-in admin panel with live logs, DB schema viewer, user management, audit trails, and MCP integration.',
  },
]

const techStack = [
  { icon: SiBun, label: 'Bun', color: '#fbf0df' },
  { icon: SiReact, label: 'React 19', color: '#61dafb' },
  { icon: SiVite, label: 'Vite 8', color: '#bd34fe' },
  { icon: SiPrisma, label: 'Prisma', color: '#5a67d8' },
  { icon: SiPostgresql, label: 'PostgreSQL', color: '#4169e1' },
  { icon: SiRedis, label: 'Redis', color: '#ff4438' },
  { icon: FcGoogle, label: 'Google Auth', color: '' },
]

function HomePage() {
  return (
    <Box style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <Box
        component="nav"
        px={{ base: 'md', sm: 'xl' }}
        py="md"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'var(--mantine-color-body)',
        }}
      >
        <Group gap="xs">
          <SiBun size={22} color="#fbf0df" />
          <Text fw={700} size="md" style={{ letterSpacing: '-0.02em' }}>
            Base Template
          </Text>
        </Group>
        <Group gap="sm">
          <ThemeToggle size="sm" />
          <Button component={Link} to="/login" size="xs" leftSection={<TbLogin size={14} />}>
            Sign In
          </Button>
        </Group>
      </Box>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <Box
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Gradient orbs */}
        <Box
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--mantine-color-blue-5) 15%, transparent) 0%, transparent 70%)',
            top: '-10%',
            left: '-10%',
            pointerEvents: 'none',
          }}
        />
        <Box
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--mantine-color-violet-5) 12%, transparent) 0%, transparent 70%)',
            bottom: '-5%',
            right: '-5%',
            pointerEvents: 'none',
          }}
        />

        <Container size="lg" px={{ base: 'md', sm: 'xl' }} py={{ base: 60, sm: 80, md: 100 }} w="100%">
          <Stack align="center" gap={0}>
            <Badge
              variant="light"
              color="blue"
              size="lg"
              mb="xl"
              leftSection={<TbBolt size={12} />}
              style={{ letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 11 }}
            >
              Full-Stack Starter Template
            </Badge>

            <Title
              order={1}
              ta="center"
              mb="md"
              style={{
                fontSize: 'clamp(2rem, 6vw, 3.75rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                maxWidth: 800,
              }}
            >
              Build production apps{' '}
              <Text span inherit variant="gradient" gradient={{ from: 'blue', to: 'violet', deg: 135 }}>
                at lightning speed
              </Text>
            </Title>

            <Text c="dimmed" ta="center" size="lg" maw={560} mb="xl" lh={1.7} px={{ base: 'xs', sm: 0 }}>
              A modern, opinionated full-stack template with authentication, real-time features, role-based access
              control, and a built-in dev console — ready to ship.
            </Text>

            <Group gap="sm" justify="center" wrap="wrap">
              <Button
                component={Link}
                to="/login"
                size="md"
                leftSection={<TbLogin size={16} />}
                rightSection={<TbArrowRight size={16} />}
                style={{ minWidth: 160 }}
              >
                Get Started
              </Button>
              <Button component={Link} to="/dashboard" size="md" variant="default" style={{ minWidth: 140 }}>
                View Demo
              </Button>
            </Group>

            {/* Tech stack row */}
            <Box mt={56} style={{ width: '100%', maxWidth: 640 }}>
              <Text ta="center" size="xs" c="dimmed" mb="md" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em' }}>
                Powered by
              </Text>
              <Group justify="center" gap="xl" wrap="wrap">
                {techStack.map(({ icon: Icon, label, color }) => (
                  <Group key={label} gap={6} style={{ opacity: 0.75 }}>
                    <Icon size={18} color={color || undefined} />
                    <Text size="sm" fw={500} c="dimmed">
                      {label}
                    </Text>
                  </Group>
                ))}
              </Group>
            </Box>
          </Stack>
        </Container>
      </Box>

      {/* ── Features ───────────────────────────────────────────────── */}
      <Box py={{ base: 60, sm: 80 }} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Container size="lg" px={{ base: 'md', sm: 'xl' }}>
          <Stack align="center" gap="xs" mb={48}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.1em' }}>
              Features
            </Text>
            <Title order={2} ta="center" fz={{ base: 'xl', sm: '2xl' }} fw={700} style={{ letterSpacing: '-0.02em' }}>
              Everything you need, nothing you don't
            </Title>
            <Text c="dimmed" ta="center" maw={480} size="sm" lh={1.7}>
              Carefully selected tools and patterns proven in production. Skip the boilerplate, focus on your product.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {features.map((f) => (
              <Card
                key={f.title}
                withBorder
                radius="md"
                p="xl"
                style={{
                  transition: 'border-color 150ms ease, transform 150ms ease',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--mantine-color-blue-5)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = ''
                  e.currentTarget.style.transform = ''
                }}
              >
                <ThemeIcon variant="light" color={f.color} size={40} radius="md" mb="md">
                  <f.icon size={20} />
                </ThemeIcon>
                <Text fw={600} mb={6} size="sm">
                  {f.title}
                </Text>
                <Text c="dimmed" size="sm" lh={1.6}>
                  {f.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── CTA Banner ─────────────────────────────────────────────── */}
      <Box py={{ base: 60, sm: 80 }} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Container size="sm" px={{ base: 'md', sm: 'xl' }}>
          <Stack align="center" gap="lg">
            <Title order={2} ta="center" fz={{ base: 'xl', sm: '2xl' }} fw={700} style={{ letterSpacing: '-0.02em' }}>
              Ready to build something great?
            </Title>
            <Text c="dimmed" ta="center" size="sm" maw={380} lh={1.7}>
              Sign in with Google or your email and start building in seconds.
            </Text>
            <Button
              component={Link}
              to="/login"
              size="md"
              leftSection={<TbLogin size={16} />}
              rightSection={<TbArrowRight size={16} />}
            >
              Start Building
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Container size="lg" px={{ base: 'md', sm: 'xl' }} py="lg">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <SiBun size={16} color="#fbf0df" />
              <Text size="xs" c="dimmed">
                Base Template — Bun · Elysia · React · Prisma
              </Text>
            </Group>
            <Group gap="xs">
              <Divider orientation="vertical" />
              <Text size="xs" c="dimmed">
                Built with Bun · Elysia · React · Prisma
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    </Box>
  )
}
