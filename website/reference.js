"use strict";

const state={data:null,query:"",selected:null};
const $=(selector)=>document.querySelector(selector);
const referenceDataUrl=document.body?.dataset.referenceData||"./reference-data.json";
const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n};
const escapeHtml=(text)=>String(text).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function markdown(text){let fenced=false;const output=[];for(const line of String(text||"").split("\n")){if(/^```/.test(line.trim())){fenced=!fenced;continue}if(fenced)continue;if(/^###\s+/.test(line)){output.push(`<h3>${escapeHtml(line.replace(/^###\s+/,""))}</h3>`);continue}if(/^[-*]\s+/.test(line)){output.push(`<div>• ${inline(line.replace(/^[-*]\s+/,""))}</div>`);continue}output.push(line.trim()?`<div>${inline(line)}</div>`:"<br>")}return output.join("")}
function inline(text){return escapeHtml(text).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")}
function searchable(entry){return [entry.name,entry.signature,entry.summary,entry.doc,...entry.aliases,...entry.tags,...entry.backends,...entry.examples.flatMap((x)=>[x.source,x.want,x.owner])].join(" ").toLowerCase()}
function filtered(){const terms=state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);return state.data.entries.filter((entry)=>terms.every((term)=>searchable(entry).includes(term))).sort((a,b)=>{const q=state.query.toLowerCase();const score=(x)=>x.name.toLowerCase()===q?0:x.name.toLowerCase().startsWith(q)?1:x.name.toLowerCase().includes(q)?2:3;return score(a)-score(b)||a.name.localeCompare(b.name)})}
function setUrl(){const url=new URL(location.href);state.query?url.searchParams.set("q",state.query):url.searchParams.delete("q");state.selected?url.hash=encodeURIComponent(state.selected):url.hash="";history.replaceState(null,"",url)}
function coverage(){const c=state.data.coverage,e=c.examples,d=c.documentation;const values=[[d.registry_entries,"declared APIs"],[d.with_docstring,"with docs"],[e.documented,"examples"],[e.verified,"CI verified"]];const root=$("#coverage");for(const [value,label] of values){const item=node("span","metric");item.innerHTML=`<b>${value}</b> ${label}`;root.append(item)}const warning=node("span","metric warning","Denominator: DocSpec registry · semantic/performance coverage separate");root.append(warning)}
function renderResults(){const entries=filtered();$("#result-count").textContent=`${entries.length} ${entries.length===1?"entry":"entries"}`;const list=$("#result-list");list.replaceChildren();for(const entry of entries){const button=node("button",`result${entry.name===state.selected?" active":""}`);button.type="button";button.append(node("code","",entry.name),node("small","",entry.summary||entry.signature));button.onclick=()=>select(entry.name);list.append(button)}if(!state.selected&&entries.length)select(entries[0].name,false)}
function chip(value,kind=""){return node("span",`chip ${kind}`,value)}
async function copy(button,text){await navigator.clipboard.writeText(text);const before=button.textContent;button.textContent="Copied";setTimeout(()=>button.textContent=before,1000)}
function examplePane(label,role,text){const pane=node("div","example-pane");pane.append(node("div","example-label",label));const pre=node("pre");pre.dataset.exampleRole=role;pre.append(node("code","",text));pane.append(pre);return pane}
function exampleCard(example){
  const article=node("section","example");
  const status=example.verification?.status||"unverified";
  const head=node("div","example-head");
  const label=status==="pass"?"✓ CI verified":status;
  head.append(node("span",`status ${status}`,`${label}${example.origin==="upstream-sage"?" · upstream Sage":""}`));
  const copyButton=node("button","copy","Copy input");
  copyButton.type="button";
  copyButton.onclick=()=>copy(copyButton,article.querySelector('[data-example-role="input"] code').textContent);
  head.append(copyButton);
  article.append(head);
  const variants=example.variants||[{language:example.language||"sage",source:example.source,want:example.want}];
  if(typeof variants[0]?.source!=="string"||!variants[0].source.trim())throw new Error(`reference example ${example.id||"(unknown)"} has no source`);
  if(variants.length>1){
    const tabs=node("div","language-tabs");
    for(const [index,variant] of variants.entries()){
      const button=node("button",index===0?"active":"",variant.language);
      button.onclick=()=>{
        const before=article.getBoundingClientRect().top;
        article.querySelectorAll(".language-tabs button").forEach((x)=>x.classList.remove("active"));
        button.classList.add("active");
        article.querySelector('[data-example-role="input"] code').textContent=variant.source;
        article.querySelector('[data-example-role="output"] code').textContent=variant.want?.trimEnd()||"(no textual output)";
        requestAnimationFrame(()=>scrollBy(0,article.getBoundingClientRect().top-before));
      };
      tabs.append(button);
    }
    article.append(tabs);
  }
  const body=node("div","example-body");
  body.append(
    examplePane("Input","input",variants[0].source),
    examplePane("Expected output","output",variants[0].want?.trimEnd()||"(no textual output)"),
  );
  article.append(body);
  if(example.tags?.length)article.append(node("p","example-note",example.tags.map((x)=>`# ${x.name}${x.value?` ${x.value}`:""}`).join(" · ")));
  if(example.verification?.reason)article.append(node("p","example-note",example.verification.reason));
  return article;
}
function sourceBlock(source){if(!source)return null;const details=node("details","source");details.id="source";details.append(node("summary","",`Browse relevant source · ${source.path}:${source.line}`));const pre=node("pre"),code=node("code");const lines=source.excerpt.text.split("\n");code.innerHTML=lines.map((line,index)=>`<span class="source-line">${String(source.excerpt.start_line+index).padStart(5)} </span>${escapeHtml(line)}`).join("\n");pre.append(code);details.append(pre);return details}
function select(name,update=true){const entry=state.data.entries.find((x)=>x.name===name);if(!entry)return;state.selected=name;if(update)setUrl();renderResults();const root=$("#entry");root.replaceChildren();const header=node("header","entry-header");header.append(node("p","eyebrow",`${entry.kind} · ${entry.module||"Sage.js runtime"}`),node("h2","",entry.name));const chips=node("div","chips");for(const item of entry.tags)chips.append(chip(item));for(const item of entry.backends)chips.append(chip(item,"backend"));header.append(chips);root.append(header);const signature=node("pre","signature");signature.append(node("code","",entry.signature));root.append(signature);const compatibility=node("div",`notice ${entry.sage_compatibility.status}`);compatibility.innerHTML=`<strong>Sage compatibility: ${escapeHtml(entry.sage_compatibility.status)}</strong>${entry.sage_compatibility.notes?` — ${escapeHtml(entry.sage_compatibility.notes)}`:""}`;root.append(compatibility);const prose=node("section","doc");prose.innerHTML=markdown(entry.doc);root.append(prose);if(entry.examples.length){root.append(node("h3","section-title",`${entry.examples.length} executable ${entry.examples.length===1?"example":"examples"}`));for(const example of entry.examples)root.append(exampleCard(example))}else{root.append(node("div","notice partial","No executable public example is attached yet. This is counted as a documentation gap."))}const meta=node("div","meta-grid");const provenance=node("section","meta-card");provenance.append(node("h4","","Provenance"),node("p","",entry.provenance.map((x)=>[x.kind,x.source,x.license].filter(Boolean).join(" · ")).join("; ")||"Not recorded"));const limits=node("section","meta-card");limits.append(node("h4","","Limitations"),node("p","",entry.limitations.join(" ")||"None recorded for the supported surface."));meta.append(provenance,limits);root.append(meta);const source=sourceBlock(entry.source);if(source)root.append(source)}
async function start(){const response=await fetch(referenceDataUrl);if(!response.ok)throw new Error(`HTTP ${response.status}`);state.data=await response.json();const url=new URL(location.href);state.query=url.searchParams.get("q")||"";state.selected=decodeURIComponent(url.hash.slice(1));$("#search").value=state.query;coverage();renderResults();if(state.selected)select(state.selected,false);$("#search").addEventListener("input",(event)=>{state.query=event.target.value;state.selected=null;setUrl();renderResults()});window.addEventListener("hashchange",()=>{const name=decodeURIComponent(location.hash.slice(1));if(name)select(name,false)});document.documentElement.dataset.referenceReady="true"}
start().catch((error)=>{$("#result-count").textContent=`Reference failed to load: ${error.message}`});
