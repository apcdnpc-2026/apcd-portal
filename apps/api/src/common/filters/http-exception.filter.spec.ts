import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = { url: '/api/test' };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  // ── HttpException with status codes ──────────────────────────────────

  describe('HttpException handling (400, 404, 500)', () => {
    it('should handle BadRequestException (400)', () => {
      const exception = new BadRequestException('Validation failed');
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
    });

    it('should handle NotFoundException (404)', () => {
      const exception = new NotFoundException('Resource not found');
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Resource not found');
    });

    it('should handle InternalServerErrorException (500)', () => {
      const exception = new InternalServerErrorException('Server failure');
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Server failure');
    });

    it('should handle a 500 HttpException with string response', () => {
      const exception = new HttpException('Server error', HttpStatus.INTERNAL_SERVER_ERROR);
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.message).toBe('Server error');
    });

    it('should handle a 401 UnauthorizedException', () => {
      const exception = new UnauthorizedException();
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(401);
    });

    it('should handle a 403 ForbiddenException', () => {
      const exception = new ForbiddenException('Access denied');
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(403);
    });

    it('should handle a 404 HttpException with string response', () => {
      const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Not Found');
      expect(body.path).toBe('/api/test');
    });
  });

  // ── String vs object messages ────────────────────────────────────────

  describe('string vs object messages', () => {
    it('should handle HttpException with a plain string response', () => {
      const exception = new HttpException('Plain string error', HttpStatus.BAD_REQUEST);
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.message).toBe('Plain string error');
    });

    it('should handle HttpException with object response containing message string', () => {
      const exception = new HttpException(
        { message: 'Object message', error: 'Custom Error' },
        HttpStatus.BAD_REQUEST,
      );
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.message).toBe('Object message');
      expect(body.error).toBe('Custom Error');
    });

    it('should handle HttpException with object response containing message array', () => {
      const exception = new BadRequestException({
        message: ['field1 is required', 'field2 must be a string'],
        error: 'Validation Error',
      });
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(['field1 is required', 'field2 must be a string']);
      expect(body.error).toBe('Validation Error');
    });

    it('should default error to "Error" when object response has no error property', () => {
      const exception = new HttpException({ message: 'Custom message' }, 422);
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.statusCode).toBe(422);
      expect(body.message).toBe('Custom message');
      expect(body.error).toBe('Error');
    });

    it('should use exception.message as fallback when resp.message is undefined', () => {
      const exception = new HttpException({ someOtherKey: 'value' }, 400);
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      // When resp.message is undefined/falsy, falls back to exception.message
      expect(body.message).toBeDefined();
      expect(typeof body.message === 'string').toBe(true);
    });

    it('should use exception.message as fallback when resp.message is empty string', () => {
      const exception = new HttpException({ message: '', error: 'Empty' }, 400);
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      // Empty string is falsy, so falls back to exception.message
      expect(body.message).toBe(exception.message);
    });
  });

  // ── Non-HttpException errors ─────────────────────────────────────────

  describe('non-HttpException errors', () => {
    it('should handle a generic Error with 500 status', () => {
      const exception = new Error('Something broke');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Something broke');
      expect(body.error).toBe('Internal Server Error');

      consoleSpy.mockRestore();
    });

    it('should handle a TypeError with 500 status', () => {
      const exception = new TypeError('Cannot read property of undefined');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.message).toBe('Cannot read property of undefined');

      consoleSpy.mockRestore();
    });

    it('should handle a RangeError with 500 status', () => {
      const exception = new RangeError('Maximum call stack size exceeded');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.message).toBe('Maximum call stack size exceeded');

      consoleSpy.mockRestore();
    });

    it('should log stack trace for non-HTTP errors', () => {
      const exception = new Error('Unexpected');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      filter.catch(exception, mockHost as any);

      expect(consoleSpy).toHaveBeenCalledWith('Unhandled exception:', exception.stack);
      consoleSpy.mockRestore();
    });

    it('should handle completely unknown exception (string thrown)', () => {
      filter.catch('some string error', mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(body.error).toBe('Internal Server Error');
    });

    it('should handle null thrown as exception', () => {
      filter.catch(null, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.message).toBe('Internal server error');
    });

    it('should handle undefined thrown as exception', () => {
      filter.catch(undefined, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(500);
    });

    it('should handle a number thrown as exception', () => {
      filter.catch(42, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.message).toBe('Internal server error');
    });
  });

  // ── Validation errors pass-through ───────────────────────────────────

  describe('validation errors pass-through', () => {
    it('should pass through validation errors array when present', () => {
      const exception = new BadRequestException({
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Invalid email' }],
      });
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.errors).toEqual([{ field: 'email', message: 'Invalid email' }]);
    });

    it('should not include errors key when no validation errors', () => {
      const exception = new NotFoundException('Not found');
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.errors).toBeUndefined();
    });

    it('should pass through multiple validation errors', () => {
      const exception = new BadRequestException({
        message: 'Validation failed',
        errors: [
          { field: 'email', message: 'must be valid email' },
          { field: 'name', message: 'is required' },
          { field: 'phone', message: 'must be 10 digits' },
        ],
      });
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.errors).toHaveLength(3);
    });
  });

  // ── Response body structure ──────────────────────────────────────────

  describe('response body structure', () => {
    it('should produce complete response body shape', () => {
      const exception = new BadRequestException('test error');
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('statusCode');
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('path');
      expect(body).toHaveProperty('timestamp');
    });

    it('should include a valid ISO timestamp', () => {
      const exception = new BadRequestException('test');
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('should always set success to false', () => {
      const exception = new HttpException('test', 200);
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.success).toBe(false);
    });

    it('should include path from the request URL', () => {
      mockRequest.url = '/api/v1/applications/123';
      const exception = new NotFoundException();
      filter.catch(exception, mockHost as any);

      const body = mockResponse.json.mock.calls[0][0];
      expect(body.path).toBe('/api/v1/applications/123');
    });
  });
});
