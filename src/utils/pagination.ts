export interface PaginationInput {
  page?: number | string;
  pageSize?: number | string;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function resolvePagination(input: PaginationInput, defaultPageSize = 25): PaginationResult {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(input.pageSize) || defaultPageSize));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function buildPaginationMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    total,
    page,
    pageSize,
    totalPages,
    hasPrevious: page > 1,
    hasNext: page < totalPages
  };
}
