import type { BodyView } from "@/lib/tablet/regions";
import type { BodyMapVersion } from "@/lib/tablet/body-map-version";

/** Original v1 artwork. Keep its geometry unchanged for saved v1 ink. */
export function LegacyBodyDiagram({ view }: { view: BodyView }) {
  return <g className="tablet-body" aria-hidden="true">
    <ellipse cx="500" cy="95" rx="51" ry="53" />
    <path d="M475 143 L474 178 L415 188 Q385 192 370 224 L329 345 L279 503 L259 530 L245 574 Q244 587 255 586 L270 557 L265 594 Q267 607 276 596 L290 561 L284 598 Q290 609 298 595 L309 557 L317 574 Q328 581 330 567 L320 525 L361 382 L407 267 L420 371 L432 438 L410 493 Q405 531 411 566 L412 672 L418 730 L425 800 L433 888 L423 918 L392 941 Q383 959 405 961 L465 960 Q479 957 477 938 L474 896 L479 816 L480 733 L490 602 L500 552 L510 602 L520 733 L521 816 L526 896 L523 938 Q521 957 535 960 L595 961 Q617 959 608 941 L577 918 L567 888 L575 800 L582 730 L588 672 L589 566 Q595 531 590 493 L568 438 L580 371 L593 267 L639 382 L680 525 L670 567 Q672 581 683 574 L691 557 L702 595 Q710 609 716 598 L710 561 L724 596 Q733 607 735 594 L730 557 L745 586 Q756 587 755 574 L741 530 L721 503 L671 345 L630 224 Q615 192 585 188 L526 178 L525 143" />
    {view === "front" ? <g className="tablet-body-detail">
      <path d="M466 94 Q474 89 482 94 M518 94 Q526 89 534 94 M487 121 Q500 128 513 121 M500 101 L495 110 L501 112" />
      <path d="M440 232 Q470 224 492 237 M508 237 Q530 224 560 232 M500 250 L500 360 M480 392 Q500 399 520 392 M484 489 L500 508 L516 489 M433 714 Q449 700 468 714 M532 714 Q551 700 567 714 M431 895 L473 895 M527 895 L569 895" />
      <circle cx="500" cy="429" r="3" />
    </g> : <g className="tablet-body-detail">
      <path d="M475 150 Q500 158 525 150 M500 186 L500 463 M448 232 Q463 259 480 280 M552 232 Q537 259 520 280 M433 454 Q455 467 478 459 M522 459 Q545 467 567 454 M410 531 Q448 548 485 525 M515 525 Q552 548 590 531 M433 715 Q452 723 469 715 M531 715 Q548 723 567 715 M431 895 L473 895 M527 895 L569 895" />
    </g>}
    <text x="338" y="278" className="tablet-side-label">{view === "front" ? "환자 우측" : "환자 좌측"}</text>
    <text x="660" y="278" className="tablet-side-label">{view === "front" ? "환자 좌측" : "환자 우측"}</text>
  </g>;
}

/** Each stored coordinate version remains paired with its original drawing. */
export function BodyDiagram({ view, version = "body-map-v1" }: { view: BodyView; version?: BodyMapVersion }) {
  if (version === "body-map-v1") return <LegacyBodyDiagram view={view} />;
  return <g className="tablet-body-anatomy" aria-hidden="true" data-body-map-version={version}>
    <image href={`/demo/anatomy/body-${view}-${version === "body-map-v3-female" ? "v3-female" : "v2"}.png`} x="0" y="0" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" />
    <text x="305" y="270" className="tablet-side-label">{view === "front" ? "환자 우측" : "환자 좌측"}</text>
    <text x="695" y="270" className="tablet-side-label">{view === "front" ? "환자 좌측" : "환자 우측"}</text>
  </g>;
}
