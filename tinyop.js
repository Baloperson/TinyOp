//    Copyright (C) 2026  R Balog
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, version 3 of the License
//
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
// tinyop.js v3.4 
// Added prototype pollution protection + coordinate validation
const VERSION=Symbol('version');

const safe=(o)=>Object.create(null,Object.getOwnPropertyDescriptors(o||{}));
const merge=(t,s)=>Object.entries(s||{}).forEach(([k,v])=>{if(!['__proto__','constructor','prototype'].includes(k))t[k]=v});

const _k=(f,key)=>{f._key=key;return f}
export const where={
eq:(k,v)=>_k(i=>i[k]===v,`eq:${k}:${v}`),ne:(k,v)=>i=>i[k]!==v,
gt:(k,v)=>_k(i=>i[k]>v,`gt:${k}:${v}`),gte:(k,v)=>_k(i=>i[k]>=v,`gte:${k}:${v}`),
lt:(k,v)=>_k(i=>i[k]<v,`lt:${k}:${v}`),lte:(k,v)=>_k(i=>i[k]<=v,`lte:${k}:${v}`),
in:(k,a)=>_k(i=>a.includes(i[k]),`in:${k}:${a}`),contains:(k,v)=>i=>String(i[k]).includes(v),
startsWith:(k,v)=>i=>String(i[k]).startsWith(v),endsWith:(k,v)=>i=>String(i[k]).endsWith(v),
exists:k=>i=>i[k]!==undefined,
and:(...fs)=>{const f=i=>fs.every(fn=>fn(i));const ks=fs.map(x=>x?._key);f._key=ks.every(Boolean)?`and(${ks})`:null;return f},
or:(...fs)=>{const f=i=>fs.some(fn=>fn(i));const ks=fs.map(x=>x?._key);f._key=ks.every(Boolean)?`or(${ks})`:null;return f}
}

export function createStore(o={}){
const items=new Map(),meta=new Map(),listeners=new Map(),idx={type:new Map(),spatial:new Map(),coords:new Map()}
let _id=0;const cfg={id:o.idGenerator||(()=>String(++_id)),types:o.types||new Set(),defs:o.defaults||{},grid:o.spatialGridSize||100}
meta.set('cfg',cfg)

const emit=(e,d)=>{const s=listeners.get(e);if(s?.size)s.forEach(cb=>{try{cb(d)}catch{}})}
const valid=(v,n)=>{if(v!=null&&(typeof v!=='number'||!Number.isFinite(v)))throw Error(`Invalid ${n}: ${v}`)}

const ui=(a,it,old)=>{
let t=idx.type.get(it.type)??idx.type.set(it.type,new Set()).get(it.type)
if(a=='add')t.add(it.id)
else if(a=='remove'){t.delete(it.id);if(!t.size)idx.type.delete(it.type)}
else if(a=='update'&&old?.type!==it.type){idx.type.get(old.type)?.delete(it.id);t.add(it.id)}
if(it.x!=null){const g=cfg.grid,cx=Math.floor(it.x/g),cy=Math.floor(it.y/g),k=cx*1e9+cy
idx.coords.set(it.id,{x:it.x,y:it.y})
if(a=='add'){if(!idx.spatial.has(k))idx.spatial.set(k,new Set());idx.spatial.get(k).add(it.id)}
else if(a=='remove'){idx.spatial.get(k)?.delete(it.id);idx.coords.delete(it.id)}
else if(a=='update'&&old){const ocx=Math.floor(old.x/g),ocy=Math.floor(old.y/g),ok=ocx*1e9+ocy
if(ok!==k){idx.spatial.get(ok)?.delete(it.id);if(!idx.spatial.has(k))idx.spatial.set(k,new Set());idx.spatial.get(k).add(it.id)}}}}

const w=(id,ch,o={})=>{
const now=Date.now(),old=items.get(id),changes=typeof ch=='function'?ch(old):ch
if(!old){
  if(changes.x!=null)valid(changes.x,'x');if(changes.y!=null)valid(changes.y,'y')
  const it=safe({id,created:now,modified:now,type:ch.type,...cfg.defs[ch.type],...changes})
  if(cfg.types.size&&!cfg.types.has(it.type))throw Error(`Invalid type: ${it.type}`)
  items.set(id,it);ui('add',it,null);qbump(it.type)
  if(!o.silent){emit('create',{id,item:it,old:null});emit('change',{type:'create',id,item:it})}
  meta.get('tx')?.at(-1)?.push({type:'create',id,old:null,new:safe(it)});return it
}
const inTx=!!meta.get('tx'),prev={type:old.type,x:old.x,y:old.y},snap=(!o.silent||inTx)?safe(old):null
if(changes.x!=null)valid(changes.x,'x');if(changes.y!=null)valid(changes.y,'y')
const nextType=changes.type||old.type
if(cfg.types.size&&!cfg.types.has(nextType))throw Error(`Invalid type: ${nextType}`)
merge(old,changes);old.modified=now
items.set(id,old);ui('update',old,prev);qbump(old.type)
if(!o.silent){emit('update',{id,item:old,old:snap});emit('change',{type:'update',id,item:old})}
meta.get('tx')?.at(-1)?.push({type:'update',id,old:snap,new:safe(old)});return old
}

const spatial=(type,x,y,max,p)=>{
valid(x,'x');valid(y,'y');if(!Number.isFinite(max))throw Error(`Invalid radius: ${max}`)
const ts=idx.type.get(type);if(!ts)return[]
const g=cfg.grid,m=max*max,minCX=Math.floor((x-max)/g),maxCX=Math.floor((x+max)/g)
const minCY=Math.floor((y-max)/g),maxCY=Math.floor((y+max)/g),cand=new Set()
for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)
  idx.spatial.get(cx*1e9+cy)?.forEach(id=>ts.has(id)&&cand.add(id))
const r=[];for(const id of cand){const p0=idx.coords.get(id);if(!p0)continue
const dx=p0.x-x,dy=p0.y-y,ds=dx*dx+dy*dy
if(ds<=m){const it=items.get(id);if(it&&(!p||p(it)))r.push({it,ds})}}
return r.sort((a,b)=>a.ds-b.ds).map(v=>v.it)
}

