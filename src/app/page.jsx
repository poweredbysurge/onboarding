export const metadata = {
  title: 'Surge Onboarding',
};

export default function Home() {
  return (
    <main className="bg-surge-bg min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <span className="font-body text-xs tracking-[0.35em] uppercase text-surge-green">
        The Surge Agency
      </span>
      <h1 className="font-display text-5xl sm:text-6xl text-white mt-3 tracking-wide">
        Onboarding
      </h1>
      <p className="font-body text-base text-white/50 mt-4 max-w-md leading-relaxed">
        This is the Surge onboarding workspace. If you were sent a link, use it directly to reach your intake page.
      </p>
    </main>
  );
}
