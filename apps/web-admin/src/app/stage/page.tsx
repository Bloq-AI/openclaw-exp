"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StageHeader } from "./components/StageHeader";
import { SignalFeed } from "./components/SignalFeed";
import { MissionsList } from "./components/MissionsList";
import { OfficeRoom } from "./components/OfficeRoom";
import { MissionPlayback } from "./components/MissionPlayback";
import { ErrorFallback } from "./components/ErrorFallback";
import { CardSkeleton } from "./components/Skeletons";
import * as s from "./styles";

export default function StagePage() {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
      <div style={s.page}>
        <div style={s.grid}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <StageHeader />
          </ErrorBoundary>

          {/* Left column: Signal feed */}
          <div style={s.column}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<CardSkeleton />}>
                <SignalFeed />
              </Suspense>
            </ErrorBoundary>
          </div>

          {/* Center column: Missions + Playback */}
          <div style={s.column}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<CardSkeleton />}>
                <MissionsList />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<CardSkeleton />}>
                <MissionPlayback />
              </Suspense>
            </ErrorBoundary>
          </div>

          {/* Right column: Office Room */}
          <div style={s.column}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Suspense fallback={<CardSkeleton />}>
                <OfficeRoom />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </>
  );
}
