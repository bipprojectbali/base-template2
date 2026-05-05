import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { loginRoute } from './routes/login'
import { devRoute } from './routes/dev'
import { dashboardRoute } from './routes/dashboard'
import { profileRoute } from './routes/profile'
import { blockedRoute } from './routes/blocked'

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  devRoute,
  dashboardRoute,
  profileRoute,
  blockedRoute,
])

export const router = createRouter({
  routeTree,
  context: { queryClient: undefined as unknown as QueryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
