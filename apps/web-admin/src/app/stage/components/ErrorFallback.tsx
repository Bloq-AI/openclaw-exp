"use client";

export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="error-box">
      <div className="error-title">Something went wrong</div>
      <div className="error-msg">{error.message}</div>
      <button onClick={resetErrorBoundary} className="error-retry">
        retry
      </button>
    </div>
  );
}
