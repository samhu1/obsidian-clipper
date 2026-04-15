import { PlatformAdapter } from '../../types/nugget';

export const chatGPTAdapter: PlatformAdapter = {
  name: 'ChatGPT',

  matches(url: string): boolean {
    return url.includes('chatgpt.com');
  },

  getTitle(document: Document): string | undefined {
    try {
      // ChatGPT sets the document title to the conversation name once it loads.
      // Format: "<conversation name> | ChatGPT"
      const raw = document.title;
      if (raw) {
        const withoutSuffix = raw.replace(/\s*\|\s*ChatGPT\s*$/i, '').trim();
        if (withoutSuffix) return withoutSuffix;
      }

      // Fallback: conversation heading rendered in the sidebar / top of page
      // The main conversation title is often in a <h1> inside the sidebar nav.
      const h1 = document.querySelector('h1');
      if (h1?.textContent?.trim()) return h1.textContent.trim();

      return undefined;
    } catch {
      return undefined;
    }
  },

  getThreadId(document: Document): string | undefined {
    try {
      // ChatGPT conversation URLs look like:
      //   https://chatgpt.com/c/<uuid>
      const match = document.location?.pathname?.match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match?.[1] ?? undefined;
    } catch {
      return undefined;
    }
  },

  getSpeakerRole(element: Element): 'user' | 'assistant' | 'system' | 'unknown' {
    try {
      // ChatGPT marks each message turn with data-message-author-role on the
      // article element wrapping the message. Walk up to find it.
      let el: Element | null = element;
      while (el) {
        // data-message-author-role="user" | "assistant" | "tool"
        const role = el.getAttribute('data-message-author-role');
        if (role === 'user') return 'user';
        if (role === 'assistant') return 'assistant';
        if (role === 'tool' || role === 'system') return 'system';
        el = el.parentElement;
      }

      // Secondary check: look for an aria-label on an ancestor that names the author.
      // e.g. aria-label="ChatGPT said:" or aria-label="You said:"
      let el2: Element | null = element;
      while (el2) {
        const label = el2.getAttribute('aria-label') ?? '';
        if (/you said/i.test(label)) return 'user';
        if (/chatgpt said/i.test(label)) return 'assistant';
        el2 = el2.parentElement;
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  },

  getModelName(document: Document): string | undefined {
    try {
      // The active model is displayed in a button/select in the conversation header.
      // Selector targets the model-picker button that shows the current model name,
      // typically rendered as a <button> or <span> near the top of the chat panel.
      const modelButton = document.querySelector(
        '[data-testid="model-switcher-dropdown-button"],' +
        'button[class*="model-switcher"],' +
        // Fallback: any button whose text content looks like a GPT model name
        'header button'
      );
      const text = modelButton?.textContent?.trim();
      if (text && /gpt|o1|o3/i.test(text)) return text;

      return undefined;
    } catch {
      return undefined;
    }
  },
};
