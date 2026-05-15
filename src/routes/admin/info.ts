import { Elysia } from 'elysia'
import { adminPresenceSchemaRoutesRouter } from './presence-schema-routes'
import { adminProjectStructureRouter } from './project-structure'
import { adminEnvMapRouter } from './env-map'
import { adminTestCoverageRouter } from './test-coverage'
import { adminDependenciesRouter } from './dependencies'
import { adminMigrationsRouter } from './migrations'
import { adminSessionsRouter } from './sessions'

export const adminInfoRouter = new Elysia()
  .use(adminPresenceSchemaRoutesRouter)
  .use(adminProjectStructureRouter)
  .use(adminEnvMapRouter)
  .use(adminTestCoverageRouter)
  .use(adminDependenciesRouter)
  .use(adminMigrationsRouter)
  .use(adminSessionsRouter)
