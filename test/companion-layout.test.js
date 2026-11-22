'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { companionBounds } = require('../src/companion/layout');
test('launch and expanded panel fit small and negative-origin displays', () => {
  for (const area of [{ x: 0, y: 24, width: 1280, height: 720 }, { x: -1024, y: 0, width: 1024, height: 768 }, { x: 0, y: 0, width: 400, height: 500 }]) {
    const bounds = companionBounds(area);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
  }
});
test('expanding a toolbar near the bottom keeps the panel inside the display', () => {
  const area = { x: -1440, y: 0, width: 1440, height: 900 };
  const bounds = companionBounds(area, false, { x: -50, y: 820 });
  assert.ok(bounds.x + bounds.width <= 0);
  assert.ok(bounds.y + bounds.height <= 900);
  assert.equal(companionBounds(area, true, bounds).height, 76);
});
