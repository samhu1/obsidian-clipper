import browser from 'webextension-polyfill';
import { isValidUrl } from './utils/active-tab-manager';
import { createNote } from './utils/obsidian-note-creator';
import { NuggetSnippet, NuggetDestination } from './types/nugget';
import { addSnippet, clearSnippets, getSnippets } from './utils/session-store';
import { formatBatch } from './utils/nugget-formatter';

async function addStagedSnippet(snippet: NuggetSnippet): Promise<void> {
	await addSnippet(snippet);
	await updateBadge();
}

async function clearStagedSnippets(): Promise<void> {
	await clearSnippets();
}

async function updateBadge(): Promise<void> {
	const count = (await getSnippets()).length;
	try {
		if (count === 0) {
			await browser.action.setBadgeText({ text: '' });
		} else {
			await browser.action.setBadgeText({ text: String(count) });
			await browser.action.setBadgeBackgroundColor({ color: '#7c5cbf' });
		}
	} catch (err) {
		console.error('[Nugget] Failed to update badge:', err);
	}
}

// ── Utility: inject content script if not already present ─────────────────────
async function injectContentScript(tabId: number): Promise<void> {
	if (browser.scripting) {
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['content.js']
		});
	} else {
		await (browser.tabs as any).executeScript(tabId, { file: 'content.js' });
	}

	// Poll until content script responds
	for (let i = 0; i < 8; i++) {
		try {
			await browser.tabs.sendMessage(tabId, { action: 'ping' });
			return;
		} catch { /* not ready yet */ }
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error('Content script did not respond after injection');
}

async function ensureContentScript(tabId: number): Promise<void> {
	const tab = await browser.tabs.get(tabId);
	if (!tab.url || !isValidUrl(tab.url)) {
		throw new Error('Invalid URL for content script injection');
	}
	try {
		await browser.tabs.sendMessage(tabId, { action: 'ping' });
	} catch {
		await injectContentScript(tabId);
	}
}

// ── Active tab helper ──────────────────────────────────────────────────────────
async function getActiveTab(): Promise<browser.Tabs.Tab | null> {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	return tabs[0] ?? null;
}

// ── Context menu: single item ─────────────────────────────────────────────────
async function createContextMenu(): Promise<void> {
	await browser.contextMenus.removeAll();
	await browser.contextMenus.create({
		id: 'nugget_add_selection',
		title: 'Add selection to Nugget',
		contexts: ['selection']
	});
}

browser.runtime.onInstalled.addListener(() => {
	createContextMenu().catch(err => console.error('[Nugget] Context menu creation failed:', err));
});

// ── Context menu click ────────────────────────────────────────────────────────
browser.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId !== 'nugget_add_selection') return;
	if (!tab?.id) return;

	try {
			await ensureContentScript(tab.id);
			const response = await browser.tabs.sendMessage(tab.id, { action: 'nugget_capture_selection' }) as NuggetSnippet | { success: false; error: string } | null;
			if (response && !('success' in response)) {
				await addStagedSnippet(response);
			}
	} catch (err) {
		console.error('[Nugget] Failed to capture selection via context menu:', err);
	}
});

// ── Keyboard commands ─────────────────────────────────────────────────────────
browser.commands.onCommand.addListener(async (command) => {
	if (command === 'quick_clip') {
		const tab = await getActiveTab();
		if (!tab?.id) return;

		try {
			await ensureContentScript(tab.id);
			const snippet = await browser.tabs.sendMessage(tab.id, { action: 'nugget_capture_selection' }) as NuggetSnippet | { success: false; error: string } | null;

			if (snippet && !('success' in snippet)) {
				// Try to export to last destination immediately
				const data = await browser.storage.local.get('nugget_last_destination');
				const lastDest = data.nugget_last_destination as NuggetDestination | undefined;

				if (lastDest) {
					const content = formatBatch({ snippets: [snippet], destination: lastDest });
					await createNote(lastDest.vault, lastDest.path, content, lastDest.behavior);
				} else {
					// No last destination — open popup so user can choose
					await browser.action.openPopup();
				}
			}
		} catch (err) {
			console.error('[Nugget] quick_clip failed:', err);
			// Fall back to popup on error
			try { await browser.action.openPopup(); } catch { /* nothing */ }
		}
	}
	// _execute_action is handled natively by the browser (opens popup)
});

