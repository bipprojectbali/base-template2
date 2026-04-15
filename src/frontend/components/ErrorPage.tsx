import { Button, Center, Code, Stack, Text, Title } from '@mantine/core'
import { TbAlertTriangle, TbRefresh } from 'react-icons/tb'

export function ErrorPage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak terduga'

  return (
    <Center mih="100vh">
      <Stack align="center" gap="md" maw={500}>
        <TbAlertTriangle size={80} color="var(--mantine-color-red-6)" />
        <Title order={1}>500</Title>
        <Text c="dimmed" size="lg" ta="center">
          Terjadi kesalahan pada server
        </Text>
        <Code block c="red" style={{ maxWidth: '100%', wordBreak: 'break-word' }}>
          {message}
        </Code>
        <Button onClick={() => window.location.reload()} leftSection={<TbRefresh size={18} />} variant="light">
          Muat Ulang
        </Button>
      </Stack>
    </Center>
  )
}
