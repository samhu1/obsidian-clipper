import { PlatformAdapter } from '../../types/nugget';

export const perplexityAdapter: PlatformAdapter = {
  name: 'Perplexity',

  matches(url: string): boolean {
    return url.includes('perplexity.ai');
  },

  getTitle(document: Document): string | undefined {
    try {
      // Perplexity sets document.title to the query/conversation name.
      // Format: "<query> - Perplexity" or "<query> | Perplexity"
      const raw = document.title;
      if (raw) {
        const withoutSuffix = raw
          .replace(/\s*[-–|]\s*Perplexity\s*$/i, '')
          .trim();
        if (withoutSuffix && !/^perplexity$/i.test(withoutSuffix)) {
          return withoutSuffix;
        }
      }

      // Fallback: look for the query heading rendered at the top of the answer page.
      // Perplexity renders the original query in a large heading above the answer.
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
      // Perplexity search/answer URLs look like:
      //   https://www.perplexity.ai/search/<slug>-<uuid>
      //   https://www.perplexity.ai/page/<slug>
      // Extract the last path segment as the thread identifier.
      const pathname = document.location?.pathname ?? '';
      const match = pathname.match(/\/(?:search|page)\/([^/]+)$/);
      return match?.[1] ?? undefined;
    } catch {
      return undefined;
    }
  },

  getSpeakerRole(element: Element): 'user' | 'assistant' | 'system' | 'unknown' {
    try {
      // Perplexity pages are primarily answer-driven (one query → one answer),
      // but follow-up threads exist. The DOM distinguishes user queries from
      // AI answers via class names or container structure.
      let el: Element | null = element;
      while (el) {
        // data-* attributes used to tag turn ownership, if present.
        const role = el.getAttribute('data-turn-role') ?? el.getAttribute('data-author');
        if (role === 'user' || role === 'human') return 'user';
        if (role === 'assistant' || role === 'ai') return 'assistant';

        // Class-based detection: user queries are often inside a "query" or "question"
        // container, while answers sit inside an "answer" or "result" container.
        const cls = el.className ?? '';
        if (/\bquery\b|\bquestion\b|\buser-input\b/i.test(cls)) return 'user';
        if (/\banswer\b|\bresult\b|\bai-response\b|\bperplexity-answer\b/i.test(cls)) return 'assistant';

        el = el.parentElement;
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  },

  getModelName(document: Document): string | undefined {
    try {
      // Perplexity shows the active model (e.g. "Claude 3.5 Sonnet", "GPT-4o",
      // "Sonar") in a model selector near the query composer.
      // Selector targets the model-selector dropdown toggle or its visible label.
      const modelEl = document.querySelector(
        '[data-testid="model-selector"],' +
        'button[class*="model-selector"],' +
        // Fallback: any button/span inside a model-picker container that names the model
        '[class*="model"] button,' +
        '[class*="model"] span,' +
        // Perplexity's focus/pro/default model pill shown above the answer
        '[class*="focus"] button'
      );
      const text = modelEl?.textContent?.trim();
      if (text) return text;

      return undefined;
    } catch {
      return undefined;
    }
  },
};
