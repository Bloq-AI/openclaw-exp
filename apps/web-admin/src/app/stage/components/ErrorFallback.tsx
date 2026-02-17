"use client";

import * as s from "../styles";

export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div style={s.errorBox}>
      <div style={s.errorTitle}>Something went wrong</div>
      <div style={s.errorMsg}>{error.message}</div>
      <button onClick={resetErrorBoundary} style={s.retryBtn}>
        Retry
      </button>
    </div>
  );
}
