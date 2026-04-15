import { createMarkdownContent } from 'defuddle/full';
import browser from './utils/browser-polyfill';
import { NuggetSnippet } from './types/nugget';
import { detectPlatform } from './utils/platform-adapters';

interface CaptureError {
	success: false;
	error: string;
	sourceUrl: string;
}

function createId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function selectionRoot(range: Range): Element {
	const node = range.commonAncestorContainer;
	if (node.nodeType === Node.ELEMENT_NODE) {
		return node as Element;
	}
	return node.parentElement ?? document.body;
}

function htmlToMarkdown(html: string, sourceUrl: string, plainText: string): string {
	if (!html.trim()) return plainText.trim();

	try {
		return createMarkdownContent(html, sourceUrl).trim();
	} catch (error) {
		console.warn('[Nugget] Markdown conversion failed, using plain text fallback:', error);
		return plainText.trim();
	}
}

function captureSelection(): NuggetSnippet | CaptureError {
	const adapter = detectPlatform(window.location.href);
	if (!adapter) {
		return {
			success: false,
			error: 'Nugget supports ChatGPT, Claude, Gemini, and Perplexity in this version.',
			sourceUrl: window.location.href,
		};
	}

	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return {
			success: false,
			error: 'Select the text you want to capture first.',
			sourceUrl: window.location.href,
		};
	}

	const range = selection.getRangeAt(0);
	const wrapper = document.createElement('div');
	wrapper.appendChild(range.cloneContents());

	const html = wrapper.innerHTML;
	const plainText = selection.toString().trim();
	if (!plainText && !html.trim()) {
		return {
			success: false,
			error: 'The current selection is empty.',
			sourceUrl: window.location.href,
		};
	}

	const root = selectionRoot(range);
	const markdown = htmlToMarkdown(html, window.location.href, plainText);

	return {
		id: createId(),
		html,
		markdown,
		plainText,
		platform: adapter.name,
		sourceUrl: window.location.href,
		title: adapter.getTitle(document),
		capturedAt: new Date().toISOString(),
		speakerRole: adapter.getSpeakerRole(root),
		threadId: adapter.getThreadId(document),
		modelName: adapter.getModelName(document),
	};
}

async function copyTextToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.opacity = '0';
		document.body.appendChild(textArea);
		textArea.select();
		const success = document.execCommand('copy');
		textArea.remove();
		return success;
	}
}

browser.runtime.onMessage.addListener((
	message: unknown,
	_sender: browser.Runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined => {
	if (typeof message !== 'object' || message === null) return undefined;
	const request = message as { action?: string; text?: string };

	if (request.action === 'ping') {
		sendResponse({ ok: true });
		return true;
	}

	if (request.action === 'nugget_capture_selection') {
		sendResponse(captureSelection());
		return true;
	}

	if (request.action === 'nugget_get_page_info') {
		const adapter = detectPlatform(window.location.href);
		sendResponse({
			platform: adapter?.name ?? 'Unsupported',
			sourceUrl: window.location.href,
			title: adapter?.getTitle(document) ?? document.title,
			isSupported: Boolean(adapter),
		});
		return true;
	}

	if (request.action === 'copy-text-to-clipboard') {
		copyTextToClipboard(request.text ?? '')
			.then((success) => sendResponse({ success }))
			.catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
		return true;
	}

	return undefined;
});
