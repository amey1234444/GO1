'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WindowVisibility,registerVisibilityShortcut}=require('../src/privacy/visibility');
function window(visible=true,minimized=false){return {visible,minimized,dead:false,focused:true,
 isVisible(){return this.visible;},isMinimized(){return this.minimized;},isDestroyed(){return this.dead;},isFocused(){return this.focused;},
 hide(){this.visible=false;this.focused=false;},show(){this.visible=true;},showInactive(){this.visible=true;},focus(){this.focused=true;},
 minimize(){this.minimized=true;},restore(){this.minimized=false;}};}
test('visibility restores only prior windows, skips closed windows and retains minimized state',()=>{
 const a=window(),b=window(true,true),c=window(false),d=window();const windows=[a,b,c,d],v=new WindowVisibility(()=>windows);
 v.toggle();assert.ok(windows.every(w=>!w.visible));d.dead=true;v.toggle();
 assert.equal(a.visible,true);assert.equal(b.minimized,true);assert.equal(c.visible,false);assert.equal(d.visible,false);
});
test('hiding during screenshot capture prevents cleanup from revealing windows',()=>{
 const a=window(),v=new WindowVisibility(()=>[a]);const release=v.suspend();
 assert.equal(a.visible,false);v.toggle();release();release();assert.equal(a.visible,false);
 v.toggle();assert.equal(a.visible,true);assert.equal(v.suspended,0);
});
test('windows created during a hidden session are deferred until restore',()=>{
 const a=window(),windows=[a],v=new WindowVisibility(()=>windows);v.toggle();
 const b=window(false);windows.push(b);assert.equal(v.show(b),false);assert.equal(b.visible,false);
 v.toggle();assert.equal(a.visible,true);assert.equal(b.visible,true);
});
test('shortcut conflicts and registration errors are reported',()=>{
 assert.equal(registerVisibilityShortcut({register:()=>false},()=>{}),false);
 assert.equal(registerVisibilityShortcut({register:()=>{throw Error('busy');}},()=>{}),false);
});
