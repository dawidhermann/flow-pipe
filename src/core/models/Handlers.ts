export interface ErrorHandler {
  (error: Error): void;
}

export interface ResultHandler<T = unknown> {
  (result: T): void;
}
