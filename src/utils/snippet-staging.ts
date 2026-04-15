import browser from './browser-polyfill';

export interface StagedSnippet {
	id: string;
	markdown: string;
	html: string;
	text: string;
	url: string;
	title: string;
	capturedAt: string;
}

const STAGED_SNIPPETS_KEY = 'stagedSnippets';

export async function getStagedSnippets(): Promise<StagedSnippet[]> {
	const data = await browser.storage.local.get(STAGED_SNIPPETS_KEY) as Record<string, StagedSnippet[]>;
	return Array.isArray(data[STAGED_SNIPPETS_KEY]) ? data[STAGED_SNIPPETS_KEY] : [];
}

export async function addStagedSnippet(snippet: StagedSnippet): Promise<StagedSnippet[]> {
	const snippets = await getStagedSnippets();
	const updated = [...snippets, snippet];
	await browser.storage.local.set({ [STAGED_SNIPPETS_KEY]: updated });
	return updated;
}

export async function clearStagedSnippets(): Promise<void> {
	await browser.storage.local.remove(STAGED_SNIPPETS_KEY);
}

function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
}

export function formatStagedSnippets(snippets: StagedSnippet[]): string {
	return snippets.map((snippet, index) => {
		const title = snippet.title || snippet.url;
		const parts = [
			`### Snippet ${index + 1}: [${title}](${snippet.url})`,
			'',
			`> Captured: ${formatTimestamp(snippet.capturedAt)}`,
			`> Source: ${snippet.url}`,
			'',
			snippet.markdown.trim(),
		];
		return parts.join('\n');
	}).join('\n\n---\n\n');
}
