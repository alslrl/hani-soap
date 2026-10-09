export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}
export function invariant(condition: unknown, message: string, code = 'INVALID_INPUT'): asserts condition {
  if (!condition) throw new AppError(400, code, message);
}
