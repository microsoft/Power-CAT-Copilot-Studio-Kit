import assert from "node:assert/strict";
import test from "node:test";
import { fetchDiscoveryResponse, readBoundedDataverseRows } from "./dataverse.js";
import { ReviewError } from "./types.js";

const url = new URL("https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances");

test("retries a transient discovery connection failure once", async () => {
  let calls = 0;
  const waits: number[] = [];
  const response = await fetchDiscoveryResponse(
    url,
    {},
    async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(null, { status: 200 });
    },
    async (milliseconds) => {
      waits.push(milliseconds);
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [250]);
});

test("retries a retryable discovery response once", async () => {
  let calls = 0;
  const response = await fetchDiscoveryResponse(
    url,
    {},
    async () => {
      calls += 1;
      return new Response(null, { status: calls === 1 ? 503 : 200 });
    },
    async () => undefined,
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("does not retry a non-retryable discovery response", async () => {
  let calls = 0;
  const response = await fetchDiscoveryResponse(
    url,
    {},
    async () => {
      calls += 1;
      return new Response(null, { status: 401 });
    },
    async () => undefined,
  );

  assert.equal(response.status, 401);
  assert.equal(calls, 1);
});

test("surfaces repeated discovery connection failures as retryable", async () => {
  await assert.rejects(
    fetchDiscoveryResponse(
      url,
      {},
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => undefined,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ReviewError);
      assert.equal(error.code, "DISCOVERY_UNAVAILABLE");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

const origin = new URL("https://example.crm.dynamics.com");
const limits = { maxItems: 2, maxBytes: 1000 };
const errorCode = (code: string) => (error: unknown) => error instanceof ReviewError && error.code === code;

test("bounded reads consume every trusted page before returning", async () => {
  const next = `${origin.origin}/api/data/v9.2/conversationtranscripts?$skiptoken=2`;
  const paths: string[] = [];
  const rows = await readBoundedDataverseRows(origin, "conversationtranscripts", limits, async path => {
    paths.push(path);
    return new Response(JSON.stringify(paths.length === 1 ? { value: [1], "@odata.nextLink": next } : { value: [2] }));
  });
  assert.deepEqual(paths, ["conversationtranscripts", next]);
  assert.deepEqual(rows, [1, 2]);
});

test("bounded reads reject untrusted, repeated, and empty paging links", async () => {
  for (const next of ["https://untrusted.example/api/data/v9.2/rows", `${origin.origin}/outside`, `${origin.origin}/api/data/v9.2/conversationtranscripts`]) {
    let calls = 0;
    await assert.rejects(readBoundedDataverseRows(origin, "conversationtranscripts", limits, async () => {
      calls += 1;
      return new Response(JSON.stringify({ value: [1], "@odata.nextLink": next }));
    }), errorCode(next.endsWith("/conversationtranscripts") ? "INVALID_PAGING" : "UNTRUSTED_PAGING"));
    assert.equal(calls, 1);
  }
  await assert.rejects(readBoundedDataverseRows(origin, "conversationtranscripts", limits, async () =>
    new Response(JSON.stringify({ value: [], "@odata.nextLink": `${origin.origin}/api/data/v9.2/rows` }))), errorCode("INVALID_PAGING"));
});

test("bounded reads reject malformed pages and excess records without returning a partial result", async () => {
  for (const body of ["{", "null", '{"value":null}', '{"value":[],"@odata.nextLink":42}']) {
    await assert.rejects(readBoundedDataverseRows(origin, "conversationtranscripts", limits, async () => new Response(body)), errorCode("DATAVERSE_INVALID_RESPONSE"));
  }
  await assert.rejects(readBoundedDataverseRows(origin, "conversationtranscripts", limits, async () =>
    new Response('{"value":[1,2,3]}')), errorCode("DATA_LIMIT_EXCEEDED"));
  await assert.rejects(readBoundedDataverseRows(origin, "conversationtranscripts", { ...limits, maxBytes: 1024 * 1024 }, async () =>
    new Response(JSON.stringify({ value: Array.from({ length: 100000 }, () => 1) }))), errorCode("DATA_LIMIT_EXCEEDED"));
});

test("bounded reads enforce cumulative UTF-8 bytes and cancel an oversized stream", async () => {
  const text = JSON.stringify({ value: ["é"] });
  const bytes = Buffer.byteLength(text);
  assert.deepEqual(await readBoundedDataverseRows(origin, "rows", { ...limits, maxBytes: bytes }, async () => new Response(text)), ["é"]);
  await assert.rejects(readBoundedDataverseRows(origin, "rows", { ...limits, maxBytes: bytes - 1 }, async () => new Response(text)), errorCode("DATA_LIMIT_EXCEEDED"));
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(100))); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedDataverseRows(origin, "rows", { ...limits, maxBytes: 50 }, async () => new Response(stream)), errorCode("DATA_LIMIT_EXCEEDED"));
  assert.equal(cancelled, true);
  const pages = [
    JSON.stringify({ value: [1], "@odata.nextLink": `${origin.origin}/api/data/v9.2/rows?skip=2` }),
    JSON.stringify({ value: [2] }),
  ];
  const maxBytes = pages.reduce((sum, page) => sum + Buffer.byteLength(page), 0) - 1;
  let calls = 0;
  await assert.rejects(readBoundedDataverseRows(origin, "rows", { ...limits, maxBytes }, async () =>
    new Response(pages[calls++])), errorCode("DATA_LIMIT_EXCEEDED"));
  assert.equal(calls, 2);
});
