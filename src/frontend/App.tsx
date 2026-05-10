import { ColorSchemeScript, createTheme, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { ModalsProvider } from '@mantine/modals'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 1 },
  },
  // Intercept 401 dari semua query/mutation — reset session agar route guards bereaksi
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof UnauthorizedError) {
        queryClient.setQueryData(['auth', 'session'], null)
      }
    },
  }),
})

export function App() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} context={{ queryClient }} />
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>
    </>
  )
}
