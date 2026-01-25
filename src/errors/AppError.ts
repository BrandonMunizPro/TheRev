export enum ErrorCode {
  // Authentication Errors (1000-1099)
  NOT_AUTHENTICATED = 1001,
  INVALID_TOKEN = 1002,
  TOKEN_EXPIRED = 1003,
  FORBIDDEN = 1004,

  // Authorization Errors (1100-1199)
  INSUFFICIENT_PERMISSIONS = 1101,
  PERMISSION_REVOKED = 1102,
  ADMIN_PRIVILEGE_REQUIRED = 1103,
  THREAD_ACCESS_DENIED = 1104,
  USER_MISMATCH = 1105,

  // Validation Errors (1200-1299)
  INVALID_INPUT = 1201,
  MISSING_REQUIRED_FIELD = 1202,
  INVALID_FORMAT = 1203,
  DUPLICATE_VALUE = 1204,
  PASSWORDS_MATCH = 1205,
  PASSWORDS_UNCHANGED = 1206,

  // Resource Not Found Errors (1300-1399)
  USER_NOT_FOUND = 1301,
  THREAD_NOT_FOUND = 1302,
  POST_NOT_FOUND = 1303,
  ADMIN_NOT_FOUND = 1304,

  // Business Logic Errors (1400-1499)
  THREAD_LOCKED = 1401,
  EMAIL_ALREADY_IN_USE = 1402,
  INVALID_CREDENTIALS = 1403,
  OPERATION_NOT_ALLOWED = 1404,

  // System Errors (1500-1599)
  DATABASE_ERROR = 1501,
  EMAIL_SEND_FAILED = 1502,
  INTERNAL_SERVER_ERROR = 1503,
  SERVICE_UNAVAILABLE = 1504,
}

export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
}

export interface ErrorDetails {
  field?: string;
  value?: any;
  resource?: string;
  action?: string;
  timestamp?: string;
  requestId?: string;
  originalError?: string;
  errorCode?: string;
  threadId?: string;
  userId?: string;
  revokedAt?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly details?: ErrorDetails;
  public readonly isOperational: boolean = true;

  constructor(
    errorCode: ErrorCode,
    message: string,
    category: ErrorCategory,
    statusCode: number = 500,
    details?: ErrorDetails
  ) {
    super(message);
    this.errorCode = errorCode;
    this.category = category;
    this.statusCode = statusCode;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      category: this.category,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: new Date().toISOString(),
      isOperational: this.isOperational,
    };
  }

  static isAppError(error: any): error is AppError {
    return error instanceof AppError;
  }
}

// Predefined error creators for common scenarios
export class AuthenticationError extends AppError {
  constructor(
    message: string = 'Authentication required',
    details?: ErrorDetails
  ) {
    super(
      ErrorCode.NOT_AUTHENTICATED,
      message,
      ErrorCategory.AUTHENTICATION,
      401,
      details
    );
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.INSUFFICIENT_PERMISSIONS,
    details?: ErrorDetails
  ) {
    super(errorCode, message, ErrorCategory.AUTHORIZATION, 403, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(
      ErrorCode.INVALID_INPUT,
      message,
      ErrorCategory.VALIDATION,
      400,
      details
    );
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, errorCode: ErrorCode, details?: ErrorDetails) {
    super(errorCode, message, ErrorCategory.NOT_FOUND, 404, details);
  }
}

export class BusinessLogicError extends AppError {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.OPERATION_NOT_ALLOWED,
    details?: ErrorDetails
  ) {
    super(errorCode, message, ErrorCategory.BUSINESS_LOGIC, 422, details);
  }
}

export class SystemError extends AppError {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    details?: ErrorDetails
  ) {
    super(errorCode, message, ErrorCategory.SYSTEM, 500, details);
  }
}
