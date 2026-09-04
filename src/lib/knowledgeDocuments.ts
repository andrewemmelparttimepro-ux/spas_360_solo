/** Keep the empty-search library and its count on the same type filter. */
export function filterKnowledgeDocuments<T extends { doc_type: string }>(documents: readonly T[], type: string): T[] {
  return documents.filter(document => type === 'all' || document.doc_type === type);
}
