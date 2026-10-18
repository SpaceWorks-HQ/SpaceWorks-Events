import { PageLoader } from "@/components/brand/DotLoader";

// Deliberately not at app/loading.tsx: a root Suspense boundary makes public
// pages stream a 200 before notFound()/redirect() run, which breaks real 404s
// and the 307 for event short links at /{shortCode}.
export default function Loading() {
  return <PageLoader />;
}
