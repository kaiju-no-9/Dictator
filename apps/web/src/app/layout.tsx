import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dictator — AI Video Editor',
  description: 'Upload raw footage → AI analyzes, splits, joins → human fine-tunes → export',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
