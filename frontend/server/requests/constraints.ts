import { ApiException, type FieldErrors } from "@/server/shared/api-exception";
import { javaTrim } from "@/server/shared/java-text";

/** The message Spring sent with every `VALIDATION_FAILED` response for annotation violations. */
export const VALIDATION_MESSAGE = "Please fix the highlighted fields";

/**
 * Collects per field validation messages, like the former backend's handler for
 * `MethodArgumentNotValidException`, which kept only the first message for each field
 * (`fields.putIfAbsent(field, message)`).
 */
export class ConstraintViolations {
  private readonly errors: FieldErrors = {};

  /** Records `message` for `field`, unless that field already has a message. */
  add(field: string, message: string): void {
    if (!(field in this.errors)) this.errors[field] = message;
  }

  /** Records `message` for `field` when `valid` is false. Convenience for one line rules. */
  require(valid: boolean, field: string, message: string): void {
    if (!valid) this.add(field, message);
  }

  /** True when no rule failed. */
  isEmpty(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  /** Throws `400 VALIDATION_FAILED` with the collected field errors, if there are any. */
  throwIfAny(message: string = VALIDATION_MESSAGE): void {
    if (!this.isEmpty()) throw ApiException.validationFailed(message, { ...this.errors });
  }
}

/** `@NotBlank`: not null and not empty after Java's `trim()`. */
export function isNotBlank(value: string | null): value is string {
  return value !== null && javaTrim(value).length > 0;
}

/** `@Size(max = n)`: null passes, otherwise at most `max` UTF-16 code units (Java's `length()`). */
export function fitsMaxLength(value: string | null, max: number): boolean {
  return value === null || value.length <= max;
}

/** `@Min(n)`: null passes. */
export function isAtLeast(value: number | null, min: number): boolean {
  return value === null || value >= min;
}

/** `@Max(n)`: null passes. */
export function isAtMost(value: number | null, max: number): boolean {
  return value === null || value <= max;
}

/** `@Pattern(regexp)`: null passes, otherwise the whole value must match (Java's `matches()`). */
export function matchesFully(value: string | null, pattern: RegExp): boolean {
  return value === null || pattern.test(value);
}

/**
 * Hibernate Validator's default message for `@Size` when no custom message was given, used by the
 * location fields: `size must be between 0 and 100`.
 */
export function defaultSizeMessage(max: number): string {
  return `size must be between 0 and ${max}`;
}
