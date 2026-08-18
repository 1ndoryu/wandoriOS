/* [018A-32] Orval mutator boundary.
 * Generated files call this adapter; auth, CSRF and error policy stay in the
 * shared API client instead of being duplicated in every generated module. */

import { generatedFetcher } from './client';

export function customFetcher<T>(path: string, options?: RequestInit): Promise<T> {
  return generatedFetcher<T>(path, options);
}
