import { NuggetSnippet, SnippetBatch, NuggetSettings } from '../types/nugget';

type MetadataField = NuggetSettings['metadataFields'][number];

const DIVIDER = '---';

/**
 * Format an ISO 8601 timestamp as "YYYY-MM-DD HH:mm" in local time.
 */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  } catch {
    return iso;
  }
}

/**
 * Capitalise the first letter of a string.
 */
function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Determine whether a given metadata field should be included in output.
 * If `metadataFields` is not provided, all fields are included by default.
 */
function fieldEnabled(
  field: MetadataField,
  metadataFields: MetadataField[] | undefined
): boolean {
  if (!metadataFields) return true;
  return metadataFields.includes(field);
}

/**
 * Format a single NuggetSnippet into a Markdown block.
 *
 * The block structure is:
 * ```
 * ---
 *
 * ### Nugget from {platform}
 *
 * > Source: [{title}]({sourceUrl})
 * > Captured: {YYYY-MM-DD HH:mm}
 * > Role: {speakerRole}        (only when present and enabled)
 * > Tags: #tag1 #tag2          (only when present and enabled)
 *
 * {markdown content}
 * ```
 *
 * Lines whose corresponding metadataField is absent from `settings.metadataFields`
 * are omitted. Pass no settings (or an empty object) to include everything.
 */
export function formatSnippet(
  snippet: NuggetSnippet,
  settings?: Partial<NuggetSettings>
): string {
  const fields = settings?.metadataFields;

  const lines: string[] = [];

  lines.push(DIVIDER);
  lines.push('');

  // Platform heading — always shown (it is the section title, not a metadata field)
  const platformLabel = fieldEnabled('platform', fields)
    ? snippet.platform
    : 'AI Platform';
  lines.push(`### Nugget from ${platformLabel}`);
  lines.push('');

  // Metadata block
  const metaLines: string[] = [];

  if (fieldEnabled('sourceUrl', fields)) {
    const label = fieldEnabled('title', fields) && snippet.title
      ? snippet.title
      : snippet.sourceUrl;
    metaLines.push(`> Source: [${label}](${snippet.sourceUrl})`);
  } else if (fieldEnabled('title', fields) && snippet.title) {
    metaLines.push(`> Title: ${snippet.title}`);
  }

  if (fieldEnabled('timestamp', fields)) {
    metaLines.push(`> Captured: ${formatTimestamp(snippet.capturedAt)}`);
  }

  if (fieldEnabled('role', fields) && snippet.speakerRole) {
    metaLines.push(`> Role: ${capitalise(snippet.speakerRole)}`);
  }

  if (fieldEnabled('threadId', fields) && snippet.threadId) {
    metaLines.push(`> Thread: ${snippet.threadId}`);
  }

  if (fieldEnabled('modelName', fields) && snippet.modelName) {
    metaLines.push(`> Model: ${snippet.modelName}`);
  }

  if (snippet.tags && snippet.tags.length > 0) {
    const tagStr = snippet.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    metaLines.push(`> Tags: ${tagStr}`);
  }

  if (metaLines.length > 0) {
    lines.push(...metaLines);
    lines.push('');
  }

  // Snippet body
  lines.push(snippet.markdown);

  return lines.join('\n');
}

/**
 * Format all snippets in a SnippetBatch, joining each block with the divider
 * separator. The result is ready to be appended to an Obsidian note.
 */
export function formatBatch(
  batch: SnippetBatch,
  settings?: Partial<NuggetSettings>
): string {
  if (batch.snippets.length === 0) return '';

  return batch.snippets
    .map((snippet) => formatSnippet(snippet, settings))
    .join('\n\n');
}
