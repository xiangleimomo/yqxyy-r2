// Read published alignment from R2 at request time.
module.exports=async function alignmentFor(course){
  if(!/^movie-[a-z0-9-]{1,100}$/.test(course))return null;
  const {getObject}=await import('../../lib/r2.mjs');
  const response=await getObject(`data/${course}/alignment.json`);
  if(response.status===404){await response.body?.cancel();return null;}
  if(!response.ok){await response.body?.cancel();throw new Error('Alignment unavailable');}
  const alignment=await response.json();
  return alignment?.subtitleSource?.download&&Array.isArray(alignment.chapters)?alignment:null;
};
