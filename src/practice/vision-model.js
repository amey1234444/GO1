'use strict';
const BASE='http://127.0.0.1:11434';
async function requireLocalVisionModel(model,{fetchImpl=fetch,signal}={}) {
  const response=await fetchImpl(BASE+'/api/tags',{signal});
  if(!response.ok)throw new Error('Could not inspect local Ollama models.');
  const list=await response.json();
  const canonical=model.includes(':')?model:model+':latest';
  const entry=list.models?.find(item=>item.name===model || item.name===canonical);
  if(!entry)throw new Error('Install this vision model in Ollama first.');
  if(entry.remote_model || entry.remote_host || /(?:^|[-:])cloud(?:$|[-:])/i.test(model))throw new Error('Choose a local model; cloud-backed image analysis is not enabled.');
  const details=await fetchImpl(BASE+'/api/show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model}),signal});
  if(!details.ok)throw new Error('Could not inspect the selected model.');
  const info=await details.json();
  if(!info.capabilities?.includes('vision'))throw new Error('This model does not report image support. Select an installed vision model.');
}
module.exports={requireLocalVisionModel};
