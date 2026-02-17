import { APICallError } from '@ai-sdk/provider';
import { extractApiCallResponse, GatewayError } from '.';
import { createGatewayErrorFromResponse } from './create-gateway-error';
import { GatewayConnectionError } from './gateway-connection-error';
import { GatewayTimeoutError } from './gateway-timeout-error';

/**
 * Checks if an error is a timeout error from undici.
 * Only checks undici-specific error codes to avoid false positives.
 */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for undici-specific timeout error codes
  const errorCode = (error as any).code;
  if (typeof errorCode === 'string') {
    const undiciTimeoutCodes = [
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_CONNECT_TIMEOUT',
    ];
    return undiciTimeoutCodes.includes(errorCode);
  }

  return false;
}

/**
 * Checks if an error is a connection-level failure (socket closed,
 * connection reset, etc.) where no HTTP response was received.
 */
function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = (error as any).code;
  if (typeof errorCode === 'string') {
    const connectionErrorCodes = [
      'UND_ERR_SOCKET', // socket closed by other side (e.g., infrastructure proxy timeout)
      'ECONNRESET', // connection reset by peer
      'EPIPE', // broken pipe
      'ECONNABORTED', // connection aborted
    ];
    return connectionErrorCodes.includes(errorCode);
  }

  return false;
}

/**
 * Builds a user-friendly connection error message from the original error.
 */
function buildConnectionErrorMessage(error: unknown): string {
  const originalMessage =
    error instanceof Error ? error.message : 'Unknown error';

  // Extract the underlying cause message for more context
  let causeMessage: string | undefined;
  if (error instanceof Error && (error as any).cause instanceof Error) {
    causeMessage = ((error as any).cause as Error).message;
  }

  const detail = causeMessage ?? originalMessage;

  return (
    `Gateway connection closed before a response was received: ${detail}. ` +
    `This typically happens when an infrastructure proxy (e.g., load balancer) ` +
    `terminates an idle connection during a long-running request.`
  );
}

export async function asGatewayError(
  error: unknown,
  authMethod?: 'api-key' | 'oidc',
) {
  if (GatewayError.isInstance(error)) {
    return error;
  }

  // Check if this is a timeout error (or has a timeout error in the cause chain)
  if (isTimeoutError(error)) {
    return GatewayTimeoutError.createTimeoutError({
      originalMessage: error instanceof Error ? error.message : 'Unknown error',
      cause: error,
    });
  }

  // Check if this is a connection-level failure (no HTTP response received)
  if (isConnectionError(error)) {
    return new GatewayConnectionError({
      message: buildConnectionErrorMessage(error),
      cause: error,
    });
  }

  // Check if this is an APICallError caused by a timeout or connection error
  if (APICallError.isInstance(error)) {
    // Check if the cause is a timeout error
    if (error.cause && isTimeoutError(error.cause)) {
      return GatewayTimeoutError.createTimeoutError({
        originalMessage: error.message,
        cause: error,
      });
    }

    // Check if the cause is a connection error (e.g., socket closed by
    // infrastructure proxy before gateway could respond)
    if (error.cause && isConnectionError(error.cause)) {
      return new GatewayConnectionError({
        message: buildConnectionErrorMessage(error),
        cause: error,
      });
    }

    return await createGatewayErrorFromResponse({
      response: extractApiCallResponse(error),
      statusCode: error.statusCode ?? 500,
      defaultMessage: 'Gateway request failed',
      cause: error,
      authMethod,
    });
  }

  return await createGatewayErrorFromResponse({
    response: {},
    statusCode: 500,
    defaultMessage:
      error instanceof Error
        ? `Gateway request failed: ${error.message}`
        : 'Unknown Gateway error',
    cause: error,
    authMethod,
  });
}
