import { memo } from "react";
import type { BodyMapVersion } from "@/lib/tablet/body-map-version";
import type { BodyView } from "@/lib/tablet/regions";
import { acupointReferenceDots } from "@/lib/tablet/acupoint-reference";
import "./acupoint-reference.css";

/** Static reference marks sit under ink and do not participate in pointer input. */
export const AcupointReferenceDots = memo(function AcupointReferenceDots({ version, view }: {
  version: BodyMapVersion;
  view: BodyView;
}) {
  const dots = acupointReferenceDots(version, view);
  if (!dots.length) return null;
  return <g aria-hidden="true" pointerEvents="none" className="tablet-acupoint-reference" data-testid="acupoint-reference-dots" data-coordinate-version={version} data-body-view={view}>
    {dots.map(dot => <circle key={`${dot.code}:${dot.side}`} data-reference-code={dot.code} cx={dot.x} cy={dot.y} r="2" />)}
  </g>;
});
