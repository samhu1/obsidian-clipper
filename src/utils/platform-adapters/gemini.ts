import { PlatformAdapter } from '../../types/nugget';

export const geminiAdapter: PlatformAdapter = {
  name: 'Gemini',

  matches(url: string): boolean {
    return url.includes('gemini.google.com');
  },

  getTitle(document: Document): string | undefined {
    try {
      // gemini.google.com sets document.title to the conversation name.
      // Format: "<conversation name> - Gemini" or "Gemini"
      const raw = document.title;
      if (raw) {
        const withoutSuffix = raw.replace(/\s*[-–]\s*Gemini\s*$/i, '').trim();
        if (withoutSuffix && !/^gemini$/i.test(withoutSuffix)) {
          return withoutSuffix;
        }
      }

      // Fallback: look for the conversation title in the sidebar or page heading.
      // Gemini renders the active conversation title in the left sidebar, typically
      // in an <h2> inside the active nav item, or in a header at the top of the chat.
      const heading =
        document.querySelector('.conversation-title') ??
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
      // Gemini conversation URLs look like:
      //   https://gemini.google.com/app/<threadId>
      const match = document.location?.pathname?.match(/\/app\/([a-zA-Z0-9_-]+)/);
      return match?.[1] ?? undefined;
    } catch {
      return undefined;
    }
  },

  getSpeakerRole(element: Element): 'user' | 'assistant' | 'system' | 'unknown' {
    try {
      // Gemini wraps each conversation turn in a custom element or div with
      // distinguishing classes or attributes for user vs model responses.
      let el: Element | null = element;
      while (el) {
        // data-turn-role or similar attribute used to mark turn ownership.
        const role = el.getAttribute('data-turn-role');
        if (role === 'user') return 'user';
        if (role === 'model' || role === 'assistant') return 'assistant';

        // Class-based detection: user turns have classes like "user-query" or "human-turn",
        // model responses have "model-response" or "ai-response".
        const cls = el.className ?? '';
        if (/user.?query|human.?turn|user-message/i.test(cls)) return 'user';
        if (/model.?response|ai.?response|assistant-message/i.test(cls)) return 'assistant';

        // Gemini uses custom elements — check tag names too.
        // <user-query> and <model-response> are plausible custom element names.
        const tag = el.tagName?.toLowerCase() ?? '';
        if (tag === 'user-query') return 'user';
        if (tag === 'model-response') return 'assistant';

        el = el.parentElement;
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  },

  getModelName(document: Document): string | undefined {
    try {
      // Gemini shows the active model (e.g. "Gemini 2.0 Flash") in a dropdown
      // selector in the top bar or within the chat composer area.
      // Selector targets the model-picker toggle button or its visible label.
      const modelEl = document.querySelector(
        '[data-test-id="model-selector"],' +
        '[aria-label*="Gemini"][role="button"],' +
        // Fallback: button or span inside a known model-picker container
        '.model-selector button,' +
        '.model-picker span'
      );
      const text = modelEl?.textContent?.trim();
      if (text && /gemini/i.test(text)) return text;

      return undefined;
    } catch {
      return undefined;
    }
  },
};
