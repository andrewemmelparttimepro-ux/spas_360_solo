import { cn } from '@/lib/utils';

type AriAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizes: Record<AriAvatarSize, string> = {
  xs: 'w-4 h-4',
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

export default function AriAvatar({
  size = 'sm',
  showStatus = false,
  className,
}: {
  size?: AriAvatarSize;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', sizes[size], className)} aria-hidden="true">
      <span className="absolute inset-0 overflow-hidden rounded-full border border-[#FFD343]/70 bg-[#FFD343] ring-2 ring-[#FFD343]/10">
        <img
          src="/ari-duck.webp"
          alt=""
          className="absolute left-1/2 top-[-4%] h-auto w-[118%] max-w-none -translate-x-1/2 drop-shadow-[0_2px_1px_rgba(6,29,47,0.22)]"
        />
      </span>
      {showStatus && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-emerald-500" />
      )}
    </span>
  );
}
