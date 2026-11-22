'use strict';
const EXPANDED = { width: 780, height: 540 };
const COMPACT_HEIGHT = 76;
function companionBounds(area, compact = false, current) {
  const margin = Math.min(12, Math.floor(Math.min(area.width, area.height) / 4));
  const width = Math.min(EXPANDED.width, Math.max(1, area.width - margin * 2));
  const height = Math.min(compact ? COMPACT_HEIGHT : EXPANDED.height, Math.max(1, area.height - margin * 2));
  const x = current?.x ?? area.x + (area.width - width) / 2;
  const y = current?.y ?? area.y + 24;
  return { width, height,
    x: Math.round(Math.max(area.x + margin, Math.min(x, area.x + area.width - width - margin))),
    y: Math.round(Math.max(area.y + margin, Math.min(y, area.y + area.height - height - margin))) };
}
function companionPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const bounds = input.bounds;
  const validBounds = bounds && ['x', 'y', 'width', 'height'].every(key =>
    Number.isFinite(bounds[key]) && Math.abs(bounds[key]) <= 100000) && bounds.width > 0 && bounds.height > 0;
  return {
    compact: input.compact === true,
    surfaceOpacity: Number.isFinite(input.surfaceOpacity) && input.surfaceOpacity >= .58 && input.surfaceOpacity <= 1 ? input.surfaceOpacity : .86,
    bounds: validBounds ? Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(bounds[key])])) : null
  };
}
module.exports = { companionBounds, companionPreferences, EXPANDED, COMPACT_HEIGHT };
