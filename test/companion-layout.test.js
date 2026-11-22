'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { companionBounds, companionPreferences } = require('../src/companion/layout');
test('launch and expanded panel fit small and negative-origin displays', () => {
  for (const area of [{ x: 0, y: 24, width: 1280, height: 720 }, { x: -1024, y: 0, width: 1024, height: 768 }, { x: 0, y: 0, width: 400, height: 500 }]) {
    const bounds = companionBounds(area);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
  }
});
test('invalid stored appearance is discarded and tiny work areas remain bounded', () => {
  for (const value of [null, 'bad', { compact: 'true', surfaceOpacity: Infinity, bounds: { x: NaN, y: 4, width: 780, height: 540 } }, { surfaceOpacity: .1, bounds: { x: 0, y: 0, width: -1, height: 540 } }]) {
    assert.deepEqual(companionPreferences(value), { compact: false, surfaceOpacity: .86, bounds: null });
  }
  const b = companionBounds({ x: 0, y: 0, width: 10, height: 8 }, false, { x: 9000, y: -9000 });
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 10 && b.y + b.height <= 8);
});
test('expanding a toolbar near the bottom keeps the panel inside the display', () => {
  const area = { x: -1440, y: 0, width: 1440, height: 900 };
  const bounds = companionBounds(area, false, { x: -50, y: 820 });
  assert.ok(bounds.x + bounds.width <= 0);
  assert.ok(bounds.y + bounds.height <= 900);
  assert.equal(companionBounds(area, true, bounds).height, 76);
});
