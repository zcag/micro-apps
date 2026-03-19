import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, Card, Button, Input, SegmentedControl } from '@micro-apps/shared';
import { trackEvent } from '@micro-apps/shared';
import { usePaywall, PaywallPrompt, AdBanner } from '@micro-apps/shared';
import QRCode from 'qrcode';
import styles from './App.module.css';

type InputMode = 'url' | 'text' | 'wifi' | 'contact' | 'email';
type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
type EncryptionType = 'WPA' | 'WEP' | 'nopass';
type DownloadSize = 256 | 512 | 1024;

const MODE_OPTIONS: { label: string; value: InputMode }[] = [
  { label: 'URL', value: 'url' },
  { label: 'Text', value: 'text' },
  { label: 'WiFi', value: 'wifi' },
  { label: 'Contact', value: 'contact' },
  { label: 'Email', value: 'email' },
];

const EC_OPTIONS: { label: string; value: ErrorCorrectionLevel }[] = [
  { label: 'L (7%)', value: 'L' },
  { label: 'M (15%)', value: 'M' },
  { label: 'Q (25%)', value: 'Q' },
  { label: 'H (30%)', value: 'H' },
];

const ENCRYPTION_OPTIONS: { label: string; value: EncryptionType }[] = [
  { label: 'WPA/WPA2', value: 'WPA' },
  { label: 'WEP', value: 'WEP' },
  { label: 'None', value: 'nopass' },
];

