import browser from './browser-polyfill';
import type { SnippetSettings } from '../types/types';

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

export async function setStagedSnippets(snippets: StagedSnippet[]): Promise<void> {
	await browser.storage.local.set({ [STAGED_SNIPPETS_KEY]: snippets });
}

export async function removeStagedSnippet(id: string): Promise<StagedSnippet[]> {
	const snippets = await getStagedSnippets();
	const updated = snippets.filter(snippet => snippet.id !== id);
	await setStagedSnippets(updated);
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

function replaceTemplateVariables(template: string, snippet: StagedSnippet, index: number, capturedAt: string): string {
	const values: Record<string, string> = {
		index: String(index + 1),
		title: snippet.title || snippet.url,
		url: snippet.url,
		capturedAt,
		markdown: snippet.markdown.trim(),
		text: snippet.text.trim(),
		html: snippet.html.trim()
	};

	return template.replace(/\{\{\s*(index|title|url|capturedAt|markdown|text|html)\s*\}\}/g, (_match, key: string) => values[key] || '');
}

function formatDetailedSnippet(snippet: StagedSnippet, index: number, settings?: SnippetSettings): string {
	const title = snippet.title || snippet.url;
	const parts = [
		`### Snippet ${index + 1}: [${title}](${snippet.url})`,
		''
	];

	if (settings?.includeCapturedAt ?? true) {
		parts.push(`> Captured: ${formatTimestamp(snippet.capturedAt)}`);
	}
	if (settings?.includeSource ?? true) {
		parts.push(`> Source: ${snippet.url}`);
	}
	if (parts[parts.length - 1] !== '') {
		parts.push('');
	}
	parts.push(snippet.markdown.trim());
	return parts.join('\n');
}

export function formatStagedSnippets(snippets: StagedSnippet[], settings?: SnippetSettings): string {
	const separator = settings?.separator ?? '\n\n---\n\n';
	return snippets.map((snippet, index) => {
		const title = snippet.title || snippet.url;
		const capturedAt = formatTimestamp(snippet.capturedAt);
		switch (settings?.format) {
			case 'compact':
				return [`### ${title}`, snippet.markdown.trim()].join('\n\n');
			case 'plain':
				return snippet.text.trim() || snippet.markdown.trim();
			case 'template':
				return replaceTemplateVariables(settings.template, snippet, index, capturedAt).trim();
			default:
				return formatDetailedSnippet(snippet, index, settings);
		}
	}).join(separator);
}
