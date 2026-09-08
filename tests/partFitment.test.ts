import{test}from'node:test';import assert from'node:assert/strict';import{exactPartApplication}from'../src/lib/partFitment.js';
const source={manufacturer:'Sundance Spas',model:'Optima',model_year_start:2009,model_year_end:2018,component:'Pillow, packaged',variant:'880 Series'};
const request={manufacturer:'Sundance',model:'Optima',year:2011,component:'pillows'};
test('exact manufacturer, model and covered year qualify the cited pillow application',()=>assert.equal(exactPartApplication(source,request),true));
test('another manufacturer, similar model, outside year and missing year bounds cannot inherit fitment',()=>{for(const change of [{manufacturer:'Master Spas'},{model:'Optima XL'},{year:2019},{component:'control board'}])assert.equal(exactPartApplication(source,{...request,...change}),false);assert.equal(exactPartApplication({...source,model_year_end:null},request),false);});
test('a shared component word does not prove a different component',()=>assert.equal(exactPartApplication({...source,component:'Control panel'},{...request,component:'control board'}),false));
test('a substring inside another component word is not a fitment match',()=>{
 assert.equal(exactPartApplication({manufacturer:'Sundance',model:'Optima',model_year_start:2020,model_year_end:2026,component:'Pumpkin ornament'},{manufacturer:'Sundance',model:'Optima',year:2025,component:'pump'}),false);
});
