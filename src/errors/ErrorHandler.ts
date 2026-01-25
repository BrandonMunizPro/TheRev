import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
  SystemError,
  ErrorCode,
  ErrorDetails,
} from './AppError';

export class ErrorHandler {
  // Authentication Errors
  static notAuthenticated(details?: ErrorDetails): AuthenticationError {
    return new AuthenticationError('Authentication required', details);
  }

  static invalidToken(details?: ErrorDetails): AuthenticationError {
    return new AuthenticationError(
      'Invalid or expired authentication token',
      details
    );
  }

  static forbidden(
    message?: string,
    details?: ErrorDetails
  ): AuthorizationError {
    return new AuthorizationError(
      message || 'Access forbidden',
      ErrorCode.FORBIDDEN,
      details
    );
  }

  // Authorization Errors
  static insufficientPermissions(
    action: string,
    resource: string,
    details?: ErrorDetails
  ): AuthorizationError {
    const errorDetails = { ...details, action, resource };
    return new AuthorizationError(
      `You don't have permission to ${action} ${resource}`,
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      errorDetails
    );
  }

  static permissionRevoked(
    revokedAt: Date,
    details?: ErrorDetails
  ): AuthorizationError {
    const errorDetails = { ...details, revokedAt: revokedAt.toISOString() };
    return new AuthorizationError(
      `Your privilege as an admin on this thread was revoked on ${revokedAt.toISOString()}`,
      ErrorCode.PERMISSION_REVOKED,
      errorDetails
    );
  }

  static adminPrivilegeRequired(details?: ErrorDetails): AuthorizationError {
    return new AuthorizationError(
      'Admin privilege required for this operation',
      ErrorCode.ADMIN_PRIVILEGE_REQUIRED,
      details
    );
  }

  static threadAccessDenied(
    action: string,
    details?: ErrorDetails
  ): AuthorizationError {
    const errorDetails = { ...details, action };
    return new AuthorizationError(
      `Thread access denied for action: ${action}`,
      ErrorCode.THREAD_ACCESS_DENIED,
      errorDetails
    );
  }

  static userMismatch(details?: ErrorDetails): AuthorizationError {
    return new AuthorizationError(
      'User mismatch for this operation',
      ErrorCode.USER_MISMATCH,
      details
    );
  }

  // Validation Errors
  static invalidInput(
    message: string,
    field?: string,
    value?: any,
    details?: ErrorDetails
  ): ValidationError {
    const errorDetails = { ...details, field, value };
    return new ValidationError(message, errorDetails);
  }

  static missingRequiredField(
    field: string,
    details?: ErrorDetails
  ): ValidationError {
    const errorDetails = { ...details, field };
    return new ValidationError(
      `Required field missing: ${field}`,
      errorDetails
    );
  }

  static missingRequiredFields(
    fields: string[],
    details?: ErrorDetails
  ): ValidationError {
    const errorDetails = { ...details, field: fields.join(', ') };
    return new ValidationError(
      `Required fields missing: ${fields.join(', ')}`,
      errorDetails
    );
  }

  static invalidFormat(
    field: string,
    value: any,
    details?: ErrorDetails
  ): ValidationError {
    const errorDetails = { ...details, field, value };
    return new ValidationError(
      `Invalid format for field: ${field}`,
      errorDetails
    );
  }

  static duplicateValue(
    field: string,
    value: any,
    details?: ErrorDetails
  ): ValidationError {
    const errorDetails = { ...details, field, value };
    return new ValidationError(
      `Duplicate value for field: ${field}`,
      errorDetails
    );
  }

  static passwordsMatch(details?: ErrorDetails): ValidationError {
    return new ValidationError(
      'Current password and new password cannot be the same',
      details
    );
  }

  static passwordsUnchanged(details?: ErrorDetails): ValidationError {
    return new ValidationError('No changes detected in password', details);
  }

  // Not Found Errors
  static userNotFound(
    identifier: string,
    details?: ErrorDetails
  ): NotFoundError {
    const errorDetails = { ...details, resource: 'user', value: identifier };
    return new NotFoundError(
      `User not found: ${identifier}`,
      ErrorCode.USER_NOT_FOUND,
      errorDetails
    );
  }

  static threadNotFound(
    identifier: string,
    details?: ErrorDetails
  ): NotFoundError {
    const errorDetails = { ...details, resource: 'thread', value: identifier };
    return new NotFoundError(
      `Thread not found: ${identifier}`,
      ErrorCode.THREAD_NOT_FOUND,
      errorDetails
    );
  }

  static postNotFound(
    identifier: string,
    details?: ErrorDetails
  ): NotFoundError {
    const errorDetails = { ...details, resource: 'post', value: identifier };
    return new NotFoundError(
      `Post not found: ${identifier}`,
      ErrorCode.POST_NOT_FOUND,
      errorDetails
    );
  }

