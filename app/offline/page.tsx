import { Suspense } from "react";
import OfflineCenterClient from "./OfflineCenterClient";

export default function OfflinePage() {
  return (
    <Suspense fallback={null}>
      <OfflineCenterClient />
    </Suspense>
  );
}
