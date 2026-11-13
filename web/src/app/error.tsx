"use client";
import { State, StoreLayout } from "@/features/store/ui";

export default function StoreError() {
  return <StoreLayout>
    <div className="store-container">
      <State error="This page is temporarily unavailable." retry={() => window.location.reload()}>
        {null}
      </State>
    </div>
  </StoreLayout>;
}
