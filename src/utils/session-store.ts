import browser from './browser-polyfill';
import { NuggetSnippet, NuggetDestination } from '../types/nugget';

// Keys used in storage
const SNIPPETS_KEY = 'nugget_session_snippets';
const LAST_DESTINATION_KEY = 'nugget_session_last_destination';
const RECENT_DESTINATIONS_KEY = 'nugget_session_recent_destinations';

const MAX_RECENT_DESTINATIONS = 5;

/**
 * Returns chrome.storage.session if available (MV3), otherwise falls back to
 * chrome.storage.local with a "nugget_session_" prefix to keep Nugget session
 * data logically separate from extension-wide local storage.
 */
function getStorage(): any {
  if (
    typeof chrome !== 'undefined' &&
    chrome.storage &&
    (chrome.storage as any).session
  ) {
    return (chrome.storage as any).session as chrome.storage.StorageArea;
  }
  return browser.storage.local;
}

async function storageGet(key: string): Promise<any> {
  const result = await getStorage().get(key);
  return (result as Record<string, any>)[key];
}

async function storageSet(key: string, value: any): Promise<void> {
  return getStorage().set({ [key]: value });
}

/**
 * Append a snippet to the staging list.
 * Silently replaces any snippet with the same id to avoid duplicates.
 */
export async function addSnippet(snippet: NuggetSnippet): Promise<void> {
  try {
    const existing: NuggetSnippet[] = (await storageGet(SNIPPETS_KEY)) ?? [];
    const filtered = existing.filter((s) => s.id !== snippet.id);
    filtered.push(snippet);
    await storageSet(SNIPPETS_KEY, filtered);
  } catch (error) {
    console.error('[Nugget] addSnippet failed:', error);
    throw error;
  }
}

/**
 * Return all staged snippets in their current order.
 */
export async function getSnippets(): Promise<NuggetSnippet[]> {
  try {
    return (await storageGet(SNIPPETS_KEY)) ?? [];
  } catch (error) {
    console.error('[Nugget] getSnippets failed:', error);
    return [];
  }
}

/**
 * Remove a single snippet by id.
 */
export async function removeSnippet(id: string): Promise<void> {
  try {
    const existing: NuggetSnippet[] = (await storageGet(SNIPPETS_KEY)) ?? [];
    const filtered = existing.filter((s) => s.id !== id);
    await storageSet(SNIPPETS_KEY, filtered);
  } catch (error) {
    console.error('[Nugget] removeSnippet failed:', error);
    throw error;
  }
}

/**
 * Remove all staged snippets.
 */
export async function clearSnippets(): Promise<void> {
  try {
    await storageSet(SNIPPETS_KEY, []);
  } catch (error) {
    console.error('[Nugget] clearSnippets failed:', error);
    throw error;
  }
}

/**
 * Reorder snippets to match the provided id ordering.
 * Ids not present in the current list are silently ignored.
 * Snippets not referenced in `ids` are appended at the end to avoid data loss.
 */
export async function reorderSnippets(ids: string[]): Promise<void> {
  try {
    const existing: NuggetSnippet[] = (await storageGet(SNIPPETS_KEY)) ?? [];
    const map = new Map(existing.map((s) => [s.id, s]));

    const ordered: NuggetSnippet[] = [];
    for (const id of ids) {
      const snippet = map.get(id);
      if (snippet) {
        ordered.push(snippet);
        map.delete(id);
      }
    }
    // Append any snippets that weren't referenced in the new order
    for (const remaining of map.values()) {
      ordered.push(remaining);
    }

    await storageSet(SNIPPETS_KEY, ordered);
  } catch (error) {
    console.error('[Nugget] reorderSnippets failed:', error);
    throw error;
  }
}

/**
 * Retrieve the most recently used destination, or undefined if none has been saved.
 */
export async function getLastDestination(): Promise<NuggetDestination | undefined> {
  try {
    return (await storageGet(LAST_DESTINATION_KEY)) ?? undefined;
  } catch (error) {
    console.error('[Nugget] getLastDestination failed:', error);
    return undefined;
  }
}

/**
 * Persist a destination as the most recently used one and prepend it to the
 * recent-destinations list (deduplicating by vault + path, capped at 5).
 */
export async function setLastDestination(dest: NuggetDestination): Promise<void> {
  try {
    await storageSet(LAST_DESTINATION_KEY, dest);

    // Update the recent destinations list
    const recent: NuggetDestination[] = (await storageGet(RECENT_DESTINATIONS_KEY)) ?? [];
    // Deduplicate: remove any existing entry with same vault+path
    const filtered = recent.filter(
      (d) => !(d.vault === dest.vault && d.path === dest.path)
    );
    // Prepend the new destination and cap the list
    const updated = [dest, ...filtered].slice(0, MAX_RECENT_DESTINATIONS);
    await storageSet(RECENT_DESTINATIONS_KEY, updated);
  } catch (error) {
    console.error('[Nugget] setLastDestination failed:', error);
    throw error;
  }
}

/**
 * Return up to 5 recent destinations, most recent first.
 */
export async function getRecentDestinations(): Promise<NuggetDestination[]> {
  try {
    return (await storageGet(RECENT_DESTINATIONS_KEY)) ?? [];
  } catch (error) {
    console.error('[Nugget] getRecentDestinations failed:', error);
    return [];
  }
}
