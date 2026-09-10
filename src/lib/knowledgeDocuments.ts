/** Keep the empty-search library and its count on the same type filter. */
export function filterKnowledgeDocuments<T extends { doc_type: string }>(documents: readonly T[], type: string): T[] {
  return documents.filter(document => type === 'all' || document.doc_type === type);
}

/** Search cards identify their document; extracted page text belongs in the excerpt. */
export function knowledgeSearchTitle(result: { title: string; citation_label: string | null }): string {
  return result.title.trim() || result.citation_label?.trim() || 'Untitled source';
}
