import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Files, UploadCloud, Wallet, Users, Settings, ShieldCheck, Search, Bell, Menu, Plus, HardDrive, Eye, TrendingUp, Check, Play, FileText, Archive, Image as ImageIcon, MoreHorizontal, Copy } from "lucide-react";

type FileItem = { id: string; name: string; type: string; size: number; date: string; views: number; slug: string; url?: string };
const initial: FileItem[] = [
  { id:"1", name:"Sample travel video.mp4", type:"Video", size:84000000, date:"Today", views:1240, slug:"travel-video" },
  { id:"2", name:"Creator starter pack.zip", type:"Archive", size:12000000, date:"Yesterday", views:386, slug:"starter-pack" },
  { id:"3", name:"Product guide.pdf", type:"Document", size:2400000, date:"2 days ago", views:92, slug:"product-guide" }
];
const fmt = (n:number) => n < 1e6 ? `${(n/1e3).toFixed(0)} KB` : `${(n/1e6).toFixed(1)} MB`;
const nav = [{name:"Dashboard",icon:LayoutDashboard},{name:"My Files",icon:Files},{name:"Upload",icon:UploadCloud},{name:"Withdrawals",icon:Wallet},{name:"Referrals",icon:Users},{name:"Settings",icon:Settings},{name:"Admin panel",icon:ShieldCheck}];

