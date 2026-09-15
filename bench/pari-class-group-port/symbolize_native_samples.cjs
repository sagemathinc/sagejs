"use strict";
// Offline Linux ELF attribution. Never executes a sampled binary.
const fs = require("node:fs");
const {spawnSync} = require("node:child_process");
const assert = require("node:assert/strict");
const {createHash}=require("node:crypto");

function mappings(text) {
  return text.split("\n").flatMap(line => {
    const m = /^([0-9a-f]+)-([0-9a-f]+)\s+(\S+)\s+([0-9a-f]+)\s+\S+\s+\d+\s*(.*)$/.exec(line);
    return m ? [{start:BigInt("0x"+m[1]), end:BigInt("0x"+m[2]),
      permissions:m[3], offset:BigInt("0x"+m[4]), path:m[5]}] : [];
  });
}
function loads(text) {
  return text.split("\n").flatMap(line => {
    const m = /^\s*LOAD\s+(0x[0-9a-f]+)\s+(0x[0-9a-f]+)\s+0x[0-9a-f]+\s+(0x[0-9a-f]+)/i.exec(line);
    return m ? [{offset:BigInt(m[1]), address:BigInt(m[2]), bytes:BigInt(m[3])}] : [];
  });
}
function symbols(text) {
  return text.split("\n").flatMap(line => {
    const m = /^([0-9a-f]+)\s+([0-9a-f]+)\s+([tTwW])\s+(.+)$/.exec(line.trim());
    return m ? [{address:BigInt("0x"+m[1]), bytes:BigInt("0x"+m[2]), name:m[4]}] : [];
  });
}
function virtualAddress(pc, mapping, segments, page) {
  // PT_LOAD virtual addresses need not equal file offsets (notably ET_EXEC).
  const matches = segments.filter(s => s.bytes > 0n &&
    mapping.offset >= s.offset / page * page &&
    mapping.offset < (s.offset + s.bytes + page - 1n) / page * page);
  const addresses = [...new Set(matches.map(s =>
    String(pc - mapping.start + mapping.offset + s.address - s.offset)))];
  return addresses.length === 1 ? BigInt(addresses[0]) : null;
}
function containing(address, list) {
  let lo=0, hi=list.length;
  while (lo<hi) {const mid=(lo+hi)>>1; if(list[mid].address<=address)lo=mid+1;else hi=mid;}
  // Aliases can share an address. A sized symbol must actually contain the PC.
  if (!lo) return null;
  const start=list[lo-1].address;
  for(let i=lo-1;i>=0&&list[i].address===start;i--)
    if(list[i].bytes>0n&&address<list[i].address+list[i].bytes)return list[i];
  return null;
}
function command(name,args) {
  const r=spawnSync(name,args,{encoding:"utf8",timeout:30000,maxBuffer:32*1024*1024});
  return r.status===0 ? r.stdout : null;
}
function summarize(input, inspect) {
  const map=mappings(input.maps), page=BigInt(input.pageSize || 4096);
  assert(page>0n && (page & (page-1n))===0n,"invalid page size");
  const cache=new Map(), groups=new Map(); let total=0,resolved=0;
  for(const run of input.runs) for(const value of run.samples) {
    assert(/^0x[0-9a-f]+$/i.test(value),"invalid PC");
    const pc=BigInt(value); total++;
    const m=map.find(x=>pc>=x.start&&pc<x.end&&x.permissions.includes("x"));
    let name="<unmapped>", file=m?.path || "", offset=null;
    if(m) {
      name="<unresolved>";
      if(file.startsWith("/")&&!file.endsWith(" (deleted)")) {
        if(!cache.has(file)) {
          const inspected=inspect(file);
          const expected=input.binarySha256?.[file];
          if(expected)assert.equal(inspected?.sha256,expected,"sampled ELF identity mismatch: "+file);
          cache.set(file,inspected);
        }
        const data=cache.get(file);
        if(data) {
          const address=virtualAddress(pc,m,data.loads,page);
          if(address!==null) {
            offset="0x"+address.toString(16);
            const symbol=containing(address,data.symbols);
            if(symbol) {name=symbol.name;resolved++;}
          }
        }
      }
    }
    const key=JSON.stringify([file,name]);
    if(!groups.has(key))groups.set(key,{file,name,samples:0,exampleVirtualAddress:offset});
    groups.get(key).samples++;
  }
  return {qualifiedTiming:false,attribution:"exclusive sampled PCs, not inclusive call stacks",
    totalSamples:total,resolvedSamples:resolved,unresolvedSamples:total-resolved,
    binaries:[...cache.entries()].map(([file,data])=>({file,sha256:data?.sha256||null,
      matchesRecordedHash:!!input.binarySha256?.[file] && data?.sha256===input.binarySha256[file]})),
    runs:input.runs.map(({samples,...rest})=>({...rest,sampleCount:samples.length})),
    functions:[...groups.values()].sort((a,b)=>b.samples-a.samples).map(g=>
      ({...g,percentOfAllSamples:total?100*g.samples/total:0}))};
}
function inspect(file) {
  const elf=command("readelf",["-W","-l",file]); if(!elf)return null;
  const normal=command("nm",["-n","-S","--defined-only",file])||"";
  const dynamic=command("nm",["-D","-n","-S","--defined-only",file])||"";
  const list=symbols(normal+"\n"+dynamic).sort((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
  return {loads:loads(elf),symbols:list,sha256:createHash("sha256").update(fs.readFileSync(file)).digest("hex")};
}
if(require.main===module) {
  const result=summarize(JSON.parse(fs.readFileSync(process.argv[2],"utf8")),inspect);
  const json=JSON.stringify(result,null,2)+"\n";
  if(process.argv[3])fs.writeFileSync(process.argv[3],json,{flag:"wx"});
  else process.stdout.write(json);
}
module.exports={mappings,loads,symbols,virtualAddress,containing,summarize};