function escapeWifi(str: string): string {
  return str.replace(/[\\;,":/]/g, (c) => '\\' + c);
}

function buildQRData(mode: InputMode, fields: Record<string, string>): string {
  switch (mode) {
    case 'url':
      return fields.url || '';
    case 'text':
      return fields.text || '';
    case 'wifi': {
      const ssid = escapeWifi(fields.ssid || '');
      const pass = escapeWifi(fields.wifiPassword || '');
      const enc = fields.encryption || 'WPA';
      const hidden = fields.hidden === 'true' ? 'H:true' : '';
      return `WIFI:T:${enc};S:${ssid};P:${pass};${hidden};`;
    }
    case 'contact': {
      const name = fields.contactName || '';
      const phone = fields.contactPhone || '';
      const email = fields.contactEmail || '';
      const org = fields.contactOrg || '';
      const parts = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (name) parts.push(`FN:${name}`);
      if (org) parts.push(`ORG:${org}`);
      if (phone) parts.push(`TEL:${phone}`);
      if (email) parts.push(`EMAIL:${email}`);
      parts.push('END:VCARD');
      return parts.join('\n');
    }
    case 'email': {
      const to = fields.emailTo || '';
      const subject = fields.emailSubject || '';
      const body = fields.emailBody || '';
      const params: string[] = [];
      if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
      if (body) params.push(`body=${encodeURIComponent(body)}`);
      return `mailto:${to}${params.length ? '?' + params.join('&') : ''}`;
    }
    default:
      return '';
  }
}

export default function App() {
  const [mode, setMode] = useState<InputMode>('url');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [ecLevel, setEcLevel] = useState<ErrorCorrectionLevel>('M');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [showQR, setShowQR] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [prevMode, setPrevMode] = useState<InputMode>('url');
  const [transitioning, setTransitioning] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { showPaywall, dismissPaywall } = usePaywall();

  const updateField = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleModeChange = useCallback((newMode: InputMode) => {
    setPrevMode(mode);
    setTransitioning(true);
    setTimeout(() => {
      setMode(newMode);
      setTransitioning(false);
    }, 150);
    trackEvent('qr_mode_change', { mode: newMode });
  }, [mode]);

  // Generate QR code with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const data = buildQRData(mode, fields);
      if (!data.trim()) {
        setShowQR(false);
        setQrDataUrl('');
        setQrSvg('');
        return;
      }

      try {
        const [dataUrl, svg] = await Promise.all([
          QRCode.toDataURL(data, {
            errorCorrectionLevel: ecLevel,
            color: { dark: fgColor, light: bgColor },
            width: 512,
            margin: 2,
          }),
          QRCode.toString(data, {
            errorCorrectionLevel: ecLevel,
            color: { dark: fgColor, light: bgColor },
            type: 'svg',
            margin: 2,
          }),
        ]);

        setQrDataUrl(dataUrl);
        setQrSvg(svg);
        setShowQR(true);
      } catch {
        setShowQR(false);
        setQrDataUrl('');
        setQrSvg('');
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, fields, ecLevel, fgColor, bgColor]);

  const downloadPNG = useCallback(async (size: DownloadSize) => {
    const data = buildQRData(mode, fields);
    if (!data.trim()) return;

    try {
      const dataUrl = await QRCode.toDataURL(data, {
        errorCorrectionLevel: ecLevel,
        color: { dark: fgColor, light: bgColor },
        width: size,
        margin: 2,
      });

      const link = document.createElement('a');
      link.download = `qr-code-${size}.png`;
      link.href = dataUrl;
      link.click();

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 1500);
      trackEvent('qr_download', { format: 'png', size: String(size) });
    } catch { /* ignore */ }
  }, [mode, fields, ecLevel, fgColor, bgColor]);

  const downloadSVG = useCallback(() => {
    if (!qrSvg) return;

    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'qr-code.svg';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 1500);
    trackEvent('qr_download', { format: 'svg' });
  }, [qrSvg]);

  return (
    <Layout title="QR Code Generator">
      <div className={styles.hero}>
        <p className={styles.subtitle}>Generate QR codes instantly — no signup required</p>
      </div>

      {/* Input Mode Selector */}
      <Card variant="glass" className={styles.modeCard}>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={handleModeChange}
        />
      </Card>

      {/* Input Fields */}
      <Card variant="glass" className={styles.inputCard}>
        <div className={`${styles.inputFields} ${transitioning ? styles.fadeOut : styles.fadeIn}`}>
          {mode === 'url' && (
            <div className={styles.fieldGroup}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>🔗</span>
                <span>URL</span>
              </div>
              <Input
                label="Website URL"
                type="url"
                placeholder="https://example.com"
                value={fields.url || ''}
                onChange={(e) => updateField('url', e.target.value)}
              />
            </div>
          )}

          {mode === 'text' && (
            <div className={styles.fieldGroup}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>📝</span>
                <span>Text</span>
              </div>
              <div className={styles.textareaWrapper}>
                <label className={styles.textareaLabel}>Your text</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Enter any text..."
                  rows={4}
                  value={fields.text || ''}
                  onChange={(e) => updateField('text', e.target.value)}
                />
              </div>
            </div>
          )}

          {mode === 'wifi' && (
            <div className={styles.fieldGroup}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>📶</span>
                <span>WiFi Network</span>
              </div>
              <Input
                label="Network Name (SSID)"
                placeholder="MyWiFiNetwork"
                value={fields.ssid || ''}
                onChange={(e) => updateField('ssid', e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                value={fields.wifiPassword || ''}
                onChange={(e) => updateField('wifiPassword', e.target.value)}
              />
              <div className={styles.encryptionSection}>
                <label className={styles.fieldLabel}>Encryption</label>
                <SegmentedControl
                  options={ENCRYPTION_OPTIONS}
                  value={(fields.encryption as EncryptionType) || 'WPA'}
                  onChange={(v) => updateField('encryption', v)}
                />
              </div>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={fields.hidden === 'true'}
                  onChange={(e) => updateField('hidden', e.target.checked ? 'true' : 'false')}
                  className={styles.checkbox}
                />
                Hidden network
              </label>
            </div>
          )}

          {mode === 'contact' && (
            <div className={styles.fieldGroup}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>👤</span>
                <span>Contact (vCard)</span>
              </div>
              <Input
                label="Full Name"
                placeholder="Jane Doe"
                value={fields.contactName || ''}
                onChange={(e) => updateField('contactName', e.target.value)}
              />
              <Input
                label="Phone"
                type="tel"
                placeholder="+1 555 123 4567"
                value={fields.contactPhone || ''}
                onChange={(e) => updateField('contactPhone', e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                placeholder="jane@example.com"
                value={fields.contactEmail || ''}
                onChange={(e) => updateField('contactEmail', e.target.value)}
              />
              <Input
                label="Organization"
                placeholder="Acme Inc."
                value={fields.contactOrg || ''}
                onChange={(e) => updateField('contactOrg', e.target.value)}
              />
            </div>
          )}

          {mode === 'email' && (
            <div className={styles.fieldGroup}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>✉️</span>
                <span>Email</span>
              </div>
              <Input
                label="To Address"
                type="email"
                placeholder="recipient@example.com"
                value={fields.emailTo || ''}
                onChange={(e) => updateField('emailTo', e.target.value)}
              />
              <Input
                label="Subject"
                placeholder="Hello!"
                value={fields.emailSubject || ''}
                onChange={(e) => updateField('emailSubject', e.target.value)}
              />
              <div className={styles.textareaWrapper}>
                <label className={styles.textareaLabel}>Body</label>
                <textarea
                  className={styles.textarea}
                  placeholder="Email body..."
                  rows={3}
                  value={fields.emailBody || ''}
                  onChange={(e) => updateField('emailBody', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Customization */}
      <Card variant="glass" className={styles.customizeCard}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🎨</span>
          <span>Customize</span>
        </div>
        <div className={styles.customizeGrid}>
          <div className={styles.colorPicker}>
            <label className={styles.colorLabel}>Foreground</label>
            <div className={styles.colorInputWrapper}>
              <input
                type="color"
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
                className={styles.colorInput}
              />
              <span className={styles.colorValue}>{fgColor}</span>
            </div>
          </div>
          <div className={styles.colorPicker}>
            <label className={styles.colorLabel}>Background</label>
            <div className={styles.colorInputWrapper}>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className={styles.colorInput}
              />
              <span className={styles.colorValue}>{bgColor}</span>
            </div>
          </div>
        </div>
        <div className={styles.ecSection}>
          <label className={styles.fieldLabel}>Error Correction</label>
          <SegmentedControl
            options={EC_OPTIONS}
            value={ecLevel}
            onChange={(v) => {
              setEcLevel(v);
              trackEvent('qr_ec_change', { level: v });
            }}
          />
        </div>
      </Card>

      {/* QR Preview */}
      <div className={styles.previewSection}>
        {showQR && qrDataUrl ? (
          <div className={styles.qrWrapper}>
            <Card variant="glass" className={styles.qrCard}>
              <img
                src={qrDataUrl}
                alt="Generated QR Code"
                className={styles.qrImage}
              />
            </Card>

            {/* Download Buttons */}
            <div className={styles.downloadSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>📥</span>
                <span>Download</span>
              </div>
              <div className={styles.downloadGrid}>
                <Button
                  variant="gradient"
                  onClick={() => downloadPNG(256)}
                  style={{ flex: 1 }}
                >
                  PNG 256px
                </Button>
                <Button
                  variant="gradient"
                  onClick={() => downloadPNG(512)}
                  style={{ flex: 1 }}
                >
                  PNG 512px
                </Button>
                <Button
                  variant="gradient"
                  onClick={() => downloadPNG(1024)}
                  style={{ flex: 1 }}
                >
                  PNG 1024px
                </Button>
              </div>
              <Button
                variant="shimmer"
                onClick={downloadSVG}
                className={`${styles.svgButton} ${downloadSuccess ? styles.downloadSuccess : ''}`}
              >
                {downloadSuccess ? '✓ Downloaded!' : 'Download SVG (Vector)'}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📱</div>
            <p className={styles.emptyText}>Enter content above to generate a QR code</p>
          </div>
        )}
      </div>

      <AdBanner position="inline" />
      {showPaywall && <PaywallPrompt onDismiss={dismissPaywall} />}
    </Layout>
  );
}
