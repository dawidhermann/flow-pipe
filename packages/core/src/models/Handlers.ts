/**
 * Handler function for processing errors that occur during request execution.
 *
 * @param error - The error that occurred
 */
export interface ErrorHandler {
  (error: Error): void;
}

/**
 * Handler function for processing successful request results.
 *
 * @template T - The type of result being handled
 * @param result - The result to process
 */
export interface ResultHandler<T = unknown> {
  (result: T): void;
}

/**
 * Handler function for processing chunks of data as they arrive from streaming responses.
 * This enables progressive processing of large responses without loading everything into memory.
 *
 * @template Chunk - The type of chunk data being processed
 * @param chunk - The chunk of data to process
 * @param metadata - Optional metadata about the chunk (index, total size, etc.)
 * @returns A promise that resolves when chunk processing is complete (optional)
 *
 * @example
 * ```typescript
 * chunkHandler: async (chunk, metadata) => {
 *   console.log(`Processing chunk ${metadata.index}:`, chunk);
 *   await processChunk(chunk);
 * }
 * ```
 */
export interface ChunkHandler<Chunk = unknown> {
  (
    chunk: Chunk,
    metadata?: {
      index: number;
      isLast: boolean;
      totalBytesRead?: number;
    }
  ): void | Promise<void>;
}
