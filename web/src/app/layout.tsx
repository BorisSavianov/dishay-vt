import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/inter';
import './globals.css';

// Titles follow ?lang= in each page's generateMetadata. This is the fallback.
export const metadata: Metadata = {
  title: 'Велико Търново',
};

export const viewport: Viewport = {
  themeColor: '#f1f2fa',
  width: 'device-width',
  initialScale: 1,
};

// Runs before the first paint, so a saved dark theme never flashes light. Light is the default.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
