'use strict';
(() => {
  let data = { roles: [], materials: [], records: [] }, selected = [], epoch = 0;
  const busy = () => state.privacyActive || state.recording || state.starting || state.stopping || state.busy;
  const node = (tag, content, cls) => { const n = document.createElement(tag); if (content !== undefined) n.textContent = content; if (cls) n.className = cls; return n; };
  const status = message => { if (!state.privacyActive) $('libraryStatus').textContent = message; };
  async function action(fn) {
    const ticket = epoch;
    if (state.privacyActive) return;
    try { await fn(ticket); } catch (error) { if (ticket === epoch) status(String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
  }
  function requireIdle() { if (busy()) throw new Error('Finish recording and processing before changing saved items.'); }
  function button(label, fn, cls = 'small-button') {
    const b = node('button', label, cls); b.type = 'button'; b.addEventListener('click', () => action(fn)); return b;
  }
  function removeButton(kind, row) {
    let armed = false;
    const b = button('Delete', async ticket => {
      requireIdle();
      if (!armed) { armed = true; b.textContent = 'Confirm delete'; b.setAttribute('aria-label', `Confirm delete ${row.title}`); return; }
      await window.go1.workspaceDelete(kind, row.id);
      if (ticket !== epoch) return;
      if (kind === 'materials') selected = selected.filter(id => id !== row.id);
      await refresh(); status('Deleted from this device.');
    }, 'small-button delete-button');
    b.addEventListener('blur', () => { armed = false; b.textContent = 'Delete'; }); return b;
  }
  function rowView(row, subtitle, buttons) {
    const rowNode = node('article', undefined, 'library-row'), info = node('div');
    info.append(node('h3', row.title), node('p', subtitle));
    const actions = node('div', undefined, 'row-actions'); actions.append(...buttons); rowNode.append(info, actions); return rowNode;
  }
  function empty(list, message) { if (!list.childElementCount) list.append(node('p', message, 'library-empty')); }
  function renderChoices() {
    const box = $('materialChoices'); box.replaceChildren();
    for (const row of data.materials) {
      const label = node('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = row.id; input.checked = selected.includes(row.id); input.disabled = busy();
      input.addEventListener('change', () => {
        if (input.checked && selected.length >= 8) { input.checked = false; status('Select at most eight materials.'); return; }
        selected = input.checked ? [...selected, row.id] : selected.filter(id => id !== row.id);
      }); label.append(input, node('span', row.title)); box.append(label);
    }
    if (!data.materials.length) box.append(node('p', 'Add resume details or knowledge notes from Resumes & knowledge.'));
  }
  function editMaterial(row) {
    requireIdle(); $('materialForm').hidden = false;
    $('materialId').value = row?.id || ''; $('materialTitle').value = row?.title || ''; $('materialType').value = row?.type || 'resume'; $('materialText').value = row?.text || ''; $('materialFile').value = ''; $('materialTitle').focus();
  }
  function render() {
    const materials = $('materialList'); materials.replaceChildren();
    for (const row of data.materials) materials.append(rowView(row, `${row.type === 'resume' ? 'Resume' : 'Knowledge'} · ${row.text.length.toLocaleString()} characters`, [button('Edit', () => editMaterial(row)), removeButton('materials', row)]));
    empty(materials, 'Your preparation starts here. Add a resume or a useful reference note.');
    const roles = $('roleList'); roles.replaceChildren();
    for (const row of data.roles) roles.append(rowView(row, `${row.profile.role} · ${row.profile.mode} · ${row.profile.language.toUpperCase()}`, [button('Use profile', async ticket => {
      requireIdle(); const profile = await window.go1.savePracticeProfile(row.profile); if (ticket !== epoch) return;
      populatePracticeProfile(profile); showWorkspaceView('home'); status(`Loaded ${row.title}. Recording remains off.`);
    }), button('Update from setup', async ticket => {
      requireIdle(); await window.go1.workspacePut('roles', { id: row.id, title: row.title, profile: practiceProfileFromForm() }); if (ticket !== epoch) return; await refresh(); status('Role updated.');
    }), removeButton('roles', row)]));
    empty(roles, 'No saved roles yet. Configure your session on Overview and save the setup here.');
    renderRecords(); renderChoices();
  }
  function renderRecords() {
    const list = $('recordList'); list.replaceChildren();
    const query = $('recordSearch').value.toLocaleLowerCase();
    for (const row of data.records.filter(x => `${x.title} ${x.result.text}`.toLocaleLowerCase().includes(query))) {
      list.append(rowView(row, `${new Date(row.updatedAt).toLocaleString()} · ${formatClock(row.result.durationMs)} · ${row.result.language}`, [button('Open', () => openRecord(row)), button('Export JSON', () => window.go1.save('json', JSON.stringify(row, null, 2))), removeButton('records', row)]));
    }
    empty(list, query ? 'No sessions match your search.' : 'No saved sessions yet. Finish a recording, then save its transcript here.');
  }
  function openRecord(row) {
    const detail = $('recordDetail'); detail.replaceChildren(node('h3', row.title), node('p', `${row.profile.role} · ${row.profile.model}`, 'microcopy'), node('pre', row.result.text));
    if (row.feedback) { detail.append(node('h4', 'Practice feedback'), node('pre', row.feedback)); }
    detail.hidden = false; detail.scrollIntoView({ block: 'nearest' });
  }
  async function refresh() {
    const ticket = epoch, next = await window.go1.workspaceList();
    if (ticket !== epoch || state.privacyActive) return;
    data = next; selected = selected.filter(id => data.materials.some(row => row.id === id)); render();
  }
  window.GO1Library = Object.freeze({ selectedIds: () => [...selected] });
  window.addEventListener('go1-profile-loaded', event => { selected = [...(event.detail?.materialIds || [])]; renderChoices(); });
  $('newMaterial').addEventListener('click', () => action(() => editMaterial()));
  $('cancelMaterial').addEventListener('click', () => { $('materialForm').reset(); $('materialForm').hidden = true; });
  $('materialFile').addEventListener('change', () => action(async ticket => {
    requireIdle(); const file = $('materialFile').files[0]; if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 100000) throw new Error('Choose a TXT or Markdown file up to 100 KB. Paste extracted text for other formats.');
    const text = await file.text(); if (ticket !== epoch) return;
    if (text.includes('\0')) throw new Error('This file is not plain text.');
    $('materialText').value = text; if (!$('materialTitle').value) $('materialTitle').value = file.name;
  }));
  $('materialForm').addEventListener('submit', event => { event.preventDefault(); void action(async ticket => {
    requireIdle(); await window.go1.workspacePut('materials', { id: $('materialId').value || undefined, title: $('materialTitle').value, type: $('materialType').value, text: $('materialText').value });
    if (ticket !== epoch) return; $('materialForm').reset(); $('materialForm').hidden = true; await refresh(); status('Material saved locally. Select it in Overview to include reference excerpts in AI guidance.');
  }); });
  $('saveRole').addEventListener('click', () => action(async ticket => {
    requireIdle(); const profile = practiceProfileFromForm();
    await window.go1.workspacePut('roles', { title: $('roleName').value.trim() || profile.role, profile });
    if (ticket !== epoch) return; $('roleName').value = ''; await refresh(); status('Role profile saved.');
  }));
  $('saveRecord').addEventListener('click', () => action(async ticket => {
    requireIdle(); if (!state.result?.text || state.result.isLive) throw new Error('Finish a recording or transcribe an audio file before saving.');
    // Persist the profile actually saved for the session, not unsaved edits.
    const profile = await window.go1.loadPracticeProfile(); if (ticket !== epoch) return;
    await window.go1.workspacePut('records', { title: $('recordTitle').value.trim() || `${profile.role} · ${new Date().toLocaleDateString()}`, result: state.result, profile, feedback: $('feedbackOutput').textContent });
    if (ticket !== epoch) return; $('recordTitle').value = ''; await refresh(); status('Completed transcript saved on this device.');
  }));
  $('recordSearch').addEventListener('input', renderRecords);
  window.addEventListener('go1-workspace-view', () => { if (!state.privacyActive) renderChoices(); });
  window.addEventListener('go1-workspace-mask', () => {
    epoch++; data = { roles: [], materials: [], records: [] }; selected = [];
    for (const id of ['materialList','roleList','recordList','recordDetail','materialChoices']) $(id).replaceChildren();
    $('materialForm').reset(); $('materialForm').hidden = true; $('recordDetail').hidden = true;
    for (const id of ['roleName','recordTitle','recordSearch']) $(id).value = '';
    $('libraryStatus').textContent = '';
  });
  async function initialize() { const ticket = epoch; const profile = await window.go1.loadPracticeProfile(); if (ticket !== epoch || state.privacyActive) return; selected = profile.materialIds || []; await refresh(); }
  window.addEventListener('go1-privacy-resumed', () => action(initialize));
  void action(initialize);
})();
