"use client";

import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StageHeader } from "./components/StageHeader";
import { SignalFeed } from "./components/SignalFeed";
import { MissionsList } from "./components/MissionsList";
import { MissionPlayback } from "./components/MissionPlayback";
import { OfficeRoom } from "./components/OfficeRoom";
import { ProposalQueue } from "./components/ProposalQueue";
import { ContentDrafts } from "./components/ContentDrafts";
import { AgentMemory } from "./components/AgentMemory";
import { ErrorFallback } from "./components/ErrorFallback";
import { CardSkeleton } from "./components/Skeletons";
import "./dashboard.css";

export default function StagePage() {
  return (
    <div className="dash">
      <div className="dash-grid">
        {/* ── Header ── */}
        <div className="area-header">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <StageHeader />
          </ErrorBoundary>
        </div>

        {/* ── Signal Feed (left column, spans rows) ── */}
        <div className="area-feed">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <SignalFeed />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Missions List ── */}
        <div className="area-missions">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <MissionsList />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Mission Playback ── */}
        <div className="area-playback">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <MissionPlayback />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Office Room (right column, spans rows) ── */}
        <div className="area-office">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <OfficeRoom />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Content Drafts ── */}
        <div className="area-drafts">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <ContentDrafts />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Proposal Queue ── */}
        <div className="area-proposals">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <ProposalQueue />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* ── Agent Memory ── */}
        <div className="area-memory">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<CardSkeleton />}>
              <AgentMemory />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
