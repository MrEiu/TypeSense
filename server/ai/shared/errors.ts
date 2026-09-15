/**
 * server/ai/shared/errors.ts
 *
 * Domain error classes for AI subsystem.
 */

export class AiConfigurationError extends Error {
  constructor(message: string = 'AI configuration missing or invalid. Please configure API Key and Model.') {
    super(message);
    this.name = 'AiConfigurationError';
  }
}

export class AiInferenceError extends Error {
  public readonly causeError?: unknown;

  constructor(message: string, causeError?: unknown) {
    super(message);
    this.name = 'AiInferenceError';
    this.causeError = causeError;
  }
}
