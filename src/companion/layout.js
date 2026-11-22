'use strict';
const EXPANDED = { width: 780, height: 540 };
const COMPACT_HEIGHT = 76;
function companionBounds(area, compact = false, current) {
  const margin = 12;
  const width = Math.min(EXPANDED.width, Math.max(1, area.width - margin * 2));
  const height = Math.min(compact ? COMPACT_HEIGHT : EXPANDED.height, Math.max(1, area.height - margin * 2));
  const x = current?.x ?? area.x + (area.width - width) / 2;
  const y = current?.y ?? area.y + 24;
  return { width, height,
    x: Math.round(Math.max(area.x + margin, Math.min(x, area.x + area.width - width - margin))),
    y: Math.round(Math.max(area.y + margin, Math.min(y, area.y + area.height - height - margin))) };
}
module.exports = { companionBounds, EXPANDED, COMPACT_HEIGHT };
