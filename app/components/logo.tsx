// The Unlecture mark: an open book with an orange tick ("studied and understood") on the brand blue.
// Fixed brand colours so it looks the same in light and dark mode (white on #2c5bd1 is 6:1).
export function LogoMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#2c5bd1" />
      <path
        d="M6 10.5c3.6-1.2 7-1 10 1.2 3-2.2 6.4-2.4 10-1.2v12c-3.6-1.2-7-1-10 1.2-3-2.2-6.4-2.4-10-1.2z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M16 11.7v12" stroke="#fff" strokeWidth="2.2" />
      <path
        d="M18.8 17.2l2.2 2.2 4.2-4.6"
        fill="none"
        stroke="#f59a5c"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
