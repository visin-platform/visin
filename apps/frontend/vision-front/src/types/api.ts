export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    [key: string]: T[] | any; // Allow any key for different data types
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
