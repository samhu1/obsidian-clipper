import { PlatformAdapter } from '../../types/nugget';

export const claudeAdapter: PlatformAdapter = {
  name: 'Claude',

  matches(url: string): boolean {
    return url.includes('claude.ai');
  },

  getTitle(document: Document): string | undefined {
    try {
      // claude.ai sets document.title to the conversation name.
      // Format: "<conversation name> - Claude" or just "<conversation name>"
      const raw = document.title;
      if (raw) {
        const withoutSuffix = raw.replace(/\s*[-–]\s*Claude\s*$/i, '').trim();
        if (withoutSuffix) return withoutSuffix;
      }

      // Fallback: the conversation title heading rendered in the left sidebar
      // or at the top of the chat. Claude renders this in a <h2> or <h1>.
      const heading =
        document.querySelector('h1') ??
        document.querySelector('h2');
      if (heading?.textContent?.trim()) return heading.textContent.trim();

      return undefined;
    } catch {
      return undefined;
    }
  },

  getThreadId(document: Document): string | undefined {
    try {
      // Claude conversation URLs look like:
      //   https://claude.ai/chat/<uuid>
      //   https://claude.ai/project/<uuid>/chat/<uuid>
      const match = document.location?.pathname?.match(
        /\/chat\/([a-zA-Z0-9_-]+)/
      );
      return match?.[1] ?? undefined;
    } catch {
      return undefined;
    }
  },

  getSpeakerRole(element: Element): 'user' | 'assistant' | 'system' | 'unknown' {
    try {
      // claude.ai wraps each turn in a div that carries data attributes or
      // class names distinguishing human vs assistant messages.
      let el: Element | null = element;
      while (el) {
        // data-is-streaming and data-message-author differentiate turns.
        // As of early 2025 claude.ai uses data-message-author="human" | "assistant".
        const author = el.getAttribute('data-message-author');
        if (author === 'human') return 'user';
        if (author === 'assistant') return 'assistant';

        // Alternative: class-based detection.
        // Human turns typically have a class containing "human-turn" or "user-message".
        // Assistant turns have "assistant-turn" or "ai-message".
        const cls = el.className ?? '';
        if (/human.?turn|user.?message|human-message/i.test(cls)) return 'user';
        if (/assistant.?turn|ai.?message|assistant-message/i.test(cls)) return 'assistant';

        el = el.parentElement;
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  },

  getModelName(document: Document): string | undefined {
    try {
      // Claude displays the active model name near the bottom of the composer
      // or in a model-selector button in the header.
      // Selector targets a button or span that shows the model name in the UI.
      const modelEl = document.querySelector(
        '[data-testid="model-selector-trigger"],' +
        'button[class*="model-selector"],' +
        // Fallback: any element whose text mentions "claude-" model names
        '[class*="model"] button,' +
        '[class*="model"] span'
      );
      const text = modelEl?.textContent?.trim();
      if (text && /claude/i.test(text)) return text;

      return undefined;
    } catch {
      return undefined;
    }
  },
};
