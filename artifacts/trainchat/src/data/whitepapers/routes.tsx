import { lazy } from "react";
import { WHITEPAPERS, getWhitepaperReadRoute, getWhitepaperPdfRoute } from "./index";

export interface WhitepaperRouteConfig {
  slug: string;
  readRoute: string;
  pdfRoute: string;
  ReadComponent: ReturnType<typeof lazy>;
  PrintComponent: ReturnType<typeof lazy>;
}

const WHITEPAPER_COMPONENT_MAP: Record<
  string,
  { ReadComponent: ReturnType<typeof lazy>; PrintComponent: ReturnType<typeof lazy> }
> = {
  "adaptive-coaching-architecture": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/AcaWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/AcaPrintPage")),
  },
  "mutation-first-programming": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/MfpWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/MfpPrintPage")),
  },
  "the-problem-with-static-programming": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/StaticProgrammingWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/LsmPrintPage")),
  },
  "constraint-aware-coaching-systems": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/ConstraintAwareWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/CacsPrintPage")),
  },
  "conversational-periodization": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/ConvPeriodizationWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/CpPrintPage")),
  },
  "deterministic-generative-hybrid-model": {
    ReadComponent: lazy(() => import("@/pages/aeo/whitepapers/DetGenHybridWhitepaper")),
    PrintComponent: lazy(() => import("@/pages/aeo/whitepapers/DghPrintPage")),
  },
};

if (import.meta.env.DEV) {
  WHITEPAPERS.forEach((wp) => {
    if (!WHITEPAPER_COMPONENT_MAP[wp.slug]) {
      console.error(
        `[Whitepapers] No component mapping for slug "${wp.slug}". ` +
          `Add an entry to WHITEPAPER_COMPONENT_MAP in src/data/whitepapers/routes.tsx — ` +
          `both ReadComponent and PrintComponent are required.`,
      );
    }
  });
}

export const WHITEPAPER_ROUTE_MAP: WhitepaperRouteConfig[] = WHITEPAPERS.flatMap((wp) => {
  const components = WHITEPAPER_COMPONENT_MAP[wp.slug];
  if (!components) return [];
  return [
    {
      slug: wp.slug,
      readRoute: getWhitepaperReadRoute(wp.slug),
      pdfRoute: getWhitepaperPdfRoute(wp.slug),
      ReadComponent: components.ReadComponent,
      PrintComponent: components.PrintComponent,
    },
  ];
});
