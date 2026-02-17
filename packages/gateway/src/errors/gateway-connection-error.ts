import { GatewayError } from './gateway-error';

const name = 'GatewayConnectionError';
const marker = `vercel.ai.gateway.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Connection-level error where the gateway connection was terminated
 * before a response could be received (e.g., socket closed by
 * infrastructure proxy, connection reset).
 */
export class GatewayConnectionError extends GatewayError {
  private readonly [symbol] = true; // used in isInstance

  readonly name = name;
  readonly type = 'connection_error';

  constructor({
    message = 'Gateway connection closed before response was received',
    statusCode = 502,
    cause,
    generationId,
  }: {
    message?: string;
    statusCode?: number;
    cause?: unknown;
    generationId?: string;
  } = {}) {
    super({ message, statusCode, cause, generationId });
  }

  static isInstance(error: unknown): error is GatewayConnectionError {
    return GatewayError.hasMarker(error) && symbol in error;
  }
}
