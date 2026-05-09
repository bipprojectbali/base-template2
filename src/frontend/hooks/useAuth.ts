import { useNavigate } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'

export type Role = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
}

export function getDefaultRoute(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/dev'
    case 'ADMIN':
      return '/dashboard'
    case 'QC':
      return '/dashboard'
    default:
      return '/profile'
  }
}

export function useSession() {
  const session = authClient.useSession()
  const user = session.data?.user as any

  return {
    data: user
      ? {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: (user.role as Role) ?? 'USER',
            blocked: (user.blocked as boolean) ?? false,
          } satisfies User,
        }
      : null,
    isLoading: session.isPending,
    error: session.error,
  }
}

export function useLogin() {
  const navigate = useNavigate()

  const signIn = async (data: { email: string; password: string }) => {
    const result = await authClient.signIn.email({
      email: data.email,
      password: data.password,
    })

    if (result.error) {
      throw new Error(result.error.message ?? 'Login gagal')
    }

    const user = result.data?.user as any
    if (user) {
      const role = (user.role as Role) ?? 'USER'
      navigate({ to: getDefaultRoute(role) })
    }

    return result
  }

  return {
    mutate: signIn,
    mutateAsync: signIn,
    isPending: false,
    isError: false,
    error: null as Error | null,
  }
}

export function useLogout() {
  const navigate = useNavigate()

  const signOut = async () => {
    await authClient.signOut()
    navigate({ to: '/login' })
    return { ok: true }
  }

  return {
    mutate: signOut,
    mutateAsync: signOut,
    isPending: false,
  }
}
