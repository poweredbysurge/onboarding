'use client';
import React, { useState } from 'react';
import ICPFlow from '../components/surge/ICPFlow';
import { ChevronRight } from 'lucide-react';

const KEYFRAMES = `
  @keyframes borderPulse {
    0%, 100% { box-shadow: 0 0 0px 0px rgba(222,229,53,0), border-color: rgba(222,229,53,0.12); }
    50%       { box-shadow: 0 0 18px 2px rgba(222,229,53,0.12), border-color: rgba(222,229,53,0.45); }
  }
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

export default function ICPPage() {
  const [started, setStarted] = useState(false);

  return (
    <div className="bg-surge-bg min-h-screen" role="main">
      <style>{KEYFRAMES}</style>

      {!started ? (
        /* ── Intro screen ── */
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="max-w-3xl mx-auto">

            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="https://framerusercontent.com/images/oCLNiakSYiHSw8cVyAZSr88mDw.png"
                alt="Surge"
                className="h-14"
              />
            </div>

            <span className="font-body text-xs tracking-[0.35em] uppercase text-surge-green">
              Client Intake
            </span>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl text-white mt-3 mb-4 leading-none tracking-wide">
              Who Are We<br />
              <span className="text-surge-green">Building For?</span>
            </h1>
            <p className="font-body text-base text-white/50 leading-relaxed max-w-xl mx-auto">
              Before anything gets built, we need clarity on who this is for. This drives your ads, your website, your funnels, and how your entire brand shows up.
            </p>

            {/* Animated insight card */}
            <div
              className="mt-6 mb-10 rounded-xl px-6 py-4 border"
              style={{
                background: 'linear-gradient(135deg, rgba(222,229,53,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                animation: 'borderPulse 3s ease-in-out infinite, fadeUp 0.6s ease-out both',
                animationDelay: '0s, 0.3s',
              }}
            >
              <p
                className="font-body text-sm leading-relaxed"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(222,229,53,0.9) 40%, rgba(255,255,255,0.9) 60%, rgba(255,255,255,0.25) 100%)',
                  backgroundSize: '800px 100%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'shimmer 4s linear infinite',
                }}
              >
                The more thoroughly you complete this intake, the more precisely we can speak to your audience in your ads, your copy, and every touchpoint we build.
              </p>
            </div>

            <div className="flex items-center justify-center gap-6 mb-8">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-surge-green" />
                <span className="font-body text-xs text-white/40">~10 minutes</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-surge-green" />
                <span className="font-body text-xs text-white/40">6 sections</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-surge-green" />
                <span className="font-body text-xs text-white/40">Confidential</span>
              </div>
            </div>

            <button
              onClick={() => setStarted(true)}
              className="cta-fill inline-flex items-center gap-2 font-body text-sm font-semibold tracking-wide bg-surge-green text-surge-bg px-10 py-4 rounded transition-all duration-300 hover:shadow-xl hover:shadow-surge-green/20"
            >
              I Understand
              <ChevronRight className="w-4 h-4" />
            </button>

          </div>
        </div>
      ) : (
        /* ── Immersive micro-screen flow (self-contained: progress, autosave, review, submit) ── */
        <ICPFlow />
      )}

    </div>
  );
}