const versions=new Map(),Q=a=>({
all:()=>a,first:()=>a[0]||null,last:()=>a.at(-1)||null,count:()=>a.length,ids:()=>a.map(x=>x.id),
limit:n=>Q(a.slice(0,n)),offset:n=>Q(a.slice(n)),
sort:f=>Q([...a].sort((x,y)=>{const A=x[f]??0,B=y[f]??0;return A<B?-1:A>B?1:0}))
})

const qh=new Map(),qi=new Map(),MAX_QH=128
const qbump=t=>{qh.get(t)?.clear();for(const m of qi.values())m.delete(t)
const v=versions.get(t);if(v){v.version++;v.views.forEach(fn=>fn())}}

const view=(type,pred,opts={})=>{
let cache=null,ver=-1,{spatial:s,x,y,r,threshold=0}=opts
if(s){valid(x,'view x');valid(y,'view y');if(!Number.isFinite(r))throw Error(`Invalid radius: ${r}`)}
let v=versions.get(type)??versions.set(type,{version:0,views:new Set()}).get(type)
const invalidate=()=>{ver=-1};v.views.add(invalidate)
const compute=()=>s?near(type,x,y,r,pred).all():find(type,pred).all()
const get=()=>{if(ver!==v.version){cache=compute();ver=v.version}return cache}
get.recenter=(nx,ny)=>{if(!s)return;valid(nx,'x');valid(ny,'y')
if(threshold&&Math.hypot(nx-x,ny-y)<=threshold)return;x=nx;y=ny;if(v.version===ver)ver--}
get.destroy=()=>v.views.delete(invalidate);return get
}

const find=(t,p)=>{
const ck=p?._key??null
if(ck!=null){let hm=qh.get(t);if(hm){const q=hm.get(ck);if(q)return q}
const ts=idx.type.get(t),r=[];if(ts)for(const id of ts){const it=items.get(id);if(it&&(!p||p(it)))r.push(it)}
const q=Q(r);if(!hm){hm=new Map();qh.set(t,hm)}if(hm.size>=MAX_QH)hm.delete(hm.keys().next().value)
hm.set(ck,q);return q}
const rk=p||'__none__',m=qi.get(rk);if(m){const c=m.get(t);if(c)return c}
const ts=idx.type.get(t),r=[];if(ts)for(const id of ts){const it=items.get(id);if(it&&(!p||p(it)))r.push(it)}
const q=Q(r);if(!m){if(qi.size>=MAX_QH)qi.delete(qi.keys().next().value)
qi.set(rk,new Map().set(t,q))}else m.set(t,q);return q
}

