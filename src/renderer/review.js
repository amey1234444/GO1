'use strict';
function showPracticeReview(data) {
  const text = document.getElementById('transcript');
  text.textContent = data.text || 'No transcript available';
  document.getElementById('language').textContent = data.language || 'Unknown';
  document.getElementById('duration').textContent = Math.round((data.durationMs || 0) / 1000) + ' seconds';
  document.getElementById('segmentCount').textContent = String(data.segments?.length || 0);
  const timeline = document.getElementById('segments');
  timeline.replaceChildren();
  for (const segment of data.segments || []) {
    const item = document.createElement('div'); item.className = 'segment';
    const stamp = document.createElement('time'); stamp.textContent = (segment.startMs / 1000).toFixed(1) + 's';
    const content = document.createElement('span'); content.textContent = segment.text;
    item.append(stamp, content); timeline.appendChild(item);
  }
}
window.practiceReview.onData(showPracticeReview);
