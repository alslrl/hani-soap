import type { ComponentProps } from 'react';

/** Native details behavior with one shared disclosure affordance. */
export function Disclosure({ className = '', ...props }: ComponentProps<'details'>) {
  return <details {...props} className={`hs-disclosure ${className}`} data-hs-disclosure="" />;
}
