import assert from "node:assert/strict";
import test from "node:test";
import { parseBotComponentData } from "./botcomponents-service.js";

const descriptionOf = (value: string) =>
  parseBotComponentData(`kind: TaskDialog\nmodelDisplayName: Get order\nmodelDescription: ${value}\n`).modelDescription;

test("keeps the other quote character inside a quoted model description", () => {
  assert.equal(descriptionOf(`"Look up the customer's order"`), "Look up the customer's order");
  assert.equal(descriptionOf(`'Say "hello" to the user'`), `Say "hello" to the user`);
});

test("unescapes doubled single quotes and backslash escapes in quoted model descriptions", () => {
  assert.equal(descriptionOf(`'It''s here'`), "It's here");
  assert.equal(descriptionOf(String.raw`"Say \"hi\" now"`), `Say "hi" now`);
  assert.equal(descriptionOf(String.raw`"Folder C:\\temp\tthen\nnext line"`), "Folder C:\\temp\tthen\nnext line");
});

test("keeps plain and simple double-quoted model descriptions unchanged", () => {
  assert.equal(descriptionOf("Look up the customer's order"), "Look up the customer's order");
  assert.equal(descriptionOf(`"Get the order status"`), "Get the order status");
});

test("keeps both lines of a quoted model description that continues on the next line", () => {
  const description = descriptionOf(`"Look up the order\n  and return its status"`);
  assert.match(description ?? "", /^Look up the order\s+and return its status$/);
});

test("reads the top-level model description and keeps the other fields unchanged", () => {
  const data = [
    "kind: TaskDialog",
    "inputs:",
    "  - modelDescription: \"Nested input description\"",
    "modelDisplayName: Get order status",
    "modelDescription: 'Say \"hello\" to the user'",
    "triggerQueries:",
    "  - Where is my order",
    "  - Order status",
  ].join("\r\n");
  assert.deepEqual(parseBotComponentData(data), {
    modelDisplayName: "Get order status",
    modelDescription: `Say "hello" to the user`,
    triggerQueries: ["Where is my order", "Order status"],
  });
});
