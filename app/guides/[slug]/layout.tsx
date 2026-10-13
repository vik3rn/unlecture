import { Suspense } from "react";
import { ProgressProvider } from "@/app/app/guides/[slug]/progress";
import "@/app/app/guides/[slug]/guide.css";

// Free preview without an account: answers live only in this tab and are never saved.
export default function PreviewLayout({ params, children }: LayoutProps<"/guides/[slug]">) {
  return (
    <Suspense>
      {params.then(({ slug }) => (
        <ProgressProvider slug={slug} guideId="" guest initial={null}>
          {children}
        </ProgressProvider>
      ))}
    </Suspense>
  );
}