export default function App() {
  const [tab,setTab] = useState("Dashboard");
  const [items,setItems] = useState(initial);
  const [query,setQuery] = useState("");
  const [notice,setNotice] = useState("Cloud uploads are enabled. Use your private upload key to send files to Cloudinary.");
  const [mobile,setMobile] = useState(false);
  const [selected,setSelected] = useState<FileItem|null>(null);
  const [copied,setCopied] = useState(false);
  const [uploadKey,setUploadKey] = useState("");
  const [uploadBusy,setUploadBusy] = useState(false);\n  const [filesLoading,setFilesLoading] = useState(false);
  useEffect(() => {
    if (!uploadKey.trim()) return;
    let active = true;
    setFilesLoading(true);
    fetch("/api/files", { headers: { "x-upload-key": uploadKey.trim() } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load files");
        if (active) setItems(data.files);
      })
      .catch(error => { if (active) setNotice(error instanceof Error ? error.message : "Could not load saved files."); })
      .finally(() => { if (active) setFilesLoading(false); });
    return () => { active = false; };
  }, [uploadKey]);
  const filtered = useMemo(()=>items.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())),[items,query]);
  const upload = async (list:FileList|null) => {
    if(!list?.length) return;
    if(!uploadKey.trim()) { setNotice("Enter your private upload access key in the Upload section first."); setTab("Upload"); return; }
    setUploadBusy(true);
    const added: FileItem[] = [];
    try {
      for (const file of Array.from(list)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/files/upload", { method:"POST", headers:{"x-upload-key":uploadKey.trim()}, body });
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Upload failed");
        const remote = result.file;
        added.push({id:crypto.randomUUID(),name:remote.name,type:remote.resourceType==="video"?"Video":remote.resourceType==="image"?"Image":remote.mimeType.includes("pdf")?"Document":remote.name.toLowerCase().endsWith(".zip")?"Archive":"File",size:remote.bytes,date:"Just now",views:0,slug:remote.slug,url:remote.shareUrl});
      }
      setItems(v=>[...added,...v]); setTab("My Files");
      setNotice(`${added.length} file(s) uploaded to Cloudinary and saved in your ShareDabba database.`);
    } catch(error) {
      setNotice(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally { setUploadBusy(false); }
  };
  const total = items.reduce((a,b)=>a+b.size,0);
  return <div className="shell">
    <aside className={`sidebar ${mobile?"show":""}`}>
      <div className="brand"><div className="brandmark">S</div><span>Share<span className="purple">Dabba</span></span><button className="close" onClick={()=>setMobile(false)}>×</button></div>
      <div className="workspace">CREATOR WORKSPACE</div>
      {nav.map(n=><button key={n.name} className={`nav ${tab===n.name?"active":""}`} onClick={()=>{setTab(n.name);setMobile(false)}}><n.icon size={18}/>{n.name}{n.name==="Admin panel"&&<span className="tag">DEMO</span>}</button>)}
      <div className="side-bottom"><div className="storage-head"><HardDrive size={16}/> Storage usage</div><div className="progress"><span style={{width:"18%"}}/></div><small>Prototype usage · {fmt(total)}</small><div className="plan">Free prototype <span>Preview</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="iconbtn mobilemenu" onClick={()=>setMobile(true)}><Menu/></button><div className="crumb">Workspace <span>/</span> {tab}</div><div className="topright"><button className="iconbtn"><Bell size={18}/></button><div className="avatar">SD</div></div></header>
      <div className="content">
        <div className="welcome"><div><div className="eyebrow">CREATOR WORKSPACE</div><h1>{tab==="Dashboard"?"Welcome to ShareDabba":tab}</h1><p>Manage your files, sharing links and creator activity.</p></div><label className="uploadbtn"><Plus size={17}/> Upload files<input type="file" multiple onChange={e=>upload(e.target.files)}/></label></div>
        <div className="notice"><span className="notice-dot"/> {notice}</div>
        {tab==="Dashboard" && <>
          <div className="stats">
            <Stat icon={<Files/>} label="Total files" value={String(items.length)} trend="Files in workspace"/>
            <Stat icon={<Eye/>} label="Total views" value={items.reduce((a,b)=>a+b.views,0).toLocaleString()} trend="Demo analytics"/>
            <Stat icon={<Wallet/>} label="Estimated earnings" value="₹0.00" trend="No real ad revenue connected"/>
            <Stat icon={<HardDrive/>} label="Storage used" value={fmt(total)} trend="Cloud storage"/>
          </div>
          <div className="grid2"><section className="panel"><div className="panelhead"><div><h3>Recent files</h3><p>Your latest uploads</p></div><button className="textbtn" onClick={()=>setTab("My Files")}>View all</button></div><FileRows items={items.slice(0,4)} onSelect={setSelected}/></section>
          <section className="panel"><div className="panelhead"><div><h3>Getting started</h3><p>Prepare your creator workspace</p></div><span className="stepcount">1/4</span></div><CheckRow done title="Workspace created" desc="Your ShareDabba prototype is ready."/><CheckRow title="Connect cloud storage" desc="Required for persistent file hosting."/><CheckRow title="Configure ad provider" desc="Only count verified ad impressions."/><CheckRow title="Enable creator payouts" desc="After real revenue and compliance checks."/></section></div>
          <section className="panel"><div className="panelhead"><div><h3>Monetization overview</h3><p>Illustrative layout — not actual earnings</p></div><span className="demo-pill">DEMO DATA</span></div><div className="emptychart"><TrendingUp size={26}/><b>Connect advertising to see verified revenue</b><span>Views, ad impressions and payable earnings will be tracked separately.</span></div></section>
        </>}
        {tab==="My Files" && <section className="panel"><div className="panelhead"><div><h3>All files</h3><p>Manage your uploaded content</p></div><div className="search"><Search size={16}/><input placeholder="Search files..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><FileRows items={filtered} onSelect={setSelected}/></section>}
        {tab==="Upload" && <section className="panel uploadpanel"><div className="drop"><UploadCloud size={38}/><h2>Upload your files</h2><p>Choose videos, APKs, PDFs, ZIPs, images and other files.</p><label className="uploadbtn"><Plus size={17}/> Choose files<input type="file" multiple onChange={e=>upload(e.target.files)}/></label><label className="keyfield">Private upload access key<input type="password" value={uploadKey} onChange={e=>setUploadKey(e.target.value)} placeholder="Paste your private upload key" autoComplete="off"/></label><small>Files are uploaded to Cloudinary and saved in your database. Maximum file size: 100 MB per file. Keep your access key private.</small>{filesLoading&&<small>Loading your saved files…</small>}{uploadBusy&&<small>Uploading to cloud… please keep this page open.</small>}</div></section>}
        {tab==="Withdrawals" && <Placeholder icon={<Wallet/>} title="Creator withdrawals" desc="Withdrawal requests will become available after verified advertising revenue, creator balances and payment-provider integration are configured."/>}
        {tab==="Referrals" && <Placeholder icon={<Users/>} title="Referral tracking" desc="Referral links, attribution and eligible commission rules will be added after account authentication is connected."/>}
        {tab==="Settings" && <Placeholder icon={<Settings/>} title="Workspace settings" desc="Profile, security, storage provider and monetization preferences will be configured in the connected production backend."/>}
        {tab==="Admin panel" && <Placeholder icon={<ShieldCheck/>} title="Admin controls" desc="This preview does not grant admin access or modify users. Production admin roles and audit logs must be enforced server-side."/>}
        <footer>© 2026 ShareDabba · Prototype workspace <span>Built for file hosting, not a social video feed.</span></footer>
      </div>
    </main>
    {selected && <div className="modalback" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modalclose" onClick={()=>setSelected(null)}>×</button><div className="filebig">{selected.type==="Video"?<Play/>:selected.type==="Document"?<FileText/>:selected.type==="Image"?<ImageIcon/>:<Archive/>}</div><h2>{selected.name}</h2><p>{selected.type} · {fmt(selected.size)} · {selected.views.toLocaleString()} views</p><div className="sharebox">{selected.url || `sharedabba.example/s/${selected.slug}`}</div><button className="primary full" onClick={()=>{navigator.clipboard?.writeText(selected.url || `sharedabba.example/s/${selected.slug}`);setCopied(true)}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copied":"Copy share link"}</button><small className="muted">Cloudinary delivery URL. Public share-page routing will be added next.</small></div></div>}
  </div>;
}
function Stat({icon,label,value,trend}:{icon:React.ReactNode,label:string,value:string,trend:string}){return <div className="stat"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{trend}</small></div>}
function CheckRow({done=false,title,desc}:{done?:boolean,title:string,desc:string}){return <div className="checkrow"><span className={done?"check":"unchecked"}>{done&&<Check size={14}/>}</span><div><b>{title}</b><small>{desc}</small></div></div>}
function FileRows({items,onSelect}:{items:FileItem[],onSelect:(x:FileItem)=>void}){return <div className="filelist">{items.length===0?<div className="empty">No files found.</div>:items.map(x=><div className="filerow" key={x.id}><div className={`fileicon ${x.type.toLowerCase()}`}>{x.type==="Video"?<Play size={18}/>:x.type==="Document"?<FileText size={18}/>:x.type==="Image"?<ImageIcon size={18}/>:<Archive size={18}/>}</div><div className="filename"><b>{x.name}</b><small>{x.type} · {fmt(x.size)} · {x.date}</small></div><div className="views">{x.views.toLocaleString()} <small>views</small></div><button className="iconbtn" onClick={()=>onSelect(x)}><MoreHorizontal size={19}/></button></div>)}</div>}
function Placeholder({icon,title,desc}:{icon:React.ReactNode,title:string,desc:string}){return <section className="panel placeholder"><div className="placeholdericon">{icon}</div><h2>{title}</h2><p>{desc}</p><span className="demo-pill">PLANNED MODULE</span></section>}
