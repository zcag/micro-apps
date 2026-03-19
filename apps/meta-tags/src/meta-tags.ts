export interface MetaTagData {
  // Basic
  title: string;
  description: string;
  keywords: string;
  author: string;
  canonicalUrl: string;
  faviconUrl: string;

  // Open Graph
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  ogType: string;
  ogSiteName: string;

  // Twitter Card
  twitterCard: 'summary' | 'summary_large_image';
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;

  // Robots
  robotsIndex: boolean;
  robotsFollow: boolean;

  // Viewport
  viewportWidth: string;
  viewportInitialScale: string;
  viewportUserScalable: boolean;

  // Charset
  charset: string;
}

export const DEFAULT_DATA: MetaTagData = {
  title: '',
  description: '',
  keywords: '',
  author: '',
  canonicalUrl: '',
  faviconUrl: '',

  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  ogUrl: '',
  ogType: 'website',
  ogSiteName: '',

  twitterCard: 'summary_large_image',
  twitterTitle: '',
  twitterDescription: '',
  twitterImage: '',

  robotsIndex: true,
  robotsFollow: true,

  viewportWidth: 'device-width',
  viewportInitialScale: '1.0',
  viewportUserScalable: true,

  charset: 'UTF-8',
};

export const OG_TYPES = [
  'website',
  'article',
  'book',
  'profile',
  'music.song',
  'music.album',
  'video.movie',
  'video.episode',
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateMetaTags(data: MetaTagData): string {
  const lines: string[] = [];

  // Charset
  if (data.charset) {
    lines.push(`<meta charset="${escapeHtml(data.charset)}" />`);
  }

  // Viewport
  const vpParts: string[] = [];
  if (data.viewportWidth) vpParts.push(`width=${data.viewportWidth}`);
  if (data.viewportInitialScale) vpParts.push(`initial-scale=${data.viewportInitialScale}`);
  if (!data.viewportUserScalable) vpParts.push('user-scalable=no');
  if (vpParts.length > 0) {
    lines.push(`<meta name="viewport" content="${vpParts.join(', ')}" />`);
  }

  // Basic meta
  if (data.title) {
    lines.push(`<title>${escapeHtml(data.title)}</title>`);
  }
  if (data.description) {
    lines.push(`<meta name="description" content="${escapeHtml(data.description)}" />`);
  }
  if (data.keywords) {
    lines.push(`<meta name="keywords" content="${escapeHtml(data.keywords)}" />`);
  }
  if (data.author) {
    lines.push(`<meta name="author" content="${escapeHtml(data.author)}" />`);
  }

  // Robots
  const robotsParts: string[] = [];
  robotsParts.push(data.robotsIndex ? 'index' : 'noindex');
  robotsParts.push(data.robotsFollow ? 'follow' : 'nofollow');
  lines.push(`<meta name="robots" content="${robotsParts.join(', ')}" />`);

  // Canonical
  if (data.canonicalUrl) {
    lines.push(`<link rel="canonical" href="${escapeHtml(data.canonicalUrl)}" />`);
  }

  // Favicon
  if (data.faviconUrl) {
    lines.push(`<link rel="icon" href="${escapeHtml(data.faviconUrl)}" />`);
  }

  // Open Graph
  const ogLines: string[] = [];
  if (data.ogTitle || data.title) {
    ogLines.push(`<meta property="og:title" content="${escapeHtml(data.ogTitle || data.title)}" />`);
  }
  if (data.ogDescription || data.description) {
    ogLines.push(`<meta property="og:description" content="${escapeHtml(data.ogDescription || data.description)}" />`);
  }
  if (data.ogImage) {
    ogLines.push(`<meta property="og:image" content="${escapeHtml(data.ogImage)}" />`);
  }
  if (data.ogUrl || data.canonicalUrl) {
    ogLines.push(`<meta property="og:url" content="${escapeHtml(data.ogUrl || data.canonicalUrl)}" />`);
  }
  if (data.ogType) {
    ogLines.push(`<meta property="og:type" content="${escapeHtml(data.ogType)}" />`);
  }
  if (data.ogSiteName) {
    ogLines.push(`<meta property="og:site_name" content="${escapeHtml(data.ogSiteName)}" />`);
  }

  if (ogLines.length > 0) {
    lines.push('');
    lines.push('<!-- Open Graph -->');
    lines.push(...ogLines);
  }

  // Twitter Card
  const twLines: string[] = [];
  twLines.push(`<meta name="twitter:card" content="${data.twitterCard}" />`);
  if (data.twitterTitle || data.ogTitle || data.title) {
    twLines.push(`<meta name="twitter:title" content="${escapeHtml(data.twitterTitle || data.ogTitle || data.title)}" />`);
  }
  if (data.twitterDescription || data.ogDescription || data.description) {
    twLines.push(`<meta name="twitter:description" content="${escapeHtml(data.twitterDescription || data.ogDescription || data.description)}" />`);
  }
  if (data.twitterImage || data.ogImage) {
    twLines.push(`<meta name="twitter:image" content="${escapeHtml(data.twitterImage || data.ogImage)}" />`);
  }

  if (twLines.length > 0) {
    lines.push('');
    lines.push('<!-- Twitter Card -->');
    lines.push(...twLines);
  }

  return lines.join('\n');
}

const STORAGE_KEY = 'meta-tags-data';

export function saveData(data: MetaTagData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadData(): MetaTagData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}
