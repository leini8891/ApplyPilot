import type { Metadata } from 'next';
import { Space_Grotesk, Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const headingFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
});

const bodyFont = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'ApplyPilot',
  description: 'Local-first job-search cockpit with matching, prep assets, and application tracking',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
