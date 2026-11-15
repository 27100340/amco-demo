/**
 * Storage errors in plain English. Every backend maps its own failures through `storageError`,
 * so the page only has to look at `error.code`: 'QUOTA' (out of space) or 'STORAGE' (anything else).
 */

/** Shown when the browser has no room left for this site. */
export const QUOTA_MESSAGE = 'Your browser is out of space for drawings. Remove an old project or export this one.';
/** Shown for any other failure to save. */
export const STORAGE_MESSAGE = 'Your browser couldn\'t save this project just now. Export it to keep a copy.';

/**
 * True when an error means the storage quota is used up.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isQuotaError(error) {
  if (!error || typeof error !== 'object') return false;
  return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 'QUOTA' || /quota/i.test(String(error.message ?? ''));
}

/**
 * Wraps a backend failure in an Error with a `code` and a customer-facing message.
 * @param {unknown} error the original failure
 * @returns {Error & { code: 'QUOTA'|'STORAGE' }}
 */
export function storageError(error) {
  const quota = isQuotaError(error);
  const wrapped = new Error(quota ? QUOTA_MESSAGE : STORAGE_MESSAGE, { cause: error });
  wrapped.code = quota ? 'QUOTA' : 'STORAGE';
  return wrapped;
}
