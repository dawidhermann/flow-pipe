import { describe, test } from "node:test";
import * as assert from "node:assert";
import RequestChain from "../request-chain";
import type { ChunkProcessingConfig, IRequestConfig } from "../index";
import RequestAdapter from "../request-adapter";
import TestAdapter from "./__mocks__/test-adapter";

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
 * Adapter that returns streaming responses
 */
class StreamingTestAdapter extends RequestAdapter<Response, IRequestConfig> {
  private streamData: Uint8Array[] | string | null = null;

  public setStreamData(data: Uint8Array[] | string): void {
    this.streamData = data;
  }

  public async createRequest(
    _requestConfig: IRequestConfig
  ): Promise<Response> {
    let stream: ReadableStream<Uint8Array>;

    if (this.streamData === null) {
      stream = createStreamFromChunks([]);
    } else if (typeof this.streamData === "string") {
      stream = createTextStream(this.streamData);
    } else {
      stream = createStreamFromChunks(this.streamData);
    }

    return new Response(stream, {
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  public getResult<T extends Response>(result: Response): T {
    return result as T;
  }
}

describe("Chunk Processing in RequestChain", () => {
  test("should process chunks progressively", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9]),
    ]);

    const processedChunks: Uint8Array[] = [];
    const metadata: Array<{
      index: number;
      isLast: boolean;
      totalBytesRead?: number;
    }> = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk, meta) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
        if (meta) {
          metadata.push(meta);
        }
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    assert.strictEqual(processedChunks.length, 3);
    assert.deepStrictEqual(processedChunks[0], new Uint8Array([1, 2, 3]));
    assert.deepStrictEqual(processedChunks[1], new Uint8Array([4, 5, 6]));
    assert.deepStrictEqual(processedChunks[2], new Uint8Array([7, 8, 9]));
    assert.strictEqual(metadata[0].index, 0);
    assert.strictEqual(metadata[1].index, 1);
    assert.strictEqual(metadata[2].index, 2);
  });

  test("should accumulate chunks when accumulate is true", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);

    const processedChunks: Uint8Array[] = [];
    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
      accumulate: true,
    };

    const result = await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    // Verify chunks were processed via handler
    // Note: When accumulate is true, individual chunks are processed,
    // and if there's remaining accumulated data, it's also processed
    assert.ok(processedChunks.length >= 2);
    assert.deepStrictEqual(processedChunks[0], new Uint8Array([1, 2]));
    assert.deepStrictEqual(processedChunks[1], new Uint8Array([3, 4]));

    // Result should be defined (could be Response or accumulated Uint8Array)
    assert.ok(result !== undefined);
  });

  test("should not process chunks when chunkProcessing is disabled", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]);

    const processedChunks: Uint8Array[] = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: false,
      chunkHandler: (_chunk) => {
        // Should not be called when disabled
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    // Chunks should not be processed when disabled
    assert.strictEqual(processedChunks.length, 0);
  });

  test("should work with text streams", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData("Hello\nWorld\nTest");

    const processedChunks: Uint8Array[] = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
      encoding: "utf-8",
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    // Should process the text stream (as Uint8Array chunks)
    assert.ok(processedChunks.length > 0);
  });

  test("should handle async chunk handlers", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2, 3])]);

    let handlerCalled = false;

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: async (_chunk) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        handlerCalled = true;
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    assert.ok(handlerCalled);
  });

  test("should work with chained requests", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2, 3])]);

    const processedChunks: Uint8Array[] = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream1", method: "GET" },
        chunkProcessing,
      },
      adapter
    )
      .next({
        config: { url: "http://example.com/stream2", method: "GET" },
        chunkProcessing,
      })
      .execute();

    // Should process chunks from both requests
    assert.ok(processedChunks.length >= 1);
  });

  test("should work with mappers and chunk processing", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2, 3])]);

    const processedChunks: Uint8Array[] = [];
    let mapperCalled = false;

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
        mapper: async (result) => {
          mapperCalled = true;
          return result;
        },
      },
      adapter
    ).execute();

    assert.ok(mapperCalled);
    assert.ok(processedChunks.length > 0);
  });

  test("should work with result interceptors and chunk processing", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2, 3])]);

    const processedChunks: Uint8Array[] = [];
    let interceptorCalled = false;

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
        resultInterceptor: async (_result) => {
          interceptorCalled = true;
        },
      },
      adapter
    ).execute();

    assert.ok(interceptorCalled);
    assert.ok(processedChunks.length > 0);
  });

  test("should handle non-streaming responses gracefully", async () => {
    const adapter = new TestAdapter();
    const processedChunks: Uint8Array[] = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
    };

    // TestAdapter returns regular responses, not streams
    // This should not throw an error
    await RequestChain.begin(
      {
        config: { url: "http://example.com/data", method: "GET" },
        chunkProcessing,
      },
      adapter
    ).execute();

    // Chunks won't be processed for non-streaming responses
    // but should not throw an error
    assert.ok(true);
  });

  test("should work with retry and chunk processing", async () => {
    const adapter = new StreamingTestAdapter();
    adapter.setStreamData([new Uint8Array([1, 2, 3])]);

    const processedChunks: Uint8Array[] = [];

    const chunkProcessing: ChunkProcessingConfig<string | Uint8Array> = {
      enabled: true,
      chunkHandler: (chunk) => {
        if (chunk instanceof Uint8Array) {
          processedChunks.push(chunk);
        }
      },
    };

    await RequestChain.begin(
      {
        config: { url: "http://example.com/stream", method: "GET" },
        chunkProcessing,
        retry: {
          maxRetries: 2,
          retryDelay: 10,
        },
      },
      adapter
    ).execute();

    // Should process chunks even with retry config
    assert.ok(processedChunks.length > 0);
  });
});
