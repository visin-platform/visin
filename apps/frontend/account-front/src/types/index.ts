export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    albums?: T[];
    photos?: T[];
    pagination: PaginationInfo;
  };
}

// Auth types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name: string;
  picture?: string;
  username?: string;
}

export interface AuthResponse {
  authenticated: boolean;
  user: User | null;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  user: User;
  message?: string;
}
