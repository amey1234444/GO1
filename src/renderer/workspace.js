'use strict';
// Navigation changes presentation only; recording and model state stay owned by app.js.
const viewLabels = { home:'Overview', audio:'Transcription', guidance:'Live guidance', oa:'Image studio', insights:'Review & insights', settings:'Settings', materials:'Resumes & knowledge', roles:'Target roles', records:'Session records' };
function showWorkspaceView(view) {
  if (!Object.hasOwn(viewLabels, view)) return;
  const mode = view === 'oa' ? 'oa' : 'interview';
  if (workspaceMode !== mode) selectWorkspaceMode(mode);
  if (workspaceMode !== mode) return;
  for (const section of document.querySelectorAll('[data-workspace-view]')) section.hidden = section.dataset.workspaceView !== view;
  for (const button of document.querySelectorAll('[data-view]')) {
    const selected = button.dataset.view === view;
    button.classList.toggle('selected', selected);
    if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  }
  window.dispatchEvent(new CustomEvent('go1-workspace-view', { detail: view }));
  $('viewTitle').textContent = viewLabels[view];
  document.querySelector('.main').scrollTop = 0;
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => showWorkspaceView(button.dataset.view));
$('interviewModeTab').addEventListener('click', () => { if (workspaceMode === 'interview') showWorkspaceView('home'); });
$('oaModeTab').addEventListener('click', () => { if (workspaceMode === 'oa') showWorkspaceView('oa'); });
showWorkspaceView(workspaceMode === 'oa' ? 'oa' : 'home');
