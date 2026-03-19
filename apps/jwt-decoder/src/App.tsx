import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Layout, Card, Button, trackEvent } from '@micro-apps/shared';
import styles from './App.module.css';

const LS_KEY = 'jwt-decoder-token';

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjIsImlzcyI6Im1pY3JvLWFwcHMiLCJhdWQiOiJodHRwczovL2V4YW1wbGUuY29tIiwianRpIjoiYWJjMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const ALGORITHM_INFO: Record<string, string> = {
  HS256: 'HMAC using SHA-256 — symmetric key signing',
  HS384: 'HMAC using SHA-384 — symmetric key signing',
  HS512: 'HMAC using SHA-512 — symmetric key signing',
  RS256: 'RSA PKCS#1 using SHA-256 — asymmetric key signing',
  RS384: 'RSA PKCS#1 using SHA-384 — asymmetric key signing',
  RS512: 'RSA PKCS#1 using SHA-512 — asymmetric key signing',
  ES256: 'ECDSA using P-256 and SHA-256 — elliptic curve signing',
  ES384: 'ECDSA using P-384 and SHA-384 — elliptic curve signing',
  ES512: 'ECDSA using P-521 and SHA-512 — elliptic curve signing',
  PS256: 'RSA PSS using SHA-256 — probabilistic signing',
  PS384: 'RSA PSS using SHA-384 — probabilistic signing',
  PS512: 'RSA PSS using SHA-512 — probabilistic signing',
  EdDSA: 'Edwards-curve DSA — Ed25519/Ed448 signing',
  none: 'No digital signature — unsigned token',
};

const STANDARD_CLAIMS: Record<string, { label: string; icon: string }> = {
  iss: { label: 'Issuer', icon: '🏢' },
  sub: { label: 'Subject', icon: '👤' },
  aud: { label: 'Audience', icon: '🎯' },
  exp: { label: 'Expiration', icon: '⏰' },
  nbf: { label: 'Not Before', icon: '🚫' },
  iat: { label: 'Issued At', icon: '📅' },
  jti: { label: 'JWT ID', icon: '🆔' },
};

interface DecodedJWT {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

interface DecodeError {
  message: string;
  section?: 'header' | 'payload' | 'structure';
}

function base64UrlDecode(str: string): string {
  // Replace base64url chars with base64 standard chars
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with = to make it valid base64
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  else if (pad === 1) throw new Error('Invalid base64url string');
  return atob(base64);
}

function tryDecodeJWT(token: string): { decoded: DecodedJWT | null; error: DecodeError | null } {
  const trimmed = token.trim();
  if (!trimmed) return { decoded: null, error: null };

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return {
      decoded: null,
      error: {
        message: `Invalid JWT structure: expected 3 parts separated by dots, got ${parts.length}`,
        section: 'structure',
      },
    };
  }

  let header: Record<string, unknown>;
  try {
    const headerJson = base64UrlDecode(parts[0]);
    header = JSON.parse(headerJson);
  } catch {
    return {
      decoded: null,
      error: { message: 'Failed to decode header — invalid base64url or JSON', section: 'header' },
    };
  }

  let payload: Record<string, unknown>;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    payload = JSON.parse(payloadJson);
  } catch {
    return {
      decoded: null,
      error: { message: 'Failed to decode payload — invalid base64url or JSON', section: 'payload' },
    };
  }

  return {
    decoded: { header, payload, signature: parts[2] },
    error: null,
  };
}

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return 'Invalid timestamp';
  }
}

function getExpiryInfo(exp: number): { expired: boolean; text: string } {
  const now = Math.floor(Date.now() / 1000);
  const diff = exp - now;
  const absDiff = Math.abs(diff);

  const days = Math.floor(absDiff / 86400);
  const hours = Math.floor((absDiff % 86400) / 3600);
  const minutes = Math.floor((absDiff % 3600) / 60);

  let text = '';
  if (days > 0) text += `${days}d `;
  if (hours > 0) text += `${hours}h `;
  text += `${minutes}m`;

  if (diff > 0) {
    return { expired: false, text: `Expires in ${text.trim()}` };
  } else {
    return { expired: true, text: `Expired ${text.trim()} ago` };
  }
}

