import { describe, expect, test } from 'vitest';
import { formatBatch, formatSnippet } from './nugget-formatter';
import { NuggetSnippet } from '../types/nugget';

const snippet: NuggetSnippet = {
	id: 'snippet-1',
	html: '<pre><code>const value = 1;</code></pre>',
	markdown: '```ts\nconst value = 1;\n```',
	plainText: 'const value = 1;',
	platform: 'ChatGPT',
	sourceUrl: 'https://chatgpt.com/c/thread-1',
	title: 'Research thread',
	capturedAt: '2026-04-15T19:30:00.000Z',
	speakerRole: 'assistant',
	threadId: 'thread-1',
	modelName: 'GPT-5',
	tags: ['research', '#ai'],
};

describe('nugget formatter', () => {
	test('formats a snippet with visible source metadata and preserved markdown', () => {
		const output = formatSnippet(snippet);

		expect(output).toContain('### Nugget from ChatGPT');
		expect(output).toContain('> Source: [Research thread](https://chatgpt.com/c/thread-1)');
		expect(output).toContain('> Role: Assistant');
		expect(output).toContain('> Thread: thread-1');
		expect(output).toContain('> Model: GPT-5');
		expect(output).toContain('> Tags: #research #ai');
		expect(output).toContain('```ts\nconst value = 1;\n```');
	});

	test('formats batches as separate Obsidian-ready blocks', () => {
		const output = formatBatch({ snippets: [snippet, { ...snippet, id: 'snippet-2', platform: 'Claude' }] });

		expect(output.match(/### Nugget from/g)).toHaveLength(2);
		expect(output).toContain('### Nugget from Claude');
	});
});
