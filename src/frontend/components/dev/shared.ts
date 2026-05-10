import type { Role } from '@/frontend/hooks/useAuth'

// ─── Domain Types ──────────────────────────────────────────────────────────

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  blocked: boolean
  createdAt: string
}

export interface AppLogEntry {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
  timestamp: string
}

export interface AuditLogEntry {
  id: string
  userId: string | null
  action: string
  detail: string | null
  ip: string | null
  createdAt: string
  user: { name: string; email: string } | null
}

export interface SchemaField {
  name: string
  type: string
  isId: boolean
  isUnique: boolean
  isOptional: boolean
  isList: boolean
  isRelation: boolean
  default?: string
}

export interface SchemaModel {
  name: string
  tableName: string
  fields: SchemaField[]
}

export interface SchemaEnum {
  name: string
  values: string[]
}

export interface SchemaRelation {
  from: string
  fromField: string
  to: string
  toField: string
  onDelete?: string
}

export interface ParsedSchema {
  models: SchemaModel[]
  enums: SchemaEnum[]
  relations: SchemaRelation[]
}

export interface RouteInfo {
  method: string
  path: string
  auth: string
  category: string
  description: string
}

export interface RoutesData {
  routes: RouteInfo[]
  summary: { total: number; byMethod: Record<string, number>; byAuth: Record<string, number>; byCategory: Record<string, number> }
}

export interface FileInfo {
  path: string
  category: string
  lines: number
  exports: string[]
  imports: { from: string; names: string[] }[]
}

export interface ProjectData {
  files: FileInfo[]
  directories: { path: string; category: string; fileCount: number }[]
  summary: { totalFiles: number; totalLines: number; totalExports: number; totalImports: number; byCategory: Record<string, number> }
}

export interface EnvVar {
  name: string
  required: boolean
  isSet: boolean
  default: string | null
  category: string
  description: string
  usedBy: string[]
}

export interface EnvMapData {
  variables: EnvVar[]
  summary: { total: number; set: number; unset: number; required: number; byCategory: Record<string, number> }
}

export interface TestCoverageData {
  sourceFiles: { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }[]
  testFiles: { path: string; lines: number; type: string; targets: string[] }[]
  summary: { totalSource: number; totalTests: number; covered: number; partial: number; uncovered: number; coveragePercent: number }
}

export interface DepData {
  packages: { name: string; version: string; type: string; category: string; usedBy: string[] }[]
  summary: { total: number; runtime: number; dev: number; byCategory: Record<string, number> }
}

export interface MigrationData {
  migrations: { name: string; folder: string; createdAt: string; changes: string[]; sql: string }[]
  summary: { totalMigrations: number; firstMigration: string | null; lastMigration: string | null; totalChanges: number }
}

export interface SessionData {
  sessions: {
    id: string; userId: string; userName: string; userEmail: string
    userRole: string; userBlocked: boolean; isOnline: boolean
    createdAt: string; expiresAt: string; isExpired: boolean
  }[]
  summary: { totalSessions: number; activeSessions: number; expiredSessions: number; onlineUsers: number; byRole: Record<string, number> }
}

export interface RequestEvent {
  type: 'request'
  method: string
  path: string
  status: number
  duration: number
  timestamp: string
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const PAGE_SIZE = 25

export const roleBadge: Record<string, { color: string; label: string }> = {
  USER: { color: 'blue', label: 'User' },
  QC: { color: 'cyan', label: 'QC' },
  ADMIN: { color: 'violet', label: 'Admin' },
  SUPER_ADMIN: { color: 'red', label: 'Super Admin' },
}

export const levelBadge: Record<string, { color: string }> = {
  info: { color: 'blue' },
  warn: { color: 'yellow' },
  error: { color: 'red' },
}

export const actionBadge: Record<string, { color: string; label: string }> = {
  LOGIN: { color: 'green', label: 'Login' },
  LOGOUT: { color: 'gray', label: 'Logout' },
  LOGIN_FAILED: { color: 'orange', label: 'Login Failed' },
  LOGIN_BLOCKED: { color: 'red', label: 'Login Blocked' },
  ROLE_CHANGED: { color: 'violet', label: 'Role Changed' },
  BLOCKED: { color: 'red', label: 'Blocked' },
  UNBLOCKED: { color: 'teal', label: 'Unblocked' },
  TICKET_CREATED: { color: 'blue', label: 'Ticket Created' },
  TICKET_UPDATED: { color: 'indigo', label: 'Ticket Updated' },
}

export const METHOD_COLORS: Record<string, string> = {
  GET: 'blue', POST: 'green', PUT: 'orange', PATCH: 'yellow',
  DELETE: 'red', WS: 'violet', ALL: 'gray', PAGE: 'teal',
}

export const AUTH_COLORS: Record<string, string> = {
  public: 'gray', authenticated: 'blue', superAdmin: 'red',
  admin: 'violet', qcOrAdmin: 'cyan', secret: 'orange',
}

export const CATEGORY_COLORS: Record<string, string> = {
  frontend: 'blue', auth: 'green', admin: 'violet', tickets: 'orange',
  utility: 'gray', mcp: 'yellow', realtime: 'teal',
}

export const COVERAGE_COLORS: Record<string, string> = {
  covered: 'green', partial: 'yellow', uncovered: 'red',
}

export type LayoutType = 'horizontal' | 'vertical' | 'radial' | 'force'

export const projectSubViews = [
  { group: 'Architecture', value: 'api-routes', label: 'API Routes' },
  { group: 'Architecture', value: 'file-structure', label: 'File Structure' },
  { group: 'Architecture', value: 'user-flow', label: 'User Flow' },
  { group: 'Architecture', value: 'data-flow', label: 'Data Flow' },
  { group: 'DevOps', value: 'env-map', label: 'Env Variables' },
  { group: 'DevOps', value: 'test-coverage', label: 'Test Coverage' },
  { group: 'DevOps', value: 'dependencies', label: 'Dependencies' },
  { group: 'DevOps', value: 'migrations', label: 'Migrations' },
  { group: 'Live', value: 'sessions', label: 'Sessions' },
  { group: 'Live', value: 'live-requests', label: 'Live Requests' },
] as const

export type ProjectSubView = (typeof projectSubViews)[number]['value']
