"use client";

export function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <div
        className="skeleton-line"
        style={{ height: 14, width: "40%", marginBottom: 14 }}
      />
      <div
        className="skeleton-line"
        style={{ height: 10, width: "100%", marginBottom: 8 }}
      />
      <div
        className="skeleton-line"
        style={{ height: 10, width: "70%", marginBottom: 8 }}
      />
      <div className="skeleton-line" style={{ height: 10, width: "45%" }} />
    </div>
  );
}
