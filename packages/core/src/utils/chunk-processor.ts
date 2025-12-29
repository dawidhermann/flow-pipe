import type { ChunkHandler } from "../models/handlers";
import type { ChunkProcessingConfig } from "../models/request-params";

/**
 * Processes a ReadableStream progressively, calling the chunk handler for each chunk.
 * Supports both text and binary streams.
 *
 * @template Chunk - The type of chunk data
 * @param stream - The ReadableStream to process
 * @param config - The chunk processing configuration
 * @returns A promise that resolves when processing is complete, optionally with accumulated data
 */
export async function processStream<Chunk = string | Uint8Array>(
  stream: ReadableStream<Uint8Array>,
  config: ChunkProcessingConfig<Chunk>
): Promise<Chunk | undefined> {
  const { chunkHandler, encoding = "utf-8", accumulate = false } = config;

  const reader = stream.getReader();
  const decoder = new TextDecoder(encoding);
  let accumulatedData: string | Uint8Array | undefined;
  let chunkIndex = 0;
  let totalBytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining accumulated data
        if (accumulatedData !== undefined && accumulatedData.length > 0) {
          await processChunk(
            accumulatedData as Chunk,
            chunkHandler,
            chunkIndex,
            true,
            totalBytesRead
          );
        }
        break;
      }

      totalBytesRead += value.length;

      if (accumulate) {
        // Accumulate chunks
        if (accumulatedData === undefined) {
          accumulatedData = value;
        } else if (typeof accumulatedData === "string") {
          accumulatedData += decoder.decode(value, { stream: true });
        } else {
          // Concatenate Uint8Arrays
          const combined = new Uint8Array(
            accumulatedData.length + value.length
          );
          combined.set(accumulatedData);
          combined.set(value, accumulatedData.length);
          accumulatedData = combined;
        }
      }

      // Process chunk
      const isLast = false; // We don't know if it's the last until done
      await processChunk(
        value as Chunk,
        chunkHandler,
        chunkIndex,
        isLast,
        totalBytesRead
      );

      chunkIndex++;
    }

    return accumulatedData as Chunk | undefined;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Processes a text stream line by line (useful for NDJSON, CSV, or line-delimited data).
 *
 * @param stream - The ReadableStream to process
 * @param config - The chunk processing configuration
 * @returns A promise that resolves when processing is complete
 */
export async function processTextStreamLineByLine(
  stream: ReadableStream<Uint8Array>,
  config: ChunkProcessingConfig<string>
): Promise<string | undefined> {
  const { chunkHandler, encoding = "utf-8", accumulate = false } = config;

  const reader = stream.getReader();
  const decoder = new TextDecoder(encoding);
  let buffer = "";
  let lineIndex = 0;
  let totalBytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer content
        if (buffer.length > 0) {
          await processChunk(
            buffer,
            chunkHandler,
            lineIndex,
            true,
            totalBytesRead
          );
        }
        break;
      }

      totalBytesRead += value.length;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.length > 0) {
          // Only process non-empty lines
          await processChunk(
            line,
            chunkHandler,
            lineIndex,
            false,
            totalBytesRead
          );
          lineIndex++;
        }
      }
    }

    return accumulate ? buffer : undefined;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Processes a Response body as a stream with chunk processing.
 * Automatically detects if the response has a readable stream and processes it.
 *
 * @template Chunk - The type of chunk data
 * @param response - The Response object
 * @param config - The chunk processing configuration
 * @returns A promise that resolves with the processed result or the original response
 */
export async function processResponseStream<Chunk = string | Uint8Array>(
  response: Response,
  config: ChunkProcessingConfig<Chunk>
): Promise<Response | Chunk> {
  if (!response.body) {
    throw new Error("Response body is not available for streaming");
  }

  const processed = await processStream(response.body, config);

  // If accumulation is enabled, return the accumulated data
  // Otherwise, return the original response (chunks were processed via handler)
  if (config.accumulate && processed !== undefined) {
    return processed;
  }

  // Return a new Response with the processed data if needed
  // For now, return original response since chunks were handled via handler
  return response;
}

/**
 * Helper function to process a single chunk with the handler.
 *
 * @template Chunk - The type of chunk data
 * @param chunk - The chunk to process
 * @param handler - The chunk handler function
 * @param index - The chunk index
 * @param isLast - Whether this is the last chunk
 * @param totalBytesRead - Total bytes read so far
 */
async function processChunk<Chunk>(
  chunk: Chunk,
  handler: ChunkHandler<Chunk>,
  index: number,
  isLast: boolean,
  totalBytesRead: number
): Promise<void> {
  const result = handler(chunk, {
    index,
    isLast,
    totalBytesRead,
  });

  if (result instanceof Promise) {
    await result;
  }
}

/**
 * Checks if a value is a ReadableStream.
 *
 * @param value - The value to check
 * @returns True if the value is a ReadableStream
 */
export function isReadableStream(
  value: unknown
): value is ReadableStream<Uint8Array> {
  return (
    value !== null &&
    typeof value === "object" &&
    "getReader" in value &&
    typeof (value as ReadableStream).getReader === "function"
  );
}

/**
 * Checks if a Response has a readable body stream.
 *
 * @param response - The Response to check
 * @returns True if the response has a readable body stream
 */
export function hasReadableStream(response: Response): boolean {
  return response.body !== null && isReadableStream(response.body);
}