function highlightJSON(json: string, colorClass: string): string {
  return json
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, `<span class="${colorClass}">$1</span>:`)
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, `: <span class="${styles.jsonString}">$1</span>`)
    .replace(/:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, `: <span class="${styles.jsonNumber}">$1</span>`)
    .replace(/:\s*(true|false)/g, `: <span class="${styles.jsonBoolean}">$1</span>`)
    .replace(/:\s*(null)/g, `: <span class="${styles.jsonNull}">$1</span>`);
}

export default function App() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) || '';
    } catch {
      return '';
    }
  });
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const analyticsRef = useRef(false);

  // Persist token
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, token);
    } catch {}
  }, [token]);

  const { decoded, error } = useMemo(() => tryDecodeJWT(token), [token]);
  const isEmpty = !token.trim();

  // Analytics
  if (decoded && !analyticsRef.current) {
    trackEvent('jwt_decoded', { alg: String(decoded.header.alg || 'unknown') });
    analyticsRef.current = true;
  }
  if (isEmpty) analyticsRef.current = false;

  const expiryInfo = useMemo(() => {
    if (!decoded?.payload.exp || typeof decoded.payload.exp !== 'number') return null;
    return getExpiryInfo(decoded.payload.exp);
  }, [decoded]);

  const algorithm = decoded?.header.alg as string | undefined;
  const algorithmDesc = algorithm ? ALGORITHM_INFO[algorithm] || 'Unknown algorithm' : null;

  const handleCopy = useCallback(
    (section: string, data: unknown) => {
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        setCopiedSection(section);
        setTimeout(() => setCopiedSection(null), 1500);
      }).catch(() => {});
    },
    []
  );

  const handleClear = useCallback(() => {
    setToken('');
  }, []);

  const handleSample = useCallback(() => {
    setToken(SAMPLE_JWT);
  }, []);

  // Color-coded token parts
  const tokenParts = useMemo(() => {
    if (!token.trim()) return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    return parts;
  }, [token]);

  const headerHighlighted = useMemo(() => {
    if (!decoded) return '';
    return highlightJSON(JSON.stringify(decoded.header, null, 2), styles.headerKey);
  }, [decoded]);

  const payloadHighlighted = useMemo(() => {
    if (!decoded) return '';
    return highlightJSON(JSON.stringify(decoded.payload, null, 2), styles.payloadKey);
  }, [decoded]);

  return (
    <Layout title="JWT Decoder">
      <div className={styles.container}>
        {/* Input */}
        <div className={styles.inputSection}>
          <Card>
            <div className={styles.inputHeader}>
              <div className={styles.inputTitle}>
                <span className={styles.inputTitleIcon}>JWT</span>
                <span>Token Input</span>
              </div>
              <div className={styles.actionGroup}>
                <button className={styles.actionBtn} onClick={handleSample} type="button">
                  Sample
                </button>
                <button className={styles.actionBtn} onClick={handleClear} type="button" disabled={isEmpty}>
                  Clear
                </button>
              </div>
            </div>

            {/* Color-coded token display */}
            {tokenParts && !error ? (
              <div className={styles.colorToken}>
                <span className={styles.tokenHeader}>{tokenParts[0]}</span>
                <span className={styles.tokenDot}>.</span>
                <span className={styles.tokenPayload}>{tokenParts[1]}</span>
                <span className={styles.tokenDot}>.</span>
                <span className={styles.tokenSignature}>{tokenParts[2]}</span>
              </div>
            ) : null}

            <textarea
              className={`${styles.textarea} ${error ? styles.textareaError : decoded ? styles.textareaValid : ''}`}
              placeholder="Paste your JWT token here..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
              rows={4}
            />

            {/* Validation */}
            {!isEmpty && (
              <div
                className={`${styles.validationBar} ${error ? styles.validationError : styles.validationSuccess}`}
              >
                <span className={styles.validationIcon}>{error ? '✕' : '✓'}</span>
                <span className={styles.validationText}>
                  {error ? error.message : 'Valid JWT structure'}
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Algorithm badge */}
        {decoded && algorithm && (
          <div className={styles.algBadge}>
            <span className={styles.algName}>{algorithm}</span>
            <span className={styles.algDesc}>{algorithmDesc}</span>
          </div>
        )}

        {/* Expiry badge */}
        {expiryInfo && (
          <div className={`${styles.expiryBadge} ${expiryInfo.expired ? styles.expiryExpired : styles.expiryValid}`}>
            <span className={styles.expiryIcon}>{expiryInfo.expired ? '✕' : '✓'}</span>
            <span className={styles.expiryText}>{expiryInfo.text}</span>
          </div>
        )}

        {/* Three panel layout */}
        {decoded && (
          <div className={styles.panels}>
            {/* Header panel */}
            <div className={styles.panel}>
              <Card>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span className={`${styles.panelDot} ${styles.panelDotHeader}`} />
                    <span>Header</span>
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedSection === 'header' ? styles.copyBtnSuccess : ''}`}
                    onClick={() => handleCopy('header', decoded.header)}
                    type="button"
                  >
                    {copiedSection === 'header' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre
                  className={styles.jsonOutput}
                  dangerouslySetInnerHTML={{ __html: headerHighlighted }}
                />
              </Card>
            </div>

            {/* Payload panel */}
            <div className={styles.panel}>
              <Card>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span className={`${styles.panelDot} ${styles.panelDotPayload}`} />
                    <span>Payload</span>
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedSection === 'payload' ? styles.copyBtnSuccess : ''}`}
                    onClick={() => handleCopy('payload', decoded.payload)}
                    type="button"
                  >
                    {copiedSection === 'payload' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <pre
                  className={styles.jsonOutput}
                  dangerouslySetInnerHTML={{ __html: payloadHighlighted }}
                />
              </Card>
            </div>

            {/* Signature panel */}
            <div className={styles.panel}>
              <Card>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>
                    <span className={`${styles.panelDot} ${styles.panelDotSignature}`} />
                    <span>Signature</span>
                  </div>
                  <button
                    className={`${styles.copyBtn} ${copiedSection === 'signature' ? styles.copyBtnSuccess : ''}`}
                    onClick={() => handleCopy('signature', decoded.signature)}
                    type="button"
                  >
                    {copiedSection === 'signature' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <div className={styles.signatureContent}>
                  <code className={styles.signatureCode}>{decoded.signature}</code>
                  <div className={styles.signatureNote}>
                    Signature verification requires the secret key and is not performed client-side.
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Claims table */}
        {decoded && Object.keys(decoded.payload).length > 0 && (
          <div className={styles.claimsSection}>
            <Card>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                  <span className={styles.inputTitleIcon}>📋</span>
                  <span>Claims</span>
                </div>
              </div>
              <div className={styles.claimsTable}>
                {Object.entries(decoded.payload).map(([key, value]) => {
                  const standardClaim = STANDARD_CLAIMS[key];
                  const isTimestamp =
                    (key === 'exp' || key === 'iat' || key === 'nbf') &&
                    typeof value === 'number';

                  return (
                    <div key={key} className={styles.claimRow}>
                      <div className={styles.claimKey}>
                        {standardClaim && (
                          <span className={styles.claimIcon}>{standardClaim.icon}</span>
                        )}
                        <span className={styles.claimName}>{key}</span>
                        {standardClaim && (
                          <span className={styles.claimLabel}>{standardClaim.label}</span>
                        )}
                      </div>
                      <div className={styles.claimValue}>
                        <span className={styles.claimRaw}>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                        {isTimestamp && (
                          <span className={styles.claimTimestamp}>
                            {formatTimestamp(value as number)}
                          </span>
                        )}
                        {key === 'exp' && expiryInfo && (
                          <span
                            className={`${styles.claimExpiry} ${
                              expiryInfo.expired ? styles.claimExpiryExpired : styles.claimExpiryValid
                            }`}
                          >
                            {expiryInfo.expired ? 'EXPIRED' : 'VALID'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <Card>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🔐</div>
              <div className={styles.emptyStateText}>Paste a JWT token to decode and inspect</div>
              <div className={styles.emptyStateHint}>
                header, payload, claims & expiration analysis
              </div>
              <Button variant="gradient" onClick={handleSample} haptic style={{ marginTop: 16 }}>
                Try Sample Token
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
