"use client";

import * as s from "../styles";

export function CardSkeleton() {
  return (
    <div style={s.card}>
      <div style={{ padding: 18 }}>
        <div style={{ ...s.skeleton, height: 14, width: "40%", marginBottom: 12 }} />
        <div style={{ ...s.skeleton, height: 10, width: "100%", marginBottom: 8 }} />
        <div style={{ ...s.skeleton, height: 10, width: "70%", marginBottom: 8 }} />
        <div style={{ ...s.skeleton, height: 10, width: "50%" }} />
      </div>
    </div>
  );
}