  static adminNotFound(
    identifier: string,
    details?: ErrorDetails
  ): NotFoundError {
    const errorDetails = { ...details, resource: 'admin', value: identifier };
    return new NotFoundError(
      `Admin assignment not found: ${identifier}`,
      ErrorCode.ADMIN_NOT_FOUND,
      errorDetails
    );
  }

  // Business Logic Errors
  static threadLocked(details?: ErrorDetails): BusinessLogicError {
    return new BusinessLogicError(
      'Thread is locked and cannot be modified',
      ErrorCode.THREAD_LOCKED,
      details
    );
  }

  static emailAlreadyInUse(
    email: string,
    details?: ErrorDetails
  ): BusinessLogicError {
    const errorDetails = { ...details, field: 'email', value: email };
    return new BusinessLogicError(
      'Email is already in use',
      ErrorCode.EMAIL_ALREADY_IN_USE,
      errorDetails
    );
  }

  static invalidCredentials(details?: ErrorDetails): BusinessLogicError {
    return new BusinessLogicError(
      'Invalid username or password',
      ErrorCode.INVALID_CREDENTIALS,
      details
    );
  }

  static operationNotAllowed(
    operation: string,
    details?: ErrorDetails
  ): BusinessLogicError {
    const errorDetails = { ...details, action: operation };
    return new BusinessLogicError(
      `Operation not allowed: ${operation}`,
      ErrorCode.OPERATION_NOT_ALLOWED,
      errorDetails
    );
  }

  static selectSingleOption(
    options: string[],
    details?: ErrorDetails
  ): BusinessLogicError {
    const errorDetails = { ...details, field: 'selection', value: options };
    return new BusinessLogicError(
      `Please select exactly one option: ${options.join(' or ')}`,
      ErrorCode.INVALID_INPUT,
      errorDetails
    );
  }

  // System Errors
  static databaseError(
    message: string = 'Database operation failed',
    details?: ErrorDetails
  ): SystemError {
    const errorDetails = { ...details, timestamp: new Date().toISOString() };
    return new SystemError(message, ErrorCode.DATABASE_ERROR, errorDetails);
  }

  static emailSendFailed(details?: ErrorDetails): SystemError {
    return new SystemError(
      'Could not send email',
      ErrorCode.EMAIL_SEND_FAILED,
      details
    );
  }

  static internalServerError(
    message: string = 'Internal server error',
    details?: ErrorDetails
  ): SystemError {
    const errorDetails = { ...details, timestamp: new Date().toISOString() };
    return new SystemError(
      message,
      ErrorCode.INTERNAL_SERVER_ERROR,
      errorDetails
    );
  }

  static serviceUnavailable(
    service: string,
    details?: ErrorDetails
  ): SystemError {
    const errorDetails = { ...details, resource: service };
    return new SystemError(
      `Service temporarily unavailable: ${service}`,
      ErrorCode.SERVICE_UNAVAILABLE,
      errorDetails
    );
  }

  // Utility methods
  static handleUnknownError(error: any): AppError {
    if (AppError.isAppError(error)) {
      return error;
    }

    // Handle known JavaScript errors
    if (error instanceof TypeError) {
      const errorDetails = { originalError: error.message };
      return new ValidationError(`Type error: ${error.message}`, errorDetails);
    }

    if (error instanceof ReferenceError) {
      const errorDetails = { originalError: error.message };
      return new ValidationError(
        `Reference error: ${error.message}`,
        errorDetails
      );
    }

    // Handle database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const errorDetails = {
        originalError: error.message,
        errorCode: error.code,
      };
      return new SystemError(
        'Database connection failed',
        ErrorCode.DATABASE_ERROR,
        errorDetails
      );
    }

    // Default fallback
    const errorMessage = error.message || 'Unknown error occurred';
    const errorDetails = { originalError: errorMessage };
    return new SystemError(
      errorMessage,
      ErrorCode.INTERNAL_SERVER_ERROR,
      errorDetails
    );
  }

  // Async error wrapper for consistent error handling
  static async wrapAsync<T>(
    operation: () => Promise<T>,
    errorHandler?: (error: any) => AppError
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (errorHandler) {
        throw errorHandler(error);
      }
      throw this.handleUnknownError(error);
    }
  }

  // Sync error wrapper for consistent error handling
  static wrap<T>(
    operation: () => T,
    errorHandler?: (error: any) => AppError
  ): T {
    try {
      return operation();
    } catch (error) {
      if (errorHandler) {
        throw errorHandler(error);
      }
      throw this.handleUnknownError(error);
    }
  }
}
