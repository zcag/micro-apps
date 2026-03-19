// Styles (auto-imported by all apps)
import './animations.css';
import './components/components.css';

// Theme
export { ThemeProvider, useTheme } from './theme';
export { lightTheme, darkTheme } from './theme';
export type { ThemeMode, ThemeTokens } from './theme';

// Components
export { Layout } from './components';
export { Card } from './components';
export { Button } from './components';
export { Input } from './components';
export { ResultDisplay } from './components';
export { SegmentedControl } from './components';

// Ads
export { AdBanner } from './ads/AdBanner';

// Paywall
export { PaywallPrompt } from './paywall/PaywallPrompt';
export { usePaywall } from './paywall/usePaywall';

// Analytics
export { initAnalytics, trackEvent } from './analytics/analytics';
