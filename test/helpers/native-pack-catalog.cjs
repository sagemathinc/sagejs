"use strict";
// Metadata-only artifacts for closure validation; never executable native code.
const fs=require("node:fs"), path=require("node:path"), {createHash}=require("node:crypto");
const layout=require("../../tools/native-pack-layout.js");
function nativePackCatalog(root) {
  const directory=path.join(root,"dist/native-kernels");
  const index={schema:layout.SCHEMA,complete:true,expectedKernels:2,packs:[],sources:{},logicalSources:{}};
  const rows=[
    {logical:"sagejs/number_fields/cubic_class_number_native.py",pack:"8".repeat(64),cache:"7".repeat(64)},
    {logical:"sagejs/numerics/statistics/_packed.py",pack:"9".repeat(64),cache:"6".repeat(64)},
  ];
  for (const row of rows) {
    row.record={cacheKey:row.cache,packKey:row.pack,sourceHash:"5".repeat(64),nativeAbi:23,
      foreignDeclarations:[{dynamicPackage:"@sagemath/sagejs-flint",declarationIdentity:"flint@"+"6".repeat(64)}]};
    index.logicalSources[row.logical]=row.record;
    index.sources[path.join(root,"src/lib",row.logical)]=row.record;
    row.addon=path.join(directory,layout.packDirectory(row.pack),"pack",layout.PACK_FILENAME);
    fs.mkdirSync(path.dirname(row.addon),{recursive:true});
    fs.writeFileSync(row.addon,"metadata-only native fixture "+row.logical);
    const wrapper=path.join(directory,layout.modulePath(row.record));
    fs.mkdirSync(path.dirname(wrapper),{recursive:true});
    fs.writeFileSync(wrapper,"module.exports = {};\n");
  }
  function authenticate() {
    index.packs=[];
    for (const row of rows) {
      const bytes=fs.readFileSync(row.addon),digest=createHash("sha256").update(bytes).digest("hex");
      const descriptor={packKey:row.pack,packAbi:1,nativeAbi:23,bytes:bytes.length,sha256:digest,kernels:[row.cache]};
      index.packs.push(descriptor);
      fs.writeFileSync(path.join(path.dirname(row.addon),"index.json"),JSON.stringify({
        ...descriptor,schema:"sagejs.native-pack/v2",kernels:[{...row.record,logicalSource:row.logical}],
      }));
    }
    fs.writeFileSync(path.join(directory,"index.json"),JSON.stringify(index));
  }
  authenticate();
  return {directory,index,rows,authenticate};
}
module.exports={nativePackCatalog};
