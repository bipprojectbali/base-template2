import { Elysia } from 'elysia'
import { auth } from './auth'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
  blocked: boolean
}

// Mount Better Auth handler + derive authUser from session cookie on every request
export const betterAuthPlugin = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .derive({ as: 'global' }, async ({ request: { headers } }) => {
    const session = await auth.api.getSession({ headers })
    if (!session) return { authUser: null as AuthUser | null }
    const u = session.user as any
    return {
      authUser: {
        id: u.id as string,
        email: u.email as string,
        name: u.name as string,
        role: (u.role as string) ?? 'USER',
        blocked: (u.blocked as boolean) ?? false,
      } as AuthUser | null,
    }
  })
