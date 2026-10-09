import { ArrowRight, ArrowUpRight } from 'lucide-react';

export function ActionArrow({ direction = 'right' }: { direction?: 'right' | 'up-right' }) {
  const Icon = direction === 'up-right' ? ArrowUpRight : ArrowRight;
  return <Icon className="hs-action-arrow" size={14} strokeWidth={1.8} aria-hidden="true" />;
}
