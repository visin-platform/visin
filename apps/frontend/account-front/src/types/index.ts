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
  /** False for a Google-created account that has not set a password yet. */
  hasPassword?: boolean;
  /** The address of the public page, `/u/{handle}`. */
  handle?: string;
  bio?: string;
  links?: string[];
  /** False hides the public page and the name shown on what the account owns. */
  profilePublic?: boolean;
}

export interface AuthResponse {
  authenticated: boolean;
  user: User | null;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  handle?: string;
  bio?: string;
  links?: string[];
  profilePublic?: boolean;
}

export interface UpdateProfileResponse {
  success: boolean;
  user: User;
  message?: string;
}
