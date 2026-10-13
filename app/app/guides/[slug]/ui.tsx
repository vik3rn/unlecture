// Renders guide text that may hold a little HTML (formulas, small tables). Every string reaching this has been
// through lib/guides.ts safeHtml, which escapes everything outside a short allowlist.
export function Html({ html, className, block = false }: { html: string; className?: string; block?: boolean }) {
  const Tag = block ? "div" : "span";
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
