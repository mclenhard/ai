import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { asGatewayError } from './as-gateway-error';
import {
  GatewayConnectionError,
  GatewayError,
  GatewayTimeoutError,
  GatewayResponseError,
} from './index';

describe('asGatewayError', () => {
  describe('timeout error detection', () => {
    it('should detect error with UND_ERR_HEADERS_TIMEOUT code', async () => {
      const error = Object.assign(new Error('Request timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      });

      const result = await asGatewayError(error);

      expect(GatewayTimeoutError.isInstance(result)).toBe(true);
      expect(result.message).toContain('Request timeout');
    });

    it('should detect error with UND_ERR_BODY_TIMEOUT code', async () => {
      const error = Object.assign(new Error('Body timeout'), {
        code: 'UND_ERR_BODY_TIMEOUT',
      });

      const result = await asGatewayError(error);

      expect(GatewayTimeoutError.isInstance(result)).toBe(true);
    });

    it('should detect error with UND_ERR_CONNECT_TIMEOUT code', async () => {
      const error = Object.assign(new Error('Connect timeout'), {
        code: 'UND_ERR_CONNECT_TIMEOUT',
      });

      const result = await asGatewayError(error);

      expect(GatewayTimeoutError.isInstance(result)).toBe(true);
    });
  });

  describe('non-timeout errors', () => {
    it('should not treat network errors as timeout errors', async () => {
      const error = new Error('Network error');

      const result = await asGatewayError(error);

      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
      expect(GatewayResponseError.isInstance(result)).toBe(true);
      expect(result.message).toContain('Gateway request failed: Network error');
    });

    it('should not treat ECONNREFUSED as timeout errors', async () => {
      const error = Object.assign(new Error('Connection refused'), {
        code: 'ECONNREFUSED',
      });

      const result = await asGatewayError(error);

      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
    });

    it('should pass through existing GatewayError instances', async () => {
      const existingError = GatewayTimeoutError.createTimeoutError({
        originalMessage: 'existing timeout',
      });

      const result = await asGatewayError(existingError);

      expect(result).toBe(existingError);
    });

    it('should handle non-Error objects', async () => {
      const error = { message: 'timeout occurred' };

      const result = await asGatewayError(error);

      // Non-Error objects won't be detected as timeout errors
      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
      expect(GatewayResponseError.isInstance(result)).toBe(true);
    });

    it('should handle null', async () => {
      const result = await asGatewayError(null);

      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
      expect(GatewayResponseError.isInstance(result)).toBe(true);
    });

    it('should handle undefined', async () => {
      const result = await asGatewayError(undefined);

      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
      expect(GatewayResponseError.isInstance(result)).toBe(true);
    });
  });

  describe('error properties', () => {
    it('should preserve the original error as cause', async () => {
      const originalError = Object.assign(new Error('timeout error'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      });

      const result = await asGatewayError(originalError);

      expect(result.cause).toBe(originalError);
    });

    it('should set correct status code for timeout errors', async () => {
      const error = Object.assign(new Error('timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      });

      const result = await asGatewayError(error);

      expect(result.statusCode).toBe(408);
    });

    it('should have correct error type', async () => {
      const error = Object.assign(new Error('timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      });

      const result = await asGatewayError(error);

      expect(result.type).toBe('timeout_error');
    });
  });

  describe('connection error detection', () => {
    it('should detect UND_ERR_SOCKET as connection error', async () => {
      const error = Object.assign(new Error('other side closed'), {
        code: 'UND_ERR_SOCKET',
      });

      const result = await asGatewayError(error);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
      expect(result.statusCode).toBe(502);
      expect(result.message).toContain('other side closed');
      expect(result.message).toContain('infrastructure proxy');
    });

    it('should detect ECONNRESET as connection error', async () => {
      const error = Object.assign(new Error('Connection reset'), {
        code: 'ECONNRESET',
      });

      const result = await asGatewayError(error);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
    });

    it('should detect EPIPE as connection error', async () => {
      const error = Object.assign(new Error('Broken pipe'), {
        code: 'EPIPE',
      });

      const result = await asGatewayError(error);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
    });

    it('should detect ECONNABORTED as connection error', async () => {
      const error = Object.assign(new Error('Connection aborted'), {
        code: 'ECONNABORTED',
      });

      const result = await asGatewayError(error);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
    });

    it('should not treat ECONNREFUSED as connection error', async () => {
      const error = Object.assign(new Error('Connection refused'), {
        code: 'ECONNREFUSED',
      });

      const result = await asGatewayError(error);

      expect(GatewayConnectionError.isInstance(result)).toBe(false);
    });
  });

  describe('APICallError with connection error cause', () => {
    it('should detect UND_ERR_SOCKET cause as connection error instead of dumping Zod validation', async () => {
      const socketError = Object.assign(new Error('other side closed'), {
        code: 'UND_ERR_SOCKET',
      });

      const apiCallError = new APICallError({
        message: 'Cannot connect to API: other side closed',
        url: 'https://ai-gateway.vercel.sh/v3/ai/video-model',
        requestBodyValues: {},
        cause: socketError,
      });

      const result = await asGatewayError(apiCallError);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
      expect(GatewayResponseError.isInstance(result)).toBe(false);
      expect(result.statusCode).toBe(502);
      expect(result.message).toContain('other side closed');
      expect(result.message).not.toContain('Invalid error response format');
      expect(result.message).not.toContain('invalid_type');
    });

    it('should detect ECONNRESET cause as connection error', async () => {
      const resetError = Object.assign(new Error('Connection reset by peer'), {
        code: 'ECONNRESET',
      });

      const apiCallError = new APICallError({
        message: 'Cannot connect to API: Connection reset by peer',
        url: 'https://ai-gateway.vercel.sh/v3/ai/video-model',
        requestBodyValues: {},
        cause: resetError,
      });

      const result = await asGatewayError(apiCallError);

      expect(GatewayConnectionError.isInstance(result)).toBe(true);
      expect(result.cause).toBe(apiCallError);
    });
  });

  describe('APICallError with timeout cause', () => {
    it('should detect timeout when APICallError has UND_ERR_HEADERS_TIMEOUT in cause', async () => {
      const timeoutError = Object.assign(new Error('Request timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      });

      const apiCallError = new APICallError({
        message: 'Cannot connect to API: Request timeout',
        url: 'https://example.com',
        requestBodyValues: {},
        cause: timeoutError,
      });

      const result = await asGatewayError(apiCallError);

      expect(GatewayTimeoutError.isInstance(result)).toBe(true);
      expect(result.message).toContain('Gateway request timed out');
    });

    it('should not treat APICallError as timeout if cause is not timeout-related', async () => {
      const networkError = new Error('Network connection failed');

      const apiCallError = new APICallError({
        message: 'Cannot connect to API: Network connection failed',
        url: 'https://example.com',
        requestBodyValues: {},
        cause: networkError,
        statusCode: 500,
        responseBody: JSON.stringify({
          error: { message: 'Internal error', type: 'internal_error' },
        }),
      });

      const result = await asGatewayError(apiCallError);

      expect(GatewayTimeoutError.isInstance(result)).toBe(false);
    });
  });
});
