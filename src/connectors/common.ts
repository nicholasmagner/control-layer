export interface CollectResult<Inventory> {
  inventory: Inventory;
  /** Sections that could not be read (usually missing permissions). */
  errors: string[];
  /** Human-readable account / project / subscription identifier. */
  account: string;
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = (err as { name?: string }).name;
    return name && name !== 'Error' ? `${name}: ${err.message}` : err.message;
  }
  return String(err);
}

/**
 * Runs one collection step. On failure the error is recorded and undefined is
 * returned, so the checks that depend on this section report "not evaluated"
 * instead of passing.
 */
export async function section<T>(label: string, errors: string[], fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${describeError(err)}`);
    return undefined;
  }
}
