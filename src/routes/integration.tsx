import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  FlowHero,
  FlowDualRole,
  FlowApiSurface,
  FlowAuthFlow,
  FlowIdempotency,
  FlowSandboxPhases,
  FlowCta,
} from "@/components/flow";
import { AmbientGrid } from "@/components/playground/AmbientGrid";

/**
 * /integration — BAXS × T-0 Network 接入规范总览页。
 * Spec: src/data/integration/* (BAXS × T-0 接入规范 v1.0)。
 */
export const Route = createFileRoute("/integration")({
  component: IntegrationPage,
});

function IntegrationPage() {
  return (
    <SiteLayout>
      <AmbientGrid />
      <main className="flex-1">
        <div className="relative">
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-[60vh]"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0, 212, 255, 0.08), transparent 60%)",
              }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-[40vh]"
              style={{
                background:
                  "radial-gradient(ellipse 50% 35% at 50% 100%, rgba(212, 160, 23, 0.05), transparent 65%)",
              }}
            />
            <svg
              className="absolute inset-0 h-full w-full"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <defs>
                <pattern id="integration-dots" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#integration-dots)" />
            </svg>
          </div>

          <FlowHero />
          <FlowDualRole />
          <FlowApiSurface />
          <FlowAuthFlow />
          <FlowIdempotency />
          <FlowSandboxPhases />
          <FlowCta />
        </div>
      </main>
    </SiteLayout>
  );
}
