import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'

export type Role = 'USER' | 'QC' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  image?: string | null
}

type SessionUser = {
  id: string
  name: string
  email: string
  role?: string
  blocked?: boolean
  image?: string | null
  [key: string]: unknown
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
  const user = session.data?.user as SessionUser | undefined

  return {
    data: user
      ? {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: (user.role as Role) ?? 'USER',
            blocked: (user.blocked as boolean) ?? false,
            image: user.image ?? null,
          } satisfies User,
        }
      : null,
    isLoading: session.isPending,
    error: session.error,
  }
}

export function useLogin() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        throw new Error(result.error.message ?? 'Login gagal')
      }

      const user = result.data?.user as SessionUser | undefined
      if (user) {
        const role = (user.role as Role) ?? 'USER'
        navigate({ to: getDefaultRoute(role) })
      }

      return result
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'session'], null)
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      navigate({ to: '/login' })
    },
  })
}
