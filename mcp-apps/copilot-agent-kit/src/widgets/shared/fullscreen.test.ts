import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INLINE_HEIGHT_BUDGET,
  fullscreenHeight,
  fullscreenOffered,
  inlineContentHeight,
  inlineHeightBudget,
} from "./fullscreen";

test("uses the available screen height when the fullscreen iframe is still short", () => {
  assert.equal(fullscreenHeight({ height: 444 }, 1040), "1040px");
});

test("the inline budget uses the host height, then its maximum height, then 600 px", () => {
  assert.equal(inlineHeightBudget({ width: 760, height: 480, maxHeight: 900 }), 480);
  assert.equal(inlineHeightBudget({ width: 760, maxHeight: 500 }), 500);
  assert.equal(inlineHeightBudget({ width: 760 }), DEFAULT_INLINE_HEIGHT_BUDGET);
  assert.equal(inlineHeightBudget(undefined), 600);
  assert.equal(inlineHeightBudget({ maxHeight: 0 }), 600);
});

test("the inline content height removes the frame inset and never forces a minimum", () => {
  assert.equal(inlineContentHeight({ maxHeight: 500 }, 48), 452);
  assert.equal(inlineContentHeight({ maxHeight: 40 }, 48), 0);
  assert.equal(inlineContentHeight(undefined, 48), 552);
});

test("fullscreen is offered unless the host lists its modes without it", () => {
  assert.equal(fullscreenOffered(undefined), true);
  assert.equal(fullscreenOffered({}), true);
  assert.equal(fullscreenOffered({ availableDisplayModes: ["inline", "fullscreen"] }), true);
  assert.equal(fullscreenOffered({ availableDisplayModes: ["inline"] }), false);
});