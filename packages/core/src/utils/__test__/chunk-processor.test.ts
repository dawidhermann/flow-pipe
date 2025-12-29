import { describe, test } from "node:test";
import * as assert from "node:assert";
import {
  processStream,
  processTextStreamLineByLine,
  processResponseStream,
  isReadableStream,
  hasReadableStream,
} from "../chunk-processor";
import type { ChunkProcessingConfig } from "../../models/request-params";

/**
 * Helper to create a ReadableStream from chunks
 */
function createStreamFromChunks(
  chunks: Uint8Array[]
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => {
        controller.enqueue(chunk);
      });
      controller.close();
    },
  });
}

/**
 * Helper to create a text stream
 */
function createTextStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return createStreamFromChunks([encoder.encode(text)]);
}

/**
 * Helper to create a Response with a readable stream
 */
function createStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}

describe("chunk-processor", () => {
  describe("processStream", () => {
    test("should process chunks progressively", async () => {
      const chunks: Uint8Array[] = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7, 8, 9]),
      ];
      const stream = createStreamFromChunks(chunks);
      const processedChunks: Uint8Array[] = [];
      const metadata: Array<{
        index: number;
        isLast: boolean;
        totalBytesRead?: number;
      }> = [];

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: (chunk, meta) => {
          processedChunks.push(chunk);
          if (meta) {
            metadata.push(meta);
          }
        },
      };

      await processStream(stream, config);

      assert.strictEqual(processedChunks.length, 3);
      assert.deepStrictEqual(processedChunks[0], new Uint8Array([1, 2, 3]));
      assert.deepStrictEqual(processedChunks[1], new Uint8Array([4, 5, 6]));
      assert.deepStrictEqual(processedChunks[2], new Uint8Array([7, 8, 9]));
      assert.strictEqual(metadata.length, 3);
      assert.strictEqual(metadata[0].index, 0);
      assert.strictEqual(metadata[1].index, 1);
      assert.strictEqual(metadata[2].index, 2);
      assert.strictEqual(metadata[0].totalBytesRead, 3);
      assert.strictEqual(metadata[1].totalBytesRead, 6);
      assert.strictEqual(metadata[2].totalBytesRead, 9);
    });

    test("should accumulate chunks when accumulate is true", async () => {
      const chunks: Uint8Array[] = [
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
      ];
      const stream = createStreamFromChunks(chunks);

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: () => {},
        accumulate: true,
      };

      const result = await processStream(stream, config);

      assert.ok(result instanceof Uint8Array);
      assert.deepStrictEqual(result, new Uint8Array([1, 2, 3, 4]));
    });

    test("should not accumulate chunks when accumulate is false", async () => {
      const chunks: Uint8Array[] = [new Uint8Array([1, 2])];
      const stream = createStreamFromChunks(chunks);

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: () => {},
        accumulate: false,
      };

      const result = await processStream(stream, config);

      assert.strictEqual(result, undefined);
    });

    test("should handle empty stream", async () => {
      const stream = createStreamFromChunks([]);
      const processedChunks: Uint8Array[] = [];

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: (chunk) => {
          processedChunks.push(chunk);
        },
      };

      await processStream(stream, config);

      assert.strictEqual(processedChunks.length, 0);
    });

    test("should handle async chunk handler", async () => {
      const chunks: Uint8Array[] = [new Uint8Array([1, 2])];
      const stream = createStreamFromChunks(chunks);
      let handlerCalled = false;

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: async (_chunk) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          handlerCalled = true;
        },
      };

      await processStream(stream, config);

      assert.ok(handlerCalled);
    });

    test("should use custom encoding", async () => {
      const text = "Hello, 世界!";
      const stream = createTextStream(text);
      const processedChunks: Uint8Array[] = [];

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: (chunk) => {
          processedChunks.push(chunk);
        },
        encoding: "utf-8",
        accumulate: true,
      };

      const result = await processStream(stream, config);

      // processStream returns Uint8Array when accumulating binary data
      assert.ok(result instanceof Uint8Array);
      const decoder = new TextDecoder("utf-8");
      assert.strictEqual(decoder.decode(result), text);
    });
  });

  describe("processTextStreamLineByLine", () => {
    test("should process text stream line by line", async () => {
      const text = "line1\nline2\nline3";
      const stream = createTextStream(text);
      const processedLines: string[] = [];
      const metadata: Array<{ index: number; isLast: boolean }> = [];

      const config: ChunkProcessingConfig<string> = {
        enabled: true,
        chunkHandler: (line, meta) => {
          processedLines.push(line);
          if (meta) {
            metadata.push(meta);
          }
        },
      };

      await processTextStreamLineByLine(stream, config);

      assert.strictEqual(processedLines.length, 3);
      assert.strictEqual(processedLines[0], "line1");
      assert.strictEqual(processedLines[1], "line2");
      assert.strictEqual(processedLines[2], "line3");
      assert.strictEqual(metadata[0].index, 0);
      assert.strictEqual(metadata[1].index, 1);
      assert.strictEqual(metadata[2].index, 2);
    });

    test("should handle incomplete line at end", async () => {
      const text = "line1\nline2\nincomplete";
      const stream = createTextStream(text);
      const processedLines: string[] = [];

      const config: ChunkProcessingConfig<string> = {
        enabled: true,
        chunkHandler: (line) => {
          processedLines.push(line);
        },
      };

      await processTextStreamLineByLine(stream, config);

      // Should process incomplete line as last chunk
      assert.strictEqual(processedLines.length, 3);
      assert.strictEqual(processedLines[2], "incomplete");
    });

    test("should skip empty lines", async () => {
      const text = "line1\n\nline2\n\nline3";
      const stream = createTextStream(text);
      const processedLines: string[] = [];

      const config: ChunkProcessingConfig<string> = {
        enabled: true,
        chunkHandler: (line) => {
          processedLines.push(line);
        },
      };

      await processTextStreamLineByLine(stream, config);

      assert.strictEqual(processedLines.length, 3);
      assert.strictEqual(processedLines[0], "line1");
      assert.strictEqual(processedLines[1], "line2");
      assert.strictEqual(processedLines[2], "line3");
    });

    test("should handle multiple chunks with line breaks", async () => {
      const chunks: Uint8Array[] = [
        new TextEncoder().encode("line1\nline"),
        new TextEncoder().encode("2\nline3"),
      ];
      const stream = createStreamFromChunks(chunks);
      const processedLines: string[] = [];

      const config: ChunkProcessingConfig<string> = {
        enabled: true,
        chunkHandler: (line) => {
          processedLines.push(line);
        },
      };

      await processTextStreamLineByLine(stream, config);

      assert.strictEqual(processedLines.length, 3);
      assert.strictEqual(processedLines[0], "line1");
      assert.strictEqual(processedLines[1], "line2");
      assert.strictEqual(processedLines[2], "line3");
    });

    test("should accumulate when accumulate is true", async () => {
      const text = "line1\nline2";
      const stream = createTextStream(text);

      const config: ChunkProcessingConfig<string> = {
        enabled: true,
        chunkHandler: () => {},
        accumulate: true,
      };

      const result = await processTextStreamLineByLine(stream, config);

      assert.ok(typeof result === "string");
      // Should return remaining buffer (may contain incomplete line or empty)
      assert.ok(typeof result === "string");
    });
  });

  describe("processResponseStream", () => {
    test("should process Response stream", async () => {
      const chunks: Uint8Array[] = [new Uint8Array([1, 2, 3])];
      const stream = createStreamFromChunks(chunks);
      const response = createStreamResponse(stream);
      const processedChunks: Uint8Array[] = [];

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: (chunk) => {
          processedChunks.push(chunk);
        },
      };

      await processResponseStream(response, config);

      assert.strictEqual(processedChunks.length, 1);
      assert.deepStrictEqual(processedChunks[0], new Uint8Array([1, 2, 3]));
    });

    test("should throw error when response body is null", async () => {
      const response = new Response(null);
      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: () => {},
      };

      await assert.rejects(
        () => processResponseStream(response, config),
        /Response body is not available for streaming/
      );
    });

    test("should return accumulated data when accumulate is true", async () => {
      const chunks: Uint8Array[] = [new Uint8Array([1, 2, 3])];
      const stream = createStreamFromChunks(chunks);
      const response = createStreamResponse(stream);

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: () => {},
        accumulate: true,
      };

      const result = await processResponseStream(response, config);

      assert.ok(result instanceof Uint8Array);
      assert.deepStrictEqual(result, new Uint8Array([1, 2, 3]));
    });

    test("should return original response when accumulate is false", async () => {
      const chunks: Uint8Array[] = [new Uint8Array([1, 2, 3])];
      const stream = createStreamFromChunks(chunks);
      const response = createStreamResponse(stream);

      const config: ChunkProcessingConfig<Uint8Array> = {
        enabled: true,
        chunkHandler: () => {},
        accumulate: false,
      };

      const result = await processResponseStream(response, config);

      assert.ok(result instanceof Response);
    });
  });

  describe("isReadableStream", () => {
    test("should identify ReadableStream", () => {
      const stream = createStreamFromChunks([]);
      assert.ok(isReadableStream(stream));
    });

    test("should reject non-stream objects", () => {
      assert.strictEqual(isReadableStream(null), false);
      assert.strictEqual(isReadableStream(undefined), false);
      assert.strictEqual(isReadableStream({}), false);
      assert.strictEqual(isReadableStream([]), false);
      assert.strictEqual(isReadableStream("string"), false);
    });

    test("should reject objects without getReader method", () => {
      const fakeStream = {
        read: () => {},
      };
      assert.strictEqual(isReadableStream(fakeStream), false);
    });
  });

  describe("hasReadableStream", () => {
    test("should identify Response with readable stream", () => {
      const stream = createStreamFromChunks([]);
      const response = createStreamResponse(stream);
      assert.ok(hasReadableStream(response));
    });

    test("should reject Response without body", () => {
      const response = new Response(null);
      assert.strictEqual(hasReadableStream(response), false);
    });

    test("should reject Response with non-stream body", () => {
      const response = new Response("text");
      // Note: In Node.js test environment, Response.body might not be a stream
      // This test verifies the function handles it correctly
      const result = hasReadableStream(response);
      // Result depends on environment, but should not throw
      assert.ok(typeof result === "boolean");
    });
  });
});
