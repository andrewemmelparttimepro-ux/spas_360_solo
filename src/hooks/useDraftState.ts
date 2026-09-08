import { useState, useCallback, type SetStateAction, type Dispatch } from 'react';

const PREFIX = 'spas:draft:v1:';
const MAX_AGE = 24 * 60 * 60 * 1000;

export function clearDrafts(scope?: string) {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX + (scope ? `${scope}:` : ''))) sessionStorage.removeItem(key);
    }
  } catch { /* Restricted storage must not prevent saving or signing out. */ }
}

/** Per-user, per-tab recovery only. Never restores credentials or submits work. */
export function useDraftState<T>(scope: string, field: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const key = `${PREFIX}${scope}:${field}`;
  const readInitial=():T=>{
    try {
      const stored=JSON.parse(sessionStorage.getItem(key)||'null');
      const age=Date.now()-stored?.at;
      if(stored && Number.isFinite(age) && age>=0 && age<MAX_AGE)return stored.value as T;
      sessionStorage.removeItem(key);
    }catch{/* Restricted or malformed storage uses the form default. */}
    return typeof initial==='function'?(initial as ()=>T)():initial;
  };
  const [state,setState]=useState<{key:string;value:T}>(()=>({key,value:readInitial()}));
  // React resets this hook's value before committing a render for another
  // account/record. A previous customer's draft must never appear there.
  let value=state.value;
  if(state.key!==key){value=readInitial();setState({key,value});}
  const update:Dispatch<SetStateAction<T>>=useCallback(next=>{
    setState(previous=>{
      const old=previous.key===key?previous.value:readInitial();
      const result=typeof next==='function'?(next as (previous:T)=>T)(old):next;
      try{sessionStorage.setItem(key,JSON.stringify({value:result,at:Date.now()}));}catch{/* The live form still works. */}
      return {key,value:result};
    });
  },[key]);
  return [value, update];
}
