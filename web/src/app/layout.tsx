import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import './globals.css';
import { DUSK_BG, THEME_SCRIPT } from '@/lib/theme';

// Titles follow ?lang= in each page's generateMetadata. This is the fallback.
export const metadata: Metadata = {
  title: 'Велико Търново',
};

export const viewport: Viewport = {
  themeColor: DUSK_BG,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
