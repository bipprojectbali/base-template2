import { Button, Center, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { TbArrowLeft, TbError404 } from 'react-icons/tb'

export function NotFound() {
  return (
    <Center mih="100vh">
      <Stack align="center" gap="md">
        <TbError404 size={80} color="var(--mantine-color-dimmed)" />
        <Title order={1}>404</Title>
        <Text c="dimmed" size="lg">
          Halaman tidak ditemukan
        </Text>
        <Button component={Link} to="/" leftSection={<TbArrowLeft size={18} />} variant="light">
          Kembali ke Beranda
        </Button>
      </Stack>
    </Center>
  )
}