const near=(t,x,y,d,p)=>{valid(x,'near x');valid(y,'near y');if(!Number.isFinite(d))throw Error(`Invalid distance: ${d}`);return Q(spatial(t,x,y,d,p))}
const get=id=>{const it=items.get(id);return it?safe(it):null}
const ref=id=>items.get(id)||null
const pick=(id,f)=>{const it=items.get(id);if(!it)return null;const o={};for(const k of f)if(!['__proto__','constructor','prototype'].includes(k)){const v=it[k];o[k]=v&&typeof v=='object'?structuredClone(v):v};return o}
const rm=id=>{const it=items.get(id);if(!it)return null;items.delete(id);ui('remove',it);qbump(it.type);emit('delete',{id,item:it});emit('change',{type:'delete',id,item:it});meta.get('tx')?.at(-1)?.push({type:'delete',id,item:safe(it)});return it}
const tx=fn=>{const t=meta.get('tx')||[];meta.set('tx',[...t,[]]);try{const r=fn();meta.set('tx',t);return r}catch(e){for(const op of meta.get('tx').pop().reverse()){if(op.type=='create'){items.delete(op.id);ui('remove',op.new)}else if(op.type=='update'){items.set(op.id,op.old);ui('update',op.old,op.new)}else{items.set(op.id,op.item);ui('add',op.item,null)}}meta.set('tx',t);throw e}}
const createOne=(t,p={})=>{if(p.x!=null)valid(p.x,'x');if(p.y!=null)valid(p.y,'y');return w(p.id||cfg.id(),{type:t,...cfg.defs[t],...p})}
const _batchUpdate=updates=>{const res=[];for(const{id,changes}of updates){if(changes.x!=null)valid(changes.x,'x');if(changes.y!=null)valid(changes.y,'y');const r=items.has(id)?w(id,changes,{silent:true}):null;if(r)res.push(r)}if(res.length){emit('batch',{op:'update',count:res.length});emit('change',{type:'batch',op:'update',count:res.length})}return res}
const _batchDelete=ids=>{const del=[];for(const id of ids){const it=items.get(id);if(!it)continue;items.delete(id);ui('remove',it);qbump(it.type);meta.get('tx')?.at(-1)?.push({type:'delete',id,item:safe(it)});del.push(it)}if(del.length){emit('batch',{op:'delete',count:del.length});emit('change',{type:'batch',op:'delete',count:del.length})}return del}

return{
create:createOne,createMany:(t,arr)=>arr.map(p=>createOne(t,p)),
update:(id,c)=>{if(c?.x!=null)valid(c.x,'x');if(c?.y!=null)valid(c.y,'y');return items.has(id)?w(id,c):null},
set:(id,f,v)=>{if(f=='x'||f=='y')valid(v,f);return items.has(id)?w(id,{[f]:v}):null},
increment:(id,f,b=1)=>{const it=items.get(id);return it?w(id,{[f]:(it[f]||0)+b}):null},
get,getRef:ref,pick,exists:id=>items.has(id),find,near,count:(t,p)=>find(t,p).count(),
delete:rm,deleteMany:ids=>_batchDelete(ids),
batch:{create:(t,arr)=>arr.map(p=>createOne(t,p)),update:_batchUpdate,delete:_batchDelete},
clear:()=>{const c=items.size;items.clear();idx.type.clear();idx.spatial.clear();idx.coords.clear();return c},
transaction:tx,
on:(e,cb)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(cb);return()=>listeners.get(e)?.delete(cb)},
once:(e,cb)=>{if(!listeners.has(e))listeners.set(e,new Set());let w=d=>{cb(d);listeners.get(e)?.delete(w)};listeners.get(e).add(w);return()=>listeners.get(e)?.delete(w)},
off:(e,cb)=>listeners.get(e)?.delete(cb),
dump:()=>Object.fromEntries([...items].map(([k,v])=>[k,safe(v)])),
stats:()=>({items:items.size,types:Object.fromEntries([...idx.type].map(([t,s])=>[t,s.size])),spatial:{cells:idx.spatial.size,coords:idx.coords.size},listeners:Object.fromEntries([...listeners].map(([e,s])=>[e,s.size]))}),
meta:{get:k=>meta.get(k),set:(k,v)=>meta.set(k,v),config:()=>({...cfg})},view
}
}
