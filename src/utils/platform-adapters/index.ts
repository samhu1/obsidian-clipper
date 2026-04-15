import { PlatformAdapter } from '../../types/nugget';
import { chatGPTAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { perplexityAdapter } from './perplexity';

export { chatGPTAdapter } from './chatgpt';
export { claudeAdapter } from './claude';
export { geminiAdapter } from './gemini';
export { perplexityAdapter } from './perplexity';

/**
 * All supported platform adapters, in priority order.
 * The first adapter whose `matches()` returns true for a given URL wins.
 */
export const SUPPORTED_PLATFORMS: PlatformAdapter[] = [
  chatGPTAdapter,
  claudeAdapter,
  geminiAdapter,
  perplexityAdapter,
];

/**
 * Return the adapter for the given URL, or undefined if no adapter matches.
 */
export function detectPlatform(url: string): PlatformAdapter | undefined {
  return SUPPORTED_PLATFORMS.find((adapter) => adapter.matches(url));
}

/**
 * Return true if the URL belongs to any supported AI platform.
 */
export function isSupported(url: string): boolean {
  return SUPPORTED_PLATFORMS.some((adapter) => adapter.matches(url));
}
