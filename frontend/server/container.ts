import "server-only";
import { after } from "next/server";
import { ApiKeyService, PgApiKeyRepository } from "@/server/api-keys/api-key-service";
import { RequestAuthenticator } from "@/server/auth/request-authenticator";
import { loadConfig, type AppConfig } from "@/server/config/app-config";
import { createDatabase, type Database } from "@/server/db/database";
import { MIGRATIONS } from "@/server/db/migrations";
import { Migrator } from "@/server/db/migrator";
import { SchemaGate, SchemaGatedDatabase, type SchemaReadiness } from "@/server/db/schema-gate";
import { pgUnitOfWork } from "@/server/db/unit-of-work";
import { fireAndForget, InProcessEventBus, type RunInBackground } from "@/server/events/event-bus";
import { RouteFactory } from "@/server/http/routes";
import { FilterService, PgJobFacetRepository } from "@/server/jobs/filter-service";
import { JobCleanupService } from "@/server/jobs/job-cleanup-service";
import { JobCommandService } from "@/server/jobs/job-command-service";
import { JobQueryService } from "@/server/jobs/job-query-service";
import { PgJobRepository } from "@/server/jobs/job-repository";
import { PostintimePublisher } from "@/server/postintime/postintime-publisher";
import { PgPostintimeSettingsRepository, PostintimeSettingsService } from "@/server/postintime/settings";
import { renderJobSquareImage } from "@/server/postintime/square-image";
import { systemClock, type Clock } from "@/server/shared/clock";
import { consoleLogger, type Logger } from "@/server/shared/logger";
import { PgTagRepository } from "@/server/tags/tag-repository";
import { TagCatalogService, TagDetectionService } from "@/server/tags/tag-services";

/**
 * Composition root: the one place that knows the concrete classes and wires them together, the job
 * Spring's dependency injection did before. Everything else depends on interfaces.
 */
export interface Services {
  config: AppConfig;
  /** The database, gated on `schema`: every statement waits until migrations have run. */
  db: Database;
  /** Migration state; `instrumentation.ts` waits on it at startup. */
  schema: SchemaReadiness;
  clock: Clock;
  logger: Logger;
  jobQueries: JobQueryService;
  jobCommands: JobCommandService;
  jobCleanup: JobCleanupService;
  filters: FilterService;
  tagCatalog: TagCatalogService;
  tagDetection: TagDetectionService;
  apiKeys: ApiKeyService;
  /** The PostInTime connection that the admin "PostInTime" tab edits. */
  postintimeSettings: PostintimeSettingsService;
  authenticator: RequestAuthenticator;
  routes: RouteFactory;
}

/** What `createServices` needs from the outside. Tests pass their own database, clock and schema state. */
export interface ServiceDependencies {
  config: AppConfig;
  /** The raw database; it is wrapped so that every statement waits for the schema. */
  db: Database;
  clock?: Clock;
  logger?: Logger;
  /** Defaults to a `SchemaGate` that runs the migrations on `db`. */
  schema?: SchemaReadiness;
  /** Where event listeners run. Defaults to right away, unawaited; the app passes `runAfterResponse`. */
  runInBackground?: RunInBackground;
}

/**
 * Runs a task once the response has been sent, and keeps the instance alive until it ends (Cloud Run
 * may otherwise freeze the CPU the moment the response is out). `after` only works inside a request,
 * so anywhere else the task simply starts.
 */
export const runAfterResponse: RunInBackground = (task) => {
  try {
    after(task);
  } catch {
    fireAndForget(task);
  }
};

/** Wires every service. Pure: it opens no connection (the pool connects on first use). */
export function createServices({ config, db: rawDb, clock = systemClock, logger = consoleLogger, schema, runInBackground = fireAndForget }: ServiceDependencies): Services {
  // Only the migrator uses the raw database; everything else goes through the gate.
  const gate = schema ?? new SchemaGate(() => new Migrator(rawDb, MIGRATIONS, logger).migrate(), logger);
  const db = new SchemaGatedDatabase(rawDb, gate);
  const jobsUow = pgUnitOfWork(db, (sql) => ({ jobs: new PgJobRepository(sql), tags: new PgTagRepository(sql) }));
  const facetsUow = pgUnitOfWork(db, (sql) => ({ facets: new PgJobFacetRepository(sql) }));
  const apiKeysUow = pgUnitOfWork(db, (sql) => ({ apiKeys: new PgApiKeyRepository(sql) }));
  const tagRepository = new PgTagRepository(db);
  const settingsUow = pgUnitOfWork(db, (sql) => ({ settings: new PgPostintimeSettingsRepository(sql) }));
  const postintimeSettings = new PostintimeSettingsService(settingsUow, clock);
  // Events: a created job is pushed to PostInTime. More listeners subscribe here.
  const events = new InProcessEventBus(logger, runInBackground);
  const postintime = new PostintimePublisher(postintimeSettings, renderJobSquareImage, logger);
  events.subscribe("JobPostCreated", (event) => postintime.onJobPostCreated(event));
  const apiKeys = new ApiKeyService(apiKeysUow, clock);
  const authenticator = new RequestAuthenticator(
    { adminToken: config.adminToken, internalSecret: config.internalSecret },
    apiKeys,
  );
  return {
    config,
    db,
    schema: gate,
    clock,
    logger,
    jobQueries: new JobQueryService(jobsUow, clock, config.jobs),
    jobCommands: new JobCommandService(jobsUow, clock, config.jobs, events),
    jobCleanup: new JobCleanupService(jobsUow, clock, logger),
    filters: new FilterService(facetsUow),
    tagCatalog: new TagCatalogService(tagRepository),
    tagDetection: new TagDetectionService(tagRepository, clock),
    apiKeys,
    postintimeSettings,
    authenticator,
    routes: new RouteFactory(authenticator, logger),
  };
}

/** Holder on `globalThis`, so `next dev` hot reloads reuse one pool instead of leaking a new one each time. */
const holder = globalThis as typeof globalThis & { __fastorialServices?: Services };

/**
 * The application's services, created on first use from `process.env`. Lazy on purpose: `next build`
 * imports route modules to analyze them, and must not need database settings to do so.
 */
export function getServices(): Services {
  holder.__fastorialServices ??= (() => {
    const config = loadConfig(process.env);
    return createServices({ config, db: createDatabase(config.database, consoleLogger), runInBackground: runAfterResponse });
  })();
  return holder.__fastorialServices;
}
