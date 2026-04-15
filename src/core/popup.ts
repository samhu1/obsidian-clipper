import browser from '../utils/browser-polyfill';
import { NuggetDestination, NuggetSnippet } from '../types/nugget';

interface StagedResponse {
	snippets: NuggetSnippet[];
	count: number;
}

interface ActionResponse {
	success: boolean;
	count?: number;
	error?: string;
}

const statusEl = () => document.getElementById('nugget-status') as HTMLElement | null;
const countEl = () => document.getElementById('snippet-count') as HTMLElement | null;
const listEl = () => document.getElementById('snippet-list') as HTMLElement | null;
const vaultInput = () => document.getElementById('destination-vault') as HTMLInputElement | null;
const pathInput = () => document.getElementById('destination-path') as HTMLInputElement | null;
const behaviorSelect = () => document.getElementById('destination-behavior') as HTMLSelectElement | null;

let stagedSnippets: NuggetSnippet[] = [];

function setStatus(message: string, isError = false): void {
	const el = statusEl();
	if (!el) return;
	el.textContent = message;
	el.classList.toggle('is-error', isError);
}

function getDestination(): NuggetDestination {
	return {
		vault: vaultInput()?.value.trim() ?? '',
		path: pathInput()?.value.trim() || 'Nuggets/Inbox',
		behavior: behaviorSelect()?.value === 'create' ? 'create' : 'append',
	};
}

function renderSnippets(): void {
	const count = countEl();
	if (count) {
		count.textContent = `${stagedSnippets.length} snippet${stagedSnippets.length === 1 ? '' : 's'} collected`;
	}

	const list = listEl();
	if (!list) return;
	list.textContent = '';

	if (stagedSnippets.length === 0) {
		const empty = document.createElement('li');
		empty.className = 'snippet-empty';
		empty.textContent = 'Select text in a supported AI conversation, then capture it.';
		list.appendChild(empty);
		return;
	}

	stagedSnippets.forEach((snippet, index) => {
		const item = document.createElement('li');
		item.className = 'snippet-item';

		const header = document.createElement('div');
		header.className = 'snippet-item-header';
		header.textContent = `${index + 1}. ${snippet.platform}${snippet.title ? ` - ${snippet.title}` : ''}`;

		const preview = document.createElement('p');
		preview.textContent = snippet.plainText.replace(/\s+/g, ' ').trim().slice(0, 180);

		item.appendChild(header);
		item.appendChild(preview);
		list.appendChild(item);
	});
}

async function loadStaged(): Promise<void> {
	const response = await browser.runtime.sendMessage({ action: 'nugget_get_staged' }) as StagedResponse;
	stagedSnippets = response.snippets ?? [];
	renderSnippets();
}

async function loadLastDestination(): Promise<void> {
	const data = await browser.storage.local.get('nugget_last_destination') as { nugget_last_destination?: NuggetDestination };
	const dest = data.nugget_last_destination;
	if (!dest) return;

	if (vaultInput()) vaultInput()!.value = dest.vault ?? '';
	if (pathInput()) pathInput()!.value = dest.path ?? '';
	if (behaviorSelect()) behaviorSelect()!.value = dest.behavior ?? 'append';
}

async function getActiveTabId(): Promise<number | undefined> {
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	return tabs[0]?.id;
}

async function captureSelection(): Promise<void> {
	const tabId = await getActiveTabId();
	if (!tabId) {
		setStatus('No active tab found.', true);
		return;
	}

	setStatus('Capturing selection...');
	const response = await browser.tabs.sendMessage(tabId, { action: 'nugget_capture_selection' }) as NuggetSnippet | { success: false; error: string };

	if (!response || ('success' in response && response.success === false)) {
		setStatus(response?.error || 'No supported selection found.', true);
		return;
	}

	const added = await browser.runtime.sendMessage({
		action: 'nugget_add_to_batch',
		snippet: response,
	}) as ActionResponse;

	if (!added.success) {
		setStatus(added.error || 'Capture failed.', true);
		return;
	}

	await loadStaged();
	setStatus('Snippet captured.');
}

async function exportSnippets(): Promise<void> {
	if (stagedSnippets.length === 0) {
		setStatus('Capture at least one snippet first.', true);
		return;
	}

	const destination = getDestination();
	setStatus('Sending to Obsidian...');
	const response = await browser.runtime.sendMessage({
		action: 'nugget_export',
		snippets: stagedSnippets,
		destination,
	}) as ActionResponse;

	if (!response.success) {
		setStatus(response.error || 'Export failed. Your staged snippets are still here.', true);
		return;
	}

	stagedSnippets = [];
	renderSnippets();
	setStatus('Sent to Obsidian.');
}

async function clearSnippets(): Promise<void> {
	const response = await browser.runtime.sendMessage({ action: 'nugget_clear_staged' }) as ActionResponse;
	if (!response.success) {
		setStatus(response.error || 'Could not clear snippets.', true);
		return;
	}
	stagedSnippets = [];
	renderSnippets();
	setStatus('Staging cleared.');
}

document.addEventListener('DOMContentLoaded', async () => {
	document.getElementById('capture-selection')?.addEventListener('click', () => {
		captureSelection().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
	});
	document.getElementById('export-snippets')?.addEventListener('click', () => {
		exportSnippets().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
	});
	document.getElementById('clear-snippets')?.addEventListener('click', () => {
		clearSnippets().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
	});

	await loadLastDestination();
	await loadStaged();
	setStatus('');
});
