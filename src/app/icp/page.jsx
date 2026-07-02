import ICPPage from '@/routes/ICPPage';

export const metadata = {
  title: 'Is Surge Right For You?',
  description: 'Find out if Surge is the right fit for your home service business. We work best with operators doing $500K+ who are ready to build a real acquisition system.',
  alternates: { canonical: 'https://onboarding.thesurgeagency.com/icp' },
  openGraph: { url: 'https://onboarding.thesurgeagency.com/icp' },
};

export default function Page() {
  return <ICPPage />;
}
