/** @type {import('next').NextConfig} */

// The onboarding app is a Next.js App Router project that also serves the
// per-client static onboarding pages out of public/. Those pages were
// previously served with Vercel `cleanUrls`, so /homesource resolved to
// homesource/index.html. Next serves public/ files at their exact path only,
// so we re-create the clean URLs with rewrites here.
//
// Adding a new client: drop public/<client>/index.html and the /<client>
// rewrite below covers it automatically. Extra sub-pages (like homesource's
// branding + launch) get their own explicit rewrite.
const nextConfig = {
  async rewrites() {
    return [
      // /<client> -> public/<client>/index.html  (covers /homesource and future clients)
      { source: '/:client', destination: '/:client/index.html' },
      // homesource sub-pages that are not directory-index files
      { source: '/homesource/branding', destination: '/homesource/branding.html' },
      { source: '/homesource/launch', destination: '/homesource/launch/index.html' },
    ];
  },
};

export default nextConfig;
