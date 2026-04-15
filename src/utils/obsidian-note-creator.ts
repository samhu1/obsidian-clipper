import browser from './browser-polyfill';
import { sanitizeFileName } from '../utils/string-utils';
import { copyToClipboard } from './clipboard-utils';

async function openObsidianUrl(url: string): Promise<void> {
	if (typeof window === 'undefined') {
		const tabs = await browser.tabs.query({ active: true, currentWindow: true });
		const tab = tabs[0];
		if (tab?.id) {
			await browser.tabs.update(tab.id, { url });
			return;
		}
		await browser.tabs.create({ url });
		return;
	}

	browser.runtime.sendMessage({
		action: 'openObsidianUrl',
		url
	}).catch((error) => {
		console.error('[Nugget] Error opening Obsidian URL via background script:', error);
		window.open(url, '_blank');
	});
}

async function copyToClipboardFromBackground(text: string): Promise<boolean> {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	const tab = tabs[0];
	if (!tab?.id) return false;

	try {
		const response = await browser.tabs.sendMessage(tab.id, {
			action: 'copy-text-to-clipboard',
			text,
		}) as { success?: boolean } | undefined;
		return response?.success === true;
	} catch (error) {
		console.error('[Nugget] Background clipboard fallback failed:', error);
		return false;
	}
}

async function tryClipboardWrite(fileContent: string, obsidianUrl: string): Promise<void> {
	const success = typeof window === 'undefined'
		? await copyToClipboardFromBackground(fileContent)
		: await copyToClipboard(fileContent);

	if (success) {
		// &clipboard tells Obsidian to read data from clipboard instead of the content param.
		obsidianUrl += `&clipboard&content=${encodeURIComponent('Open Obsidian to paste the captured content.')}`;
	} else {
		// Fallback: encode content directly in the URL
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
	}

	await openObsidianUrl(obsidianUrl);
}

/**
 * Create or append to an Obsidian note.
 *
 * @param vault    - Obsidian vault name (empty string = default vault)
 * @param path     - File path within the vault, e.g. "AI Snippets/ChatGPT"
 * @param content  - Markdown content to write
 * @param behavior - 'append' adds to existing file; 'create' creates a new file
 */
export async function createNote(
	vault: string,
	path: string,
	content: string,
	behavior: 'append' | 'create'
): Promise<void> {
	// Normalise path: split off the last component as the file name
	const lastSlash = path.lastIndexOf('/');
	const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '';
	const rawName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
	const fileName = sanitizeFileName(rawName || 'Nugget Note');

	let obsidianUrl = `obsidian://new?file=${encodeURIComponent(dir + fileName)}`;

	if (behavior === 'append') {
		obsidianUrl += '&append=true';
	}

	if (vault) {
		obsidianUrl += `&vault=${encodeURIComponent(vault)}`;
	}

	await tryClipboardWrite(content, obsidianUrl);
}