// ── Message handlers ──────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((
	request: unknown,
	_sender: browser.Runtime.MessageSender,
	sendResponse: (response?: any) => void
): true | undefined => {
	if (typeof request !== 'object' || request === null) return undefined;
	const req = request as { action: string; [key: string]: any };

	// Export: receive snippets + destination, write to Obsidian
	if (req.action === 'nugget_export') {
		const { snippets, destination } = req as unknown as {
			snippets: NuggetSnippet[];
			destination: NuggetDestination;
		};

		(async () => {
			try {
				const content = formatBatch({ snippets, destination });
				await createNote(destination.vault, destination.path, content, destination.behavior);

				// Persist as last used destination
				await browser.storage.local.set({ nugget_last_destination: destination });

				// Clear staged snippets after successful export
				await clearStagedSnippets();
				await updateBadge();

				sendResponse({ success: true });
			} catch (err) {
				console.error('[Nugget] Export failed:', err);
				sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
			}
		})();
		return true;
	}

	// Add to batch: called by content script or popup when user stages a snippet
	if (req.action === 'nugget_add_to_batch') {
		const snippet = req.snippet as NuggetSnippet;
		addStagedSnippet(snippet).then(() => {
			getSnippets().then((snippets) => sendResponse({ success: true, count: snippets.length }));
		}).catch(err => {
			sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
		});
		return true;
	}

	// Get staged snippets (popup reads these)
	if (req.action === 'nugget_get_staged') {
		getSnippets()
			.then((snippets) => sendResponse({ snippets, count: snippets.length }))
			.catch((err) => sendResponse({ snippets: [], count: 0, error: err instanceof Error ? err.message : String(err) }));
		return true;
	}

	// Clear staged snippets
	if (req.action === 'nugget_clear_staged') {
		clearStagedSnippets()
			.then(() => updateBadge())
			.then(() => sendResponse({ success: true }))
			.catch((err) => sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }));
		return true;
	}

	// Open options page
	if (req.action === 'openOptionsPage') {
		try {
			if (typeof browser.runtime.openOptionsPage === 'function') {
				browser.runtime.openOptionsPage();
			} else {
				browser.tabs.create({ url: browser.runtime.getURL('settings.html') });
			}
			sendResponse({ success: true });
		} catch (err) {
			sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
		}
		return true;
	}

	// Open Obsidian URL (used by createNote)
	if (req.action === 'openObsidianUrl') {
		const url = req.url as string;
		if (!url) {
			sendResponse({ success: false, error: 'Missing URL' });
			return true;
		}
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			const tab = tabs[0];
			if (tab?.id) {
				browser.tabs.update(tab.id, { url }).then(() => {
					sendResponse({ success: true });
				}).catch(err => {
					sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
				});
			} else {
				sendResponse({ success: false, error: 'No active tab found' });
			}
		});
		return true;
	}

	// Clipboard proxy (used by createNote's clipboard fallback)
	if (req.action === 'copy-to-clipboard' && req.text) {
		browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
			const tab = tabs[0];
			if (tab?.id) {
				try {
					const resp = await browser.tabs.sendMessage(tab.id, {
						action: 'copy-text-to-clipboard',
						text: req.text
					}) as { success: boolean } | undefined;
					sendResponse(resp?.success ? { success: true } : { success: false, error: 'Copy failed in content script' });
				} catch (err) {
					sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
				}
			} else {
				sendResponse({ success: false, error: 'No active tab' });
			}
		});
		return true;
	}

	return undefined;
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function initialize(): Promise<void> {
	await createContextMenu();
	await updateBadge();
	console.log('[Nugget] Background script initialized');
}

initialize().catch(err => console.error('[Nugget] Init failed:', err));
