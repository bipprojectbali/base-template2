import { Alert, Box, Button, Center, Divider, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { createRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { TbAlertCircle, TbLock, TbLogin, TbMail } from 'react-icons/tb'
import { ThemeToggle } from '@/frontend/components/ThemeToggle'
import { getDefaultRoute } from '@/frontend/hooks/useAuth'
import { authClient } from '@/lib/auth-client'
import { rootRoute } from './__root'

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { error?: string } => {
    const error = typeof search.error === 'string' ? search.error : undefined
    return error ? { error } : {}
  },
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
  component: LoginPage,
})

function LoginPage() {
  const { error: searchError } = loginRoute.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError(null)

    const result = await authClient.signIn.email({ email, password })

    if (result.error) {
      setLoginError(result.error.message ?? 'Email atau password salah')
      setIsLoading(false)
      return
    }

    const user = result.data?.user as any
    if (user) {
      window.location.href = getDefaultRoute((user.role ?? 'USER') as any)
    }
    setIsLoading(false)
  }

  const handleGoogleLogin = () => {
    authClient.signIn.social({ provider: 'google' })
  }

  return (
    <Center mih="100vh" style={{ position: 'relative' }}>
      <Box style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </Box>
      <Paper shadow="md" p="xl" radius="md" w={400} withBorder>
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Title order={2} ta="center">
              Login
            </Title>

            <Text c="dimmed" size="sm" ta="center">
              Super Admin: <strong>superadmin@example.com</strong> / <strong>superadmin123</strong>
              <br />
              Admin: <strong>admin@example.com</strong> / <strong>admin123</strong>
              <br />
              User: <strong>user@example.com</strong> / <strong>user123</strong>
            </Text>

            {(loginError || searchError) && (
              <Alert icon={<TbAlertCircle size={16} />} color="red" variant="light">
                {loginError ?? 'Login dengan Google gagal, coba lagi.'}
              </Alert>
            )}

            <TextInput
              label="Email"
              placeholder="email@example.com"
              leftSection={<TbMail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />

            <PasswordInput
              label="Password"
              placeholder="Password"
              leftSection={<TbLock size={16} />}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button type="submit" fullWidth leftSection={<TbLogin size={18} />} loading={isLoading}>
              Sign in
            </Button>

            <Divider label="atau" labelPosition="center" />

            <Button
              onClick={handleGoogleLogin}
              fullWidth
              variant="default"
              leftSection={<FcGoogle size={18} />}
              type="button"
            >
              Login dengan Google
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
