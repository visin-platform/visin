export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    [key: string]: T[] | Pagination; // Allow any key for different data types
    pagination: Pagination;
  };
}
