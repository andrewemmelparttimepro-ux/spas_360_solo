// @ts-check
/** @typedef {{manufacturer:string,model:string,model_year_start:number|null,model_year_end:number|null,component:string,variant?:string|null}} PartApplication */
const normalize=(value)=>value.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const brand=(value)=>normalize(value).replace(/\bspas?\b/g,'').trim();
/** @param {PartApplication} row @param {{manufacturer:string,model:string,year:number,component:string}} request */
export function exactPartApplication(row,request){
 if(brand(row.manufacturer)!==brand(request.manufacturer)||normalize(row.model)!==normalize(request.model))return false;
 if(row.model_year_start===null||row.model_year_end===null||request.year<row.model_year_start||request.year>row.model_year_end)return false;
 const words=normalize(request.component).split(' ').map(word=>word.replace(/s$/,''));
 const tokens=new Set(normalize(row.component+' '+(row.variant??'')).split(' ').map(word=>word.replace(/s$/,'')));
 return words.length>0&&words.every(word=>word.length>1&&tokens.has(word));
}
