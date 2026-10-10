export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main id="main" className="flex flex-1 items-start px-4 py-12 sm:items-center sm:py-20">{children}</main>;
}
