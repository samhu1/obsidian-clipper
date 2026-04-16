import browser from './utils/browser-polyfill';
import * as highlighter from './utils/highlighter';
import { loadSettings, generalSettings } from './utils/storage-utils';
import { getDomain } from './utils/string-utils';
import { extractContentBySelector as extractContentBySelectorShared } from './utils/shared';
import Defuddle from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { flattenShadowDom } from './utils/flatten-shadow-dom';
import { saveFile } from './utils/file-utils';
import { debugLog } from './utils/debug';
import { updateSidebarWidth, addResizeHandle, cleanupResizeHandlers } from './utils/iframe-resize';
import { parseForClip } from './utils/clip-utils';
import type { StagedSnippet } from './utils/snippet-staging';

declare global {
	interface Window {
		obsidianClipperGeneration?: number;
	}
}

// IIFE to scope variables and allow safe re-execution
(function() {
	// Bump the generation counter on every injection. Older listeners close
	// over their own generation value and bail out when they see a newer one,
	// so a zombie content script (runtime invalidated after extension update)
	// will silently yield to the freshly-injected instance.
	window.obsidianClipperGeneration = (window.obsidianClipperGeneration ?? 0) + 1;
	const myGeneration = window.obsidianClipperGeneration;

	debugLog('Clipper', 'Initializing content script, generation', myGeneration);

	let isHighlighterMode = false;
	const iframeId = 'obsidian-clipper-iframe';
	const containerId = 'obsidian-clipper-container';

	function buildSnippet(html: string, text: string, url = document.URL, title = document.title || document.URL, id?: string): StagedSnippet | null {
		if (!html.trim() && !text) {
			return null;
		}

		let markdown = text;
		try {
			markdown = createMarkdownContent(html || text, url).trim();
		} catch (error) {
			console.warn('[Obsidian Clipper] Failed to convert staged selection to Markdown:', error);
		}

		return {
			id: id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			markdown,
			html,
			text,
			url,
			title,
			capturedAt: new Date().toISOString(),
		};
	}

	function captureSelectionSnippet() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			return { success: false, error: 'No text selected' };
		}

		const range = selection.getRangeAt(0);
		const div = document.createElement('div');
		div.appendChild(range.cloneContents());
		const html = div.innerHTML;
		const text = selection.toString().trim();
		const snippet = buildSnippet(html, text);

		if (!snippet) {
			return { success: false, error: 'No text selected' };
		}

		return {
			success: true,
			snippet,
		};
	}

	async function stageSnippet(snippet: StagedSnippet): Promise<void> {
		const response = await browser.runtime.sendMessage({ action: 'stageSnippet', snippet }) as { success?: boolean; error?: string };
		if (!response?.success) {
			throw new Error(response?.error || 'Failed to stage snippet');
		}
	}

	async function removeSnippetFromStaging(id: string): Promise<void> {
		const response = await browser.runtime.sendMessage({ action: 'removeStagedSnippet', id }) as { success?: boolean; error?: string };
		if (!response?.success) {
			throw new Error(response?.error || 'Failed to remove staged snippet');
		}
	}

	window.addEventListener('obsidian-clipper-stage-snippet', (event) => {
		if (window.obsidianClipperGeneration !== myGeneration) return;
		const detail = (event as CustomEvent<{ html?: string; text?: string; url?: string; title?: string; stagedSnippetId?: string }>).detail;
		const snippet = buildSnippet(
			detail?.html || '',
			(detail?.text || '').trim(),
			detail?.url || document.URL,
			detail?.title || document.title || document.URL,
			detail?.stagedSnippetId
		);
		if (!snippet) return;
		stageSnippet(snippet).catch(error => {
			console.error('[Obsidian Clipper] Failed to stage snippet:', error);
		});
	});

	window.addEventListener('obsidian-clipper-remove-staged-snippet', (event) => {
		if (window.obsidianClipperGeneration !== myGeneration) return;
		const detail = (event as CustomEvent<{ stagedSnippetId?: string }>).detail;
		if (!detail?.stagedSnippetId) return;
		removeSnippetFromStaging(detail.stagedSnippetId).catch(error => {
			console.error('[Obsidian Clipper] Failed to remove staged snippet:', error);
		});
	});

	let selectionStageButton: HTMLButtonElement | null = null;

	function hideSelectionStageButton(): void {
		selectionStageButton?.remove();
		selectionStageButton = null;
	}

	function getSelectionSnippet(): StagedSnippet | null {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

		const range = selection.getRangeAt(0);
		const div = document.createElement('div');
		div.appendChild(range.cloneContents());
		return buildSnippet(div.innerHTML, selection.toString().trim());
	}

	function showSelectionStageButton(): void {
		if (isHighlighterMode) {
			hideSelectionStageButton();
			return;
		}

		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			hideSelectionStageButton();
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		if (!rect.width && !rect.height) {
			hideSelectionStageButton();
			return;
		}

		if (!selectionStageButton) {
			selectionStageButton = document.createElement('button');
			selectionStageButton.type = 'button';
			selectionStageButton.textContent = 'Add to staging';
			Object.assign(selectionStageButton.style, {
				position: 'fixed',
				zIndex: '2147483647',
				border: '1px solid rgba(0, 0, 0, 0.18)',
				borderRadius: '8px',
				background: '#1f1f1f',
				color: '#ffffff',
				font: '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
				padding: '6px 10px',
				boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
				cursor: 'pointer',
			});
			selectionStageButton.addEventListener('mousedown', event => event.preventDefault());
			selectionStageButton.addEventListener('click', async (event) => {
				event.preventDefault();
				event.stopPropagation();
				const snippet = getSelectionSnippet();
				if (!snippet) {
					hideSelectionStageButton();
					return;
				}
				try {
					await stageSnippet(snippet);
					window.getSelection()?.removeAllRanges();
					hideSelectionStageButton();
				} catch (error) {
					console.error('[Obsidian Clipper] Failed to stage selection:', error);
				}
			});
			document.body.appendChild(selectionStageButton);
		}

		const top = Math.max(8, rect.top - selectionStageButton.offsetHeight - 8);
		const left = Math.min(
			window.innerWidth - selectionStageButton.offsetWidth - 8,
			Math.max(8, rect.left + rect.width / 2 - selectionStageButton.offsetWidth / 2)
		);
		selectionStageButton.style.top = `${top}px`;
		selectionStageButton.style.left = `${left}px`;
	}

	document.addEventListener('mouseup', () => {
		setTimeout(showSelectionStageButton, 0);
	});
	document.addEventListener('keyup', () => {
		setTimeout(showSelectionStageButton, 0);
	});
	document.addEventListener('mousedown', (event) => {
		if (selectionStageButton && event.target !== selectionStageButton) {
			hideSelectionStageButton();
		}
	});

	function removeContainer(container: HTMLElement) {
		container.classList.add('is-closing');
		updateSidebarWidth(document, null);
		cleanupResizeHandlers(document);
		container.addEventListener('animationend', () => {
			container.remove();
			highlighter.repositionHighlights();
		}, { once: true });
	}

	async function toggleIframe() {
		const existingContainer = document.getElementById(containerId);
		if (existingContainer) {
			removeContainer(existingContainer);
			return;
		}

		await ensureHighlighterCSS();

		const container = document.createElement('div');
		container.id = containerId;
		container.classList.add('is-open');

		const { clipperIframeWidth, clipperIframeHeight } = await browser.storage.local.get(['clipperIframeWidth', 'clipperIframeHeight']);
		if (clipperIframeWidth) {
			container.style.width = `${clipperIframeWidth}px`;
		}
		if (clipperIframeHeight) {
			container.style.height = `${clipperIframeHeight}px`;
		}

		const iframe = document.createElement('iframe');
		iframe.id = iframeId;
		iframe.src = browser.runtime.getURL('side-panel.html?context=iframe');
		container.appendChild(iframe);

		const resizeCallbacks = {
			onResize: () => highlighter.repositionHighlights(),
			onResizeEnd: () => highlighter.repositionHighlights(),
		};
		addResizeHandle(document, container, 'w', resizeCallbacks);
		addResizeHandle(document, container, 's', resizeCallbacks);
		addResizeHandle(document, container, 'sw', resizeCallbacks);

		document.body.appendChild(container);
		updateSidebarWidth(document, container);
		container.addEventListener('animationend', () => highlighter.repositionHighlights(), { once: true });
	}

	// Firefox
	browser.runtime.sendMessage({ action: "contentScriptLoaded" });

	interface ContentResponse {
		content: string;
		selectedHtml: string;
		extractedContent: { [key: string]: string };
		schemaOrgData: any;
		fullHtml: string;
		highlights: string[];
		title: string;
		description: string;
		domain: string;
		favicon: string;
		image: string;
		parseTime: number;
		published: string;
		author: string;
		site: string;
		wordCount: number;
		language: string;
		metaTags: { name?: string | null; property?: string | null; content: string | null }[];
	}

	browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
		// If a newer generation of this content script has been injected,
		// yield to it rather than responding from a potentially stale context.
		if (window.obsidianClipperGeneration !== myGeneration) {
			return;
		}

		if (request.action === "ping") {
			sendResponse({});
			return true;
		}

		if (request.action === "toggle-iframe") {
			toggleIframe().then(() => {
				sendResponse({ success: true });
			});
			return true;
		}

		if (request.action === "close-iframe") {
			const existingContainer = document.getElementById(containerId);
			if (existingContainer) {
				removeContainer(existingContainer);
			}
			return;
		}

		if (request.action === "copy-text-to-clipboard") {
			const textArea = document.createElement("textarea");
			textArea.value = request.text;
			document.body.appendChild(textArea);
			textArea.select();
			try {
				document.execCommand('copy');
				sendResponse({success: true});
			} catch (err) {
				sendResponse({success: false});
			}
			document.body.removeChild(textArea);
			return true;
		}

		if (request.action === "copyMarkdownToClipboard") {
			flattenShadowDom(document).then(() => {
				try {
					const defuddled = parseForClip(document);

					// Convert HTML content to markdown
					const markdown = createMarkdownContent(defuddled.content, document.URL);

					// Copy to clipboard
					const textArea = document.createElement("textarea");
					textArea.value = markdown;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand('copy');
					document.body.removeChild(textArea);

					sendResponse({ success: true });
				} catch (err) {
					console.error('Failed to copy markdown to clipboard:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			});
			return true;
		}

		if (request.action === "saveMarkdownToFile") {
			flattenShadowDom(document).then(async () => {
				try {
					const defuddled = parseForClip(document);
					const markdown = createMarkdownContent(defuddled.content, document.URL);
					const title = defuddled.title || document.title || 'Untitled';
					const fileName = title.replace(/[/\\?%*:|"<>]/g, '-');
					await saveFile({
						content: markdown,
						fileName,
						mimeType: 'text/markdown',
					});
					sendResponse({ success: true });
				} catch (err) {
					console.error('Failed to save markdown file:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			});
			return true;
		}

		if (request.action === "getPageContent") {
			// Flatten shadow DOM before extraction (async, needs main world)
			const flattenTimeout = new Promise<void>(resolve => setTimeout(resolve, 3000));
			Promise.race([flattenShadowDom(document), flattenTimeout]).then(async () => {
				let selectedHtml = '';
				const selection = window.getSelection();

				if (selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					const clonedSelection = range.cloneContents();
					const div = document.createElement('div');
					div.appendChild(clonedSelection);
					selectedHtml = div.innerHTML;
				}

				// Use parseAsync to ensure async variables like {{transcript}} are available.
				// If it hangs (e.g. another extension has corrupted fetch), fall back to sync parse.
				const defuddle = new Defuddle(document, { url: document.URL });
				const parseTimeout = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('parseAsync timeout')), 8000)
				);
				const defuddled = await Promise.race([defuddle.parseAsync(), parseTimeout])
					.catch(() => defuddle.parse());
				const extractedContent: { [key: string]: string } = {
					...defuddled.variables,
				};

				// Create a new DOMParser
				const parser = new DOMParser();
				// Parse the document's HTML
				const doc = parser.parseFromString(document.documentElement.outerHTML, 'text/html');

				// Remove all script and style elements
				doc.querySelectorAll('script, style').forEach(el => el.remove());

				// Remove style attributes from all elements
				doc.querySelectorAll('*').forEach(el => el.removeAttribute('style'));

				// Convert all relative URLs to absolute
				doc.querySelectorAll('[src], [href]').forEach(element => {
					['src', 'href', 'srcset'].forEach(attr => {
						const value = element.getAttribute(attr);
						if (!value) return;

						if (attr === 'srcset') {
							const newSrcset = value.split(',').map(src => {
								const [url, size] = src.trim().split(' ');
								try {
									const absoluteUrl = new URL(url, document.baseURI).href;
									return `${absoluteUrl}${size ? ' ' + size : ''}`;
								} catch (e) {
									return src;
								}
							}).join(', ');
							element.setAttribute(attr, newSrcset);
						} else if (!value.startsWith('http') && !value.startsWith('data:') && !value.startsWith('#') && !value.startsWith('//')) {
							try {
								const absoluteUrl = new URL(value, document.baseURI).href;
								element.setAttribute(attr, absoluteUrl);
							} catch (e) {
								console.warn(`Failed to process ${attr} URL:`, value);
							}
						}
					});
				});

				// Get the modified HTML without scripts, styles, and style attributes
				const cleanedHtml = doc.documentElement.outerHTML;

				const response: ContentResponse = {
					author: defuddled.author,
					content: defuddled.content,
					description: defuddled.description,
					domain: getDomain(document.URL),
					extractedContent: extractedContent,
					favicon: defuddled.favicon,
					fullHtml: cleanedHtml,
					highlights: highlighter.getHighlights(),
					image: defuddled.image,
					language: defuddled.language || '',
					parseTime: defuddled.parseTime,
					published: defuddled.published,
					schemaOrgData: defuddled.schemaOrgData,
					selectedHtml: selectedHtml,
					site: defuddled.site,
					title: defuddled.title,
					wordCount: defuddled.wordCount,
					metaTags: defuddled.metaTags || []
				};
				if (defuddled.title) {
					highlighter.setPageTitle(defuddled.title);
				}
				highlighter.updatePageDomainSettings({ site: defuddled.site, favicon: defuddled.favicon });
				sendResponse(response);
			}).catch((error: unknown) => {
				console.error('[Obsidian Clipper] getPageContent error:', error);
				sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
			});
			return true;
		} else if (request.action === "captureSelectionSnippet") {
			sendResponse(captureSelectionSnippet());
			return true;
		} else if (request.action === "syncStagedHighlights") {
			const stagedSnippetIds = Array.isArray(request.stagedSnippetIds) ? request.stagedSnippetIds : [];
			highlighter.retainStagedHighlights(stagedSnippetIds);
			sendResponse({ success: true });
			return true;
		} else if (request.action === "extractContent") {
			const content = extractContentBySelector(request.selector, request.attribute, request.extractHtml);
			sendResponse({ content: content });
		} else if (request.action === "paintHighlights") {
			ensureHighlighterCSS().then(() => highlighter.loadHighlights()).then(() => {
				if (generalSettings.alwaysShowHighlights) {
					highlighter.applyHighlights();
				}
				sendResponse({ success: true });
			});
			return true;
		} else if (request.action === "setHighlighterMode") {
			isHighlighterMode = request.isActive;
			hideSelectionStageButton();
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(isHighlighterMode);
			updateHasHighlights();
			sendResponse({ success: true });
			return true;
		} else if (request.action === "getHighlighterMode") {
			browser.runtime.sendMessage({ action: "getHighlighterMode" }).then(sendResponse);
			return true;
		} else if (request.action === "toggleHighlighter") {
			isHighlighterMode = request.isActive;
			hideSelectionStageButton();
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(request.isActive);
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightSelection") {
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(request.isActive);
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				highlighter.handleTextSelection(selection);
			}
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightElement") {
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(request.isActive);
			if (request.targetElementInfo) {
				const { mediaType, srcUrl, pageUrl } = request.targetElementInfo;
				
				let elementToHighlight: Element | null = null;

				// Function to compare URLs, handling both absolute and relative paths
				const urlMatches = (elementSrc: string, targetSrc: string) => {
					const elementUrl = new URL(elementSrc, pageUrl);
					const targetUrl = new URL(targetSrc, pageUrl);
					return elementUrl.href === targetUrl.href;
				};

				// Try to find the element using the src attribute
				elementToHighlight = document.querySelector(`${mediaType}[src="${srcUrl}"]`);

				// If not found, try with relative URL
				if (!elementToHighlight) {
					const relativeSrc = new URL(srcUrl).pathname;
					elementToHighlight = document.querySelector(`${mediaType}[src="${relativeSrc}"]`);
				}

				// If still not found, iterate through all elements of the media type
				if (!elementToHighlight) {
					const elements = Array.from(document.getElementsByTagName(mediaType));
					for (const el of elements) {
						if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
							if (urlMatches(el.src, srcUrl)) {
								elementToHighlight = el;
								break;
							}
						}
					}
				}

				if (elementToHighlight) {
					const xpath = highlighter.getElementXPath(elementToHighlight);
					highlighter.highlightElement(elementToHighlight);
				} else {
					console.warn('Could not find element to highlight. Info:', request.targetElementInfo);
				}
			}
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "clearHighlights") {
			highlighter.clearHighlights();
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "getHighlighterState") {
			browser.runtime.sendMessage({ action: "getHighlighterMode" })
				.then(response => {
					sendResponse(response);
				})
				.catch(error => {
					console.error("Error getting highlighter mode:", error);
					sendResponse({ isActive: false });
				});
			return true;
		} else if (request.action === "getReaderModeState") {
			sendResponse({ isActive: document.documentElement.classList.contains('obsidian-reader-active') });
			return true;
		}
		return true;
	});

	function extractContentBySelector(selector: string, attribute?: string, extractHtml: boolean = false): string | string[] {
		return extractContentBySelectorShared(document, selector, attribute, extractHtml);
	}

	function updateHasHighlights() {
		const hasHighlights = highlighter.getHighlights().length > 0;
		browser.runtime.sendMessage({ action: "updateHasHighlights", hasHighlights });
	}

	let highlighterCSSPromise: Promise<void> | null = null;
	function ensureHighlighterCSS(): Promise<void> {
		if (!highlighterCSSPromise) {
			highlighterCSSPromise = new Promise<void>((resolve) => {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = browser.runtime.getURL('highlighter.css');
				link.onload = () => resolve();
				link.onerror = () => resolve();
				(document.head || document.documentElement).appendChild(link);
			});
		}
		return highlighterCSSPromise;
	}

	async function initializeHighlighter() {
		await loadSettings();

		if (generalSettings.alwaysShowHighlights) {
			const result = await browser.storage.local.get('highlights');
			const allHighlights = (result.highlights || {}) as Record<string, unknown>;
			if (allHighlights[window.location.href]) {
				await ensureHighlighterCSS();
			}
		}

		await highlighter.loadHighlights();
		highlighter.setPageTitle(document.title);
		updateHasHighlights();
	}

	// Initialize highlighter
	initializeHighlighter();

	// Call updateHasHighlights when the page loads
	window.addEventListener('load', updateHasHighlights);

	// Deactivate highlighter mode on unload
	function handlePageUnload() {
		if (isHighlighterMode) {
			highlighter.toggleHighlighterMenu(false);
			browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: false });
			browser.storage.local.set({ isHighlighterMode: false });
		}
	}

	window.addEventListener('beforeunload', handlePageUnload);

	// Listen for custom events from the reader script
	document.addEventListener('obsidian-reader-init', async () => {
		// Find the highlighter button
		const button = document.querySelector('[data-action="toggle-highlighter"]');
		if (button) {
			// Handle highlighter button clicks
			button.addEventListener('click', async (e) => {
				try {
					// First try to get the tab ID from the background script
					const response = await browser.runtime.sendMessage({ action: "ensureContentScriptLoaded" });
					
					let tabId: number | undefined;
					if (response && typeof response === 'object') {
						tabId = (response as { tabId: number }).tabId;
					}

					// If we didn't get a tab ID, try to get it from the background script
					if (!tabId) {
						try {
							const response = await browser.runtime.sendMessage({ action: "getActiveTab" }) as { tabId?: number; error?: string };
							if (response && !response.error && response.tabId) {
								tabId = response.tabId;
							}
						} catch (error) {
							console.error('[Content] Failed to get tab ID from background script:', error);
						}
					}

					if (tabId) {
						await browser.runtime.sendMessage({ action: "toggleHighlighterMode", tabId });
					} else {
						console.error('[Content]','Could not determine tab ID');
					}
				} catch (error) {
					console.error('[Content]','Error in toggle flow:', error);
				}
			});
		}
	});

})();
