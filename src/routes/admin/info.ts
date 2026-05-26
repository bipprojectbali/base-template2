import { Elysia } from 'elysia'
import { adminDependenciesRouter } from './dependencies'
import { adminEnvMapRouter } from './env-map'
import { adminFileHealthRouter } from './file-health'
import { adminMigrationsRouter } from './migrations'
import { adminPresenceSchemaRoutesRouter } from './presence-schema-routes'
import { adminProjectStructureRouter } from './project-structure'
import { adminSessionsRouter } from './sessions'
import { adminTestCoverageRouter } from './test-coverage'

export const adminInfoRouter = new Elysia()
  .use(adminPresenceSchemaRoutesRouter)
  .use(adminProjectStructureRouter)
  .use(adminEnvMapRouter)
  .use(adminTestCoverageRouter)
  .use(adminDependenciesRouter)
  .use(adminMigrationsRouter)
  .use(adminSessionsRouter)
  .use(adminFileHealthRouter)
