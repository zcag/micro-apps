import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout, Card, Button, SegmentedControl, trackEvent } from '@micro-apps/shared';
import {
  MetaTagData,
  DEFAULT_DATA,
  OG_TYPES,
  generateMetaTags,
  saveData,
  loadData,
} from './meta-tags';
import styles from './App.module.css';

type Tab = 'basic' | 'og' | 'twitter' | 'advanced';

const TABS = [
  { value: 'basic', label: 'Basic' },
  { value: 'og', label: 'Open Graph' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'advanced', label: 'Advanced' },
];

export default function App() {
  const [data, setData] = useState<MetaTagData>(() => loadData() || DEFAULT_DATA);
  const [activeTab, setActiveTab] = useState<Tab>('basic');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const update = useCallback(<K extends keyof MetaTagData>(key: K, value: MetaTagData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const generatedHtml = useMemo(() => generateMetaTags(data), [data]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    trackEvent('meta_tags_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [generatedHtml]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meta-tags.html';
    a.click();
    URL.revokeObjectURL(url);
    trackEvent('meta_tags_download');
  }, [generatedHtml]);

  const handleReset = useCallback(() => {
    setData(DEFAULT_DATA);
    trackEvent('meta_tags_reset');
  }, []);

  // Derived preview values (fallbacks)
  const previewTitle = data.title || 'Page Title';
  const previewDescription = data.description || 'Page description will appear here. Add a meta description to see the preview.';
  const previewUrl = data.canonicalUrl || 'https://example.com';

  const ogPreviewTitle = data.ogTitle || data.title || 'Page Title';
  const ogPreviewDescription = data.ogDescription || data.description || 'Page description';
  const ogPreviewSiteName = data.ogSiteName || new URL(previewUrl).hostname || 'example.com';

  const twPreviewTitle = data.twitterTitle || data.ogTitle || data.title || 'Page Title';
  const twPreviewDescription = data.twitterDescription || data.ogDescription || data.description || 'Page description';

  const titleLen = data.title.length;
  const descLen = data.description.length;

  return (
    <Layout title="Meta Tag Generator">
      <div className={styles.container}>
        {/* Tab Selector */}
        <SegmentedControl
          options={TABS}
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
        />

        {/* Basic Tab */}
        {activeTab === 'basic' && (
          <Card>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Basic Meta Tags</span>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Page Title
                  {titleLen > 0 && (
                    <span className={titleLen > 60 ? styles.charWarning : styles.charCount}>
                      {titleLen}/60
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="My Awesome Page"
                  value={data.title}
                  onChange={(e) => update('title', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Description
                  {descLen > 0 && (
                    <span className={descLen > 160 ? styles.charWarning : styles.charCount}>
                      {descLen}/160
                    </span>
                  )}
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder="A brief description of your page for search engines..."
                  value={data.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Keywords</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="seo, meta tags, generator"
                  value={data.keywords}
                  onChange={(e) => update('keywords', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Author</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="John Doe"
                  value={data.author}
                  onChange={(e) => update('author', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Canonical URL</label>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="https://example.com/page"
                  value={data.canonicalUrl}
                  onChange={(e) => update('canonicalUrl', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Favicon URL</label>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="https://example.com/favicon.ico"
                  value={data.faviconUrl}
                  onChange={(e) => update('faviconUrl', e.target.value)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Open Graph Tab */}
        {activeTab === 'og' && (
          <Card>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Open Graph Tags</span>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:title</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={data.title || 'Falls back to page title'}
                  value={data.ogTitle}
                  onChange={(e) => update('ogTitle', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:description</label>
                <textarea
                  className={styles.textarea}
                  placeholder={data.description || 'Falls back to meta description'}
                  value={data.ogDescription}
                  onChange={(e) => update('ogDescription', e.target.value)}
                  rows={3}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:image</label>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="https://example.com/og-image.jpg"
                  value={data.ogImage}
                  onChange={(e) => update('ogImage', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:url</label>
                <input
                  type="url"
                  className={styles.input}
                  placeholder={data.canonicalUrl || 'Falls back to canonical URL'}
                  value={data.ogUrl}
                  onChange={(e) => update('ogUrl', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:type</label>
                <select
                  className={styles.select}
                  value={data.ogType}
                  onChange={(e) => update('ogType', e.target.value)}
                >
                  {OG_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>og:site_name</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="My Website"
                  value={data.ogSiteName}
                  onChange={(e) => update('ogSiteName', e.target.value)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Twitter Tab */}
        {activeTab === 'twitter' && (
          <Card>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Twitter Card Tags</span>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Card Type</label>
                <select
                  className={styles.select}
                  value={data.twitterCard}
                  onChange={(e) => update('twitterCard', e.target.value as 'summary' | 'summary_large_image')}
                >
                  <option value="summary">Summary</option>
                  <option value="summary_large_image">Summary Large Image</option>
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>twitter:title</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={data.ogTitle || data.title || 'Falls back to og:title or page title'}
                  value={data.twitterTitle}
                  onChange={(e) => update('twitterTitle', e.target.value)}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>twitter:description</label>
                <textarea
                  className={styles.textarea}
                  placeholder={data.ogDescription || data.description || 'Falls back to og:description'}
                  value={data.twitterDescription}
                  onChange={(e) => update('twitterDescription', e.target.value)}
                  rows={3}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>twitter:image</label>
                <input
                  type="url"
                  className={styles.input}
                  placeholder={data.ogImage || 'Falls back to og:image'}
                  value={data.twitterImage}
                  onChange={(e) => update('twitterImage', e.target.value)}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Advanced Tab */}
        {activeTab === 'advanced' && (
          <Card>
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Advanced Settings</span>

              <div className={styles.subsection}>
                <span className={styles.subsectionLabel}>Robots</span>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Index</span>
                  <button
                    className={`${styles.toggleBtn} ${data.robotsIndex ? styles.toggleActive : ''}`}
                    onClick={() => update('robotsIndex', !data.robotsIndex)}
                  >
                    {data.robotsIndex ? 'index' : 'noindex'}
                  </button>
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Follow</span>
                  <button
                    className={`${styles.toggleBtn} ${data.robotsFollow ? styles.toggleActive : ''}`}
                    onClick={() => update('robotsFollow', !data.robotsFollow)}
                  >
                    {data.robotsFollow ? 'follow' : 'nofollow'}
                  </button>
                </div>
              </div>

              <div className={styles.subsection}>
                <span className={styles.subsectionLabel}>Viewport</span>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Width</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={data.viewportWidth}
                    onChange={(e) => update('viewportWidth', e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Initial Scale</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={data.viewportInitialScale}
                    onChange={(e) => update('viewportInitialScale', e.target.value)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>User Scalable</span>
                  <button
                    className={`${styles.toggleBtn} ${data.viewportUserScalable ? styles.toggleActive : ''}`}
                    onClick={() => update('viewportUserScalable', !data.viewportUserScalable)}
                  >
                    {data.viewportUserScalable ? 'YES' : 'NO'}
                  </button>
                </div>
              </div>

              <div className={styles.subsection}>
                <span className={styles.subsectionLabel}>Charset</span>
                <div className={styles.fieldGroup}>
                  <select
                    className={styles.select}
                    value={data.charset}
                    onChange={(e) => update('charset', e.target.value)}
                  >
                    <option value="UTF-8">UTF-8</option>
                    <option value="ISO-8859-1">ISO-8859-1</option>
                    <option value="ASCII">ASCII</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Preview Cards */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Search & Social Previews</span>

            {/* Google Preview */}
            <div className={styles.previewCard}>
              <span className={styles.previewLabel}>Google Search</span>
              <div className={styles.googlePreview}>
                <div className={styles.googleUrl}>{previewUrl}</div>
                <div className={styles.googleTitle}>{previewTitle}</div>
                <div className={styles.googleDesc}>{previewDescription}</div>
              </div>
            </div>

            {/* Twitter Preview */}
            <div className={styles.previewCard}>
              <span className={styles.previewLabel}>Twitter Card</span>
              <div className={styles.twitterPreview}>
                {(data.twitterImage || data.ogImage) && data.twitterCard === 'summary_large_image' && (
                  <div className={styles.twitterImageLarge}>
                    <img
                      src={data.twitterImage || data.ogImage}
                      alt="Twitter preview"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className={styles.twitterContent}>
                  {(data.twitterImage || data.ogImage) && data.twitterCard === 'summary' && (
                    <div className={styles.twitterImageSmall}>
                      <img
                        src={data.twitterImage || data.ogImage}
                        alt="Twitter preview"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className={styles.twitterText}>
                    <div className={styles.twitterDomain}>{(() => { try { return new URL(previewUrl).hostname; } catch { return 'example.com'; } })()}</div>
                    <div className={styles.twitterTitle}>{twPreviewTitle}</div>
                    <div className={styles.twitterDesc}>{twPreviewDescription}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Facebook/OG Preview */}
            <div className={styles.previewCard}>
              <span className={styles.previewLabel}>Facebook / Open Graph</span>
              <div className={styles.fbPreview}>
                {(data.ogImage) && (
                  <div className={styles.fbImage}>
                    <img
                      src={data.ogImage}
                      alt="OG preview"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className={styles.fbContent}>
                  <div className={styles.fbDomain}>{ogPreviewSiteName}</div>
                  <div className={styles.fbTitle}>{ogPreviewTitle}</div>
                  <div className={styles.fbDesc}>{ogPreviewDescription}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Generated Code */}
        <Card variant="glass">
          <div className={styles.codeSection}>
            <span className={styles.sectionLabel}>Generated HTML</span>
            <div className={styles.codeBlock}>
              <code className={styles.code}>{generatedHtml}</code>
            </div>
            <div className={styles.codeActions}>
              <Button variant="gradient" onClick={handleCopy} haptic style={{ flex: 1 }}>
                {copied ? '✓ Copied!' : 'Copy All Tags'}
              </Button>
              <Button variant="secondary" onClick={handleDownload} haptic>
                Download HTML
              </Button>
              <Button variant="secondary" onClick={handleReset} haptic>
                Reset
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
