import { Accordion, Alert, Badge, List, Stack, Table, Text, ThemeIcon } from '@mantine/core'
import { TbInfoCircle, TbListCheck, TbRuler2, TbShieldCheck } from 'react-icons/tb'

/** Tabel batas ukuran per kategori — mirror dari docs/FILE-HEALTH.md (sumber kebenaran). */
const SIZE_LIMITS: { type: string; lines: string; chars: string }[] = [
  { type: 'Route / handler', lines: '150', chars: '6.000' },
  { type: 'Service / use-case', lines: '300', chars: '12.000' },
  { type: 'Repository / query', lines: '250', chars: '10.000' },
  { type: 'Schema / validation', lines: '200', chars: '8.000' },
  { type: 'Types / interfaces', lines: '300', chars: '10.000' },
  { type: 'Utility / helper', lines: '200', chars: '8.000' },
  { type: 'Config', lines: '100', chars: '4.000' },
  { type: 'Test file', lines: '400', chars: '16.000' },
]

const RULES: string[] = [
  'Satu file, satu tanggung jawab — harus bisa dijelaskan dalam satu kalimat pendek.',
  'Tidak ada "god file" — jangan campur transport layer (HTTP/WS) dengan business logic.',
  'Penamaan eksplisit: pola [domain].[layer].ts — hindari utils.ts, helpers.ts, misc.ts.',
  'Index file = re-export only, maksimal 50 baris.',
  'Pecah file jika: melebihi batas, ada ≥2 fungsi tak saling bergantung, atau >3 exported symbol utama.',
]

const STATUS_LEGEND: { color: string; label: string; desc: string }[] = [
  { color: 'green', label: 'OK', desc: 'Di bawah 80% batas — sehat.' },
  { color: 'yellow', label: 'Warning', desc: '80–100% batas — pertimbangkan pecah file.' },
  { color: 'red', label: 'Critical', desc: 'Melebihi batas — wajib dipecah.' },
  { color: 'gray', label: 'Exempt', desc: 'Dikecualikan (generated, migration, seed, fixtures, mocks).' },
]

export function FileHealthInfo() {
  return (
    <Accordion variant="separated" radius="md" defaultValue={null}>
      <Accordion.Item value="info">
        <Accordion.Control
          icon={
            <ThemeIcon variant="light" color="blue" size="sm">
              <TbInfoCircle size={16} />
            </ThemeIcon>
          }
        >
          <Text fw={600} size="sm">
            Apa itu File Health & kenapa penting?
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="lg">
            <div>
              <Text size="sm">
                <strong>File Health</strong> memantau ukuran tiap file project (jumlah baris & karakter) terhadap batas
                yang ditetapkan di <code>docs/FILE-HEALTH.md</code>. Tujuannya menjaga file tetap kecil, kohesif, dan
                mudah diproses — baik oleh manusia maupun AI.
              </Text>
            </div>

            <Alert variant="light" color="blue" icon={<TbShieldCheck size={18} />} title="Kenapa ini penting">
              <List size="sm" spacing={4}>
                <List.Item>
                  File besar sulit dipahami, rawan konflik merge, dan memuat banyak tanggung jawab sekaligus.
                </List.Item>
                <List.Item>
                  Konteks AI terbatas — file ringkas membuat asisten lebih akurat dan hemat token saat membaca/mengedit.
                </List.Item>
                <List.Item>Mendeteksi dini "god file" sebelum jadi utang teknis yang mahal untuk dirombak.</List.Item>
              </List>
            </Alert>

            <div>
              <Text fw={600} size="sm" mb="xs">
                <ThemeIcon variant="light" color="orange" size="sm" mr={6} style={{ verticalAlign: 'middle' }}>
                  <TbRuler2 size={14} />
                </ThemeIcon>
                Batas ukuran per tipe file
              </Text>
              <Table withTableBorder withColumnBorders striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tipe File</Table.Th>
                    <Table.Th>Maks Baris</Table.Th>
                    <Table.Th>Maks Karakter</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {SIZE_LIMITS.map((r) => (
                    <Table.Tr key={r.type}>
                      <Table.Td>{r.type}</Table.Td>
                      <Table.Td>{r.lines}</Table.Td>
                      <Table.Td>{r.chars}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt="xs">
                Hard limit global: <strong>500 baris</strong> / <strong>20.000 karakter</strong> — kecuali file
                generated (migration, seed, generated types).
              </Text>
            </div>

            <div>
              <Text fw={600} size="sm" mb="xs">
                <ThemeIcon variant="light" color="grape" size="sm" mr={6} style={{ verticalAlign: 'middle' }}>
                  <TbListCheck size={14} />
                </ThemeIcon>
                Aturan wajib
              </Text>
              <List size="sm" spacing={6}>
                {RULES.map((rule) => (
                  <List.Item key={rule}>{rule}</List.Item>
                ))}
              </List>
            </div>

            <div>
              <Text fw={600} size="sm" mb="xs">
                Arti status
              </Text>
              <Stack gap={6}>
                {STATUS_LEGEND.map((s) => (
                  <div key={s.label}>
                    <Badge color={s.color} variant="light" size="sm" mr="sm">
                      {s.label}
                    </Badge>
                    <Text span size="sm" c="dimmed">
                      {s.desc}
                    </Text>
                  </div>
                ))}
              </Stack>
            </div>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
