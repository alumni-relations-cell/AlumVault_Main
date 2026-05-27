/**
 * Cursor-based pagination helper for PostgreSQL queries.
 * Uses keyset pagination (cursor) for consistent performance on large datasets.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination parameters from query string.
 * @param {Object} query - Express req.query object.
 * @returns {{ limit: number, cursor: string|null, direction: string }}
 */
const parsePagination = (query) => {
  let limit = parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE;
  limit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);

  const cursor = query.cursor || null;
  const direction = query.direction === 'prev' ? 'prev' : 'next';

  return { limit, cursor, direction };
};

/**
 * Build pagination metadata for the response.
 * @param {Array} rows - Query results (may contain limit+1 rows).
 * @param {number} limit - Page size.
 * @param {string} cursorField - Field to use for cursor (default: 'id').
 * @returns {{ data: Array, metadata: Object }}
 */
const buildPaginatedResponse = (rows, limit, cursorField = 'id') => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const metadata = {
    count: data.length,
    hasMore,
    nextCursor: hasMore && data.length > 0 ? data[data.length - 1][cursorField] : null,
    prevCursor: data.length > 0 ? data[0][cursorField] : null,
  };

  return { data, metadata };
};

/**
 * Apply cursor-based WHERE clause to a SQL query.
 * @param {string} baseQuery - Base SQL query without pagination.
 * @param {string} cursor - Cursor value (UUID or timestamp).
 * @param {string} direction - 'next' or 'prev'.
 * @param {string} cursorColumn - Column to paginate on.
 * @param {Array} params - Query parameter array to append to.
 * @returns {{ query: string, params: Array }}
 */
const applyCursorPagination = (baseQuery, cursor, direction, limit, cursorColumn = 'created_at', params = []) => {
  let query = baseQuery;

  if (cursor) {
    const op = direction === 'prev' ? '>' : '<';
    const paramIndex = params.length + 1;
    query += ` AND ${cursorColumn} ${op} $${paramIndex}`;
    params.push(cursor);
  }

  const order = direction === 'prev' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${cursorColumn} ${order}`;

  const limitIndex = params.length + 1;
  query += ` LIMIT $${limitIndex}`;
  params.push(limit + 1); // Fetch one extra to check hasMore

  return { query, params };
};

module.exports = {
  parsePagination,
  buildPaginatedResponse,
  applyCursorPagination,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
};
