import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import test from "node:test";
import { createServer } from "../server.js";

const resourceResponseBudget = 1_000_000;

test("widget resource responses stay within the 1 MB engineering budget", async () => {
  const server = createServer();
  const client = new Client({ name: "widget-delivery-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { resources } = await client.listResources();
    assert.equal(resources.length, 5);
    for (const resource of resources) {
      const result = await client.readResource({ uri: resource.uri });
      const bytes = Buffer.byteLength(JSON.stringify({
        jsonrpc: "2.0", id: 1, result,
      }), "utf8");
      assert.ok(
        bytes <= resourceResponseBudget,
        `${resource.uri}: ${bytes} bytes exceed the ${resourceResponseBudget}-byte engineering budget; this is not a published Microsoft limit`,
      );
      assert.equal(result.contents.length, 1);
      assert.equal(result.contents[0].mimeType, "text/html;profile=mcp-app");
      assert.equal(result.contents[0].uri, resource.uri);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
