import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { MAX_IMPORT_BYTES } from "@/lib/import/limits";
import { readUploadedFile } from "@/lib/import/upload";

const URL_ = "http://localhost/api/documents/import";

function multipart(file?: File | string, field = "file") {
  const form = new FormData();
  if (file !== undefined) form.append(field, file);
  return new Request(URL_, { method: "POST", body: form });
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe("readUploadedFile", () => {
  it("returns the file name and bytes", async () => {
    const file = new File([new Uint8Array([104, 105])], "Hello World.txt", { type: "text/plain" });
    const { name, data } = await readUploadedFile(multipart(file));
    expect(name).toBe("Hello World.txt");
    expect([...data]).toEqual([104, 105]);
  });

  it("rejects a request without the file field (400)", async () => {
    const err = await failure(readUploadedFile(multipart(undefined)));
    expect(err.status).toBe(400);
    expect(err.code).toBe("no_file");
  });

  it("rejects a file sent under another field name (400)", async () => {
    const err = await failure(readUploadedFile(multipart(new File(["x"], "a.txt"), "document")));
    expect(err.status).toBe(400);
  });

  it("rejects a plain string in the file field (400)", async () => {
    const err = await failure(readUploadedFile(multipart("just text")));
    expect(err.status).toBe(400);
    expect(err.code).toBe("no_file");
  });

  it("rejects non-multipart requests (400)", async () => {
    const json = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await failure(readUploadedFile(json))).status).toBe(400);
    expect((await failure(readUploadedFile(new Request(URL_, { method: "POST" })))).status).toBe(400);
  });

  it("rejects a malformed multipart body (400, not a crash)", async () => {
    const bad = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=xyz" },
      body: "this is not multipart",
    });
    expect((await failure(readUploadedFile(bad))).status).toBe(400);
  });

  it("rejects a file over 2 MB with 413", async () => {
    const big = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "big.txt");
    const err = await failure(readUploadedFile(multipart(big)));
    expect(err.status).toBe(413);
    expect(err.code).toBe("file_too_large");
  });

  it("accepts a file of exactly 2 MB (the type/size checks live in parseImport)", async () => {
    const exact = new File([new Uint8Array(MAX_IMPORT_BYTES)], "exact.txt");
    expect((await readUploadedFile(multipart(exact))).data.byteLength).toBe(MAX_IMPORT_BYTES);
  });

  it("refuses an oversized body from Content-Length alone, without reading it", async () => {
    // This stream never produces data: if the helper tried to read it, this test would hang.
    const body = new ReadableStream<Uint8Array>({ pull() {} });
    const req = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(50 * 1024 * 1024) },
      body,
      duplex: "half",
    } as RequestInit);
    expect((await failure(readUploadedFile(req))).status).toBe(413);
  });

  function chunkedRequest(totalChunks: number, onPull: () => void) {
    const chunk = new Uint8Array(256 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        onPull();
        controller.enqueue(chunk);
        if (++sent >= totalChunks) controller.close();
      },
    });
    return new Request(URL_, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
  }

  it("drains a moderately oversized chunked body (so the client gets a clean 413), keeping nothing", async () => {
    let pulls = 0;
    const err = await failure(readUploadedFile(chunkedRequest(40, () => pulls++))); // 10 MB: over the cap, under the drain limit
    expect(err.status).toBe(413);
    expect(pulls).toBeGreaterThanOrEqual(40); // it was read to the end...
  });

  it("stops reading a chunked body once it exceeds the drain limit", async () => {
    let pulls = 0;
    const err = await failure(readUploadedFile(chunkedRequest(400, () => pulls++))); // would be 100 MB
    expect(err.status).toBe(413);
    expect(pulls).toBeLessThan(100); // ...but not to the end: roughly DRAIN_LIMIT_BYTES / 256 KB = 64 chunks
  });
});
