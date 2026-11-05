/**
 * Type checks for error classes that keep working when a module is loaded more than once.
 *
 * Why not `instanceof`? The production build (Turbopack) may emit the same module into several server
 * chunks, and each copy defines its own class. An error created by one copy is then *not* an
 * `instanceof` the class seen by another copy. This really happened here: validation errors thrown by
 * the request parsers were reported as 500s because the route's `instanceof ApiException` check failed.
 *
 * `Symbol.for(name)` returns the same symbol from the global registry in every copy, so a property
 * keyed by it identifies the error type no matter which copy created it.
 */

/** A brand for one error type: `mark` it in the constructor, test with `has`. */
export interface ErrorBrand {
  /** Marks `target` as carrying this brand (call in the constructor). */
  mark(target: object): void;
  /** True when `value` was marked with this brand by any copy of the module. */
  has(value: unknown): boolean;
}

/**
 * Creates the brand for an error type.
 *
 * @param name unique name of the error type, e.g. "ApiException".
 */
export function errorBrand(name: string): ErrorBrand {
  const key = Symbol.for(`fastorial-jobs.error.${name}`);
  return {
    mark(target) {
      Object.defineProperty(target, key, { value: true, enumerable: false });
    },
    has(value) {
      return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[key] === true;
    },
  };
}
