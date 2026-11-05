/**
 * Minimal logging port so services do not depend on `console` directly and tests can assert on logs.
 * Cloud Run (and so App Hosting) collects stdout and stderr, so the console is a fine production sink.
 */
export interface Logger {
  /** Records a routine event, such as how many jobs a cleanup closed. */
  info(message: string): void;
  /** Records a failure together with the error that caused it. */
  error(message: string, error?: unknown): void;
}

/** Logger writing to the process console, prefixed so backend lines are easy to find in Cloud Logging. */
export const consoleLogger: Logger = {
  info: (message) => console.info(`[jobs] ${message}`),
  error: (message, error) => console.error(`[jobs] ${message}`, error ?? ""),
};
