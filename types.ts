
export interface GuestPostRequest {
  id: string;
  keyword: string;
  hostNiche: string;
  targetLink: string;
  anchorText: string;
  targetNiche: string;
}

export interface SeoTopic {
  topic: string;
  tag: string;
}

export interface SeoArticleRequest {
  id: string;
  keyword: string; // Used as the main Title/Tab Name
  topics: SeoTopic[];
}

export interface GeneratedArticle {
  id: string;
  requestId: string;
  title: string;
  content: string; // Markdown content
  createdAt: Date;
  status: 'pending' | 'completed' | 'failed';
  driveUrl?: string; // Real Google Drive WebViewLink
  driveId?: string;
}

export enum AppMode {
  SINGLE = 'SINGLE',
  HISTORY = 'HISTORY',
  SETTINGS = 'SETTINGS',
  WORDPRESS = 'WORDPRESS',
  BULK_PUBLISH = 'BULK_PUBLISH',
  SEO_ARTICLE = 'SEO_ARTICLE'
}

export interface QueueItem {
  id: string;
  type?: 'guest_post' | 'seo_article';
  request: any; // Can be GuestPostRequest or SeoArticleRequest
  rowIndex: number; // Para atualizar a planilha depois (usado no Guest Post)
  sheetId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  tabName?: string; // Nome da aba (usado no SEO Article)
}

export interface BatchProgress {
  isActive: boolean;
  total: number;
  processed: number;
  currentKeyword: string;
  logs: string[];
}

export interface WordpressSite {
    id: string;
    name: string;
    url: string;
    username: string;
    appPassword: string;
}

export interface WordpressCategory {
    id: number;
    count: number;
    description: string;
    link: string;
    name: string;
    slug: string;
    taxonomy: string;
    parent: number;
}

export interface BulkPostDraft {
    id: string;
    sheetRowIndex: number;
    
    // Imported Data
    keyword: string;
    originalDocUrl: string;
    siteUrlFromSheet: string;
    
    // Content Data (Fetched from Doc)
    title: string;
    content: string;
    
    // Config Data
    matchedSiteId: string | ''; // ID of WordpressSite
    slug: string;
    metaDesc: string;
    image: File | null;
    imagePreview: string;
    categoryId: number | '';

    // Status
    status: 'idle' | 'loading_doc' | 'ready' | 'publishing' | 'success' | 'error';
    errorMsg?: string;
    publishedLink?: string;
}