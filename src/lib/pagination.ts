export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 50,
  maxLimit = 200,
) {
  return {
    limit: Math.min(Number(query.limit) || defaultLimit, maxLimit),
    offset: Number(query.offset) || 0,
  }
}
