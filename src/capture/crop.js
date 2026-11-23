'use strict';
// Pure coordinate mapping shared by the renderer and regression tests.
(function(root) {
  function imageCrop(start, end, display, image) {
    if (![start.x,start.y,end.x,end.y,display.width,display.height,image.width,image.height].every(Number.isFinite) || display.width<=0 || display.height<=0 || image.width<=0 || image.height<=0) throw new Error('Invalid crop dimensions.');
    const clamp=(v,max)=>Math.max(0,Math.min(max,v));
    const x1=clamp(Math.min(start.x,end.x),display.width), y1=clamp(Math.min(start.y,end.y),display.height);
    const x2=clamp(Math.max(start.x,end.x),display.width), y2=clamp(Math.max(start.y,end.y),display.height);
    if (x2-x1<3 || y2-y1<3) return null;
    const x=Math.floor(x1*image.width/display.width),y=Math.floor(y1*image.height/display.height);
    const right=Math.min(image.width,Math.ceil(x2*image.width/display.width)),bottom=Math.min(image.height,Math.ceil(y2*image.height/display.height));
    return {x,y,width:right-x,height:bottom-y};
  }
  if (typeof module==='object' && module.exports) module.exports={imageCrop};
  else root.GO1Crop={imageCrop};
})(typeof window!=='undefined'?window:globalThis);
