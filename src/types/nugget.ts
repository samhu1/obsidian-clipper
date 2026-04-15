export interface NuggetSnippet {
  id: string;
  html: string;
  markdown: string;
  plainText: string;
  platform: string;
  sourceUrl: string;
  title?: string;
  capturedAt: string; // ISO 8601
  speakerRole?: 'user' | 'assistant' | 'system' | 'unknown';
  threadId?: string;
  modelName?: string;
  tags?: string[];
}

export interface SnippetBatch {
  snippets: NuggetSnippet[];
  destination?: NuggetDestination;
}

export interface NuggetDestination {
  vault: string;
  path: string;
  behavior: 'append' | 'create';
}

export interface NuggetSettings {
  vault: string;
  defaultPath: string;
  defaultTags: string[];
  metadataFields: ('platform' | 'sourceUrl' | 'timestamp' | 'title' | 'role' | 'threadId' | 'modelName')[];
  recentDestinations: NuggetDestination[];
}

export interface PlatformAdapter {
  name: string;
  matches: (url: string) => boolean;
  getTitle: (document: Document) => string | undefined;
  getThreadId: (document: Document) => string | undefined;
  getSpeakerRole: (element: Element) => 'user' | 'assistant' | 'system' | 'unknown';
  getModelName: (document: Document) => string | undefined;
}
