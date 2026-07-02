import './globals.css';
import { Bebas_Neue, Manrope } from 'next/font/google';

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-display' });
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

export const metadata = {
  title: 'Surge Onboarding',
  description: 'Client onboarding and intake for The Surge Agency.',
  icons: { icon: 'https://thesurgeagency.com/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
