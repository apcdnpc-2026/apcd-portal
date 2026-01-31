import { HttpException, HttpStatus, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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

  it('should handle a 400 BadRequestException', () => {
    const exception = new BadRequestException('Validation failed');
    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
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

  it('should handle NotFoundException', () => {
    const exception = new NotFoundException('Resource not found');
    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.message).toBe('Resource not found');
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

  it('should handle non-HTTP Error exception with 500 status', () => {
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

  it('should log stack trace for non-HTTP errors', () => {
    const exception = new Error('Unexpected');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    filter.catch(exception, mockHost as any);

    expect(consoleSpy).toHaveBeenCalledWith('Unhandled exception:', exception.stack);
    consoleSpy.mockRestore();
  });

  it('should handle completely unknown exception (not Error, not HttpException)', () => {
    filter.catch('some string error', mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toBe('Internal Server Error');
  });

  it('should include path from the request URL', () => {
    mockRequest.url = '/api/v1/applications/123';
    const exception = new NotFoundException();
    filter.catch(exception, mockHost as any);

    const body = mockResponse.json.mock.calls[0][0];
    expect(body.path).toBe('/api/v1/applications/123');
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

  it('should handle HttpException with object response but no error field', () => {
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
    // When resp.message is undefined, falls back to exception.message
    expect(body.message).toBeDefined();
  });

  it('should handle 500 HttpException', () => {
    const exception = new HttpException('Server error', HttpStatus.INTERNAL_SERVER_ERROR);
    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    const body = mockResponse.json.mock.calls[0][0];
    expect(body.message).toBe('Server error');
  });

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
});
