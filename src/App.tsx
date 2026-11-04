import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Files, UploadCloud, Wallet, Users, Settings, ShieldCheck, Search, Bell, Menu, Plus, HardDrive, Eye, TrendingUp, Check, Play, FileText, Archive, Image as ImageIcon, MoreHorizontal, Copy } from "lucide-react";

type FileItem = { id: string; name: string; type: string; size: number; date: string; views: number; slug: string; url?: string; shareActive?: boolean };
const initial: FileItem[] = [];
const fmt = (n:number) => n < 1e6 ? `${(n/1e3).toFixed(0)} KB` : `${(n/1e6).toFixed(1)} MB`;
const nav = [{name:"Dashboard",icon:LayoutDashboard},{name:"My Files",icon:Files},{name:"Upload",icon:UploadCloud},{name:"Withdrawals",icon:Wallet},{name:"Referrals",icon:Users},{name:"Settings",icon:Settings},{name:"Admin panel",icon:ShieldCheck}];

export default function App() {
  const [tab,setTab] = useState("Dashboard");
  const [items,setItems] = useState(initial);
  const [query,setQuery] = useState("");
  const [notice,setNotice] = useState("Cloud uploads are enabled. Upload files to your creator account.");
  const [mobile,setMobile] = useState(false);
  const [selected,setSelected] = useState<FileItem|null>(null);
  const [copied,setCopied] = useState(false);
  const [renameValue,setRenameValue] = useState("");
  const [actionBusy,setActionBusy] = useState(false);

  const [uploadBusy,setUploadBusy] = useState(false);
  const [filesLoading,setFilesLoading] = useState(false);
  const [user,setUser] = useState<{id:string;email:string;display_name:string;role:string}|null>(null);
  const [authChecking,setAuthChecking] = useState(true);
  const [authMode,setAuthMode] = useState<"login"|"register">("register");
  const [authName,setAuthName] = useState("");
  const [authEmail,setAuthEmail] = useState("");
  const [authPassword,setAuthPassword] = useState("");
  const [authBusy,setAuthBusy] = useState(false);
  const [share,setShare] = useState<any>(null);
  const [shareError,setShareError] = useState("");
  const shareSlug = window.location.pathname.match(/^\/s\/([a-zA-Z0-9]+)/)?.[1];
  useEffect(() => { if (!shareSlug) return; fetch(`/api/share/${shareSlug}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Link unavailable");setShare(d.file);}).catch(e=>setShareError(e.message||"Link unavailable")); }, [shareSlug]);
  useEffect(() => { fetch("/api/auth/me").then(r=>r.ok?r.json():null).then(d=>setUser(d?.user||null)).catch(()=>setUser(null)).finally(()=>setAuthChecking(false)); }, []);
  const submitAuth = async (e:React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true); setNotice("");
    try { const response=await fetch("/api/auth/"+authMode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:authName,email:authEmail,password:authPassword})}); const data=await response.json(); if(!response.ok) throw new Error(data.error||"Authentication failed"); setUser(data.user); setItems([]); setNotice(authMode==="register"?"Your creator account is ready.":"Welcome back."); }
    catch(error){setNotice(error instanceof Error?error.message:"Could not sign in.");} finally{setAuthBusy(false);}
  };
  const signOut = async () => { await fetch("/api/auth/logout",{method:"POST"}); setUser(null); setItems([]);  setTab("Dashboard"); };
  useEffect(() => {
    if (!user) return;
    let active = true;
    setFilesLoading(true);
    fetch("/api/files")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load files");
        if (active) setItems(data.files);
      })
      .catch(error => { if (active) setNotice(error instanceof Error ? error.message : "Could not load saved files."); })
      .finally(() => { if (active) setFilesLoading(false); });
    return () => { active = false; };
  }, [user]);
  const filtered = useMemo(()=>items.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())),[items,query]);
  const upload = async (list:FileList|null) => {
    if(!list?.length) return;
    if(!user) { setNotice("Please sign in first."); return; }
    setUploadBusy(true);
    const added: FileItem[] = [];
    try {
      for (const file of Array.from(list)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/files/upload", { method:"POST", headers:{}, body });
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "Upload failed");
        const remote = result.file;
        added.push({id:remote.id,name:remote.name,type:remote.resourceType==="video"?"Video":remote.resourceType==="image"?"Image":remote.mimeType.includes("pdf")?"Document":remote.name.toLowerCase().endsWith(".zip")?"Archive":"File",size:remote.bytes,date:"Just now",views:0,slug:remote.slug,url:`${window.location.origin}/s/${remote.slug}`,shareActive:true});
      }
      setItems(v=>[...added,...v]); setTab("My Files");
      setNotice(`${added.length} file(s) uploaded and saved to your creator account.`);
    } catch(error) {
      setNotice(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally { setUploadBusy(false); }
  };
  const saveRename = async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not rename this file.");
      const renamed = { ...selected, name: data.file.name };
      setItems(current => current.map(file => file.id === renamed.id ? renamed : file));
      setSelected(renamed);
      setNotice("File name updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not rename this file.");
    } finally {
      setActionBusy(false);
    }
  };
  const toggleShare = async () => {
    if (!selected) return;
    const active = selected.shareActive === false;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(selected.id)}/share`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update sharing.");
      const updated = { ...selected, shareActive: data.share.active };
      setItems(current => current.map(file => file.id === updated.id ? updated : file));
      setSelected(updated);
      setNotice(active ? "Share link activated." : "Share link deactivated. Visitors can no longer open it.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update sharing.");
    } finally {
      setActionBusy(false);
    }
  };
  const deleteFile = async () => {
    if (!selected || !window.confirm(`Delete "${selected.name}"? The share link will stop working and the stored file will be removed.`)) return;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete this file.");
      setItems(current => current.filter(file => file.id !== selected.id));
      setSelected(null);
      setNotice(data.storageCleanup === "failed" ? "File removed from your workspace; cloud cleanup needs attention." : "File deleted and its share link disabled.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete this file.");
    } finally {
      setActionBusy(false);
    }
  };
  const total = items.reduce((a,b)=>a+b.size,0);
  if (shareSlug) return <div className="authscreen"><div className="authcard sharecard"><div className="brand"><div className="brandmark">S</div><span>Share<span className="purple">Dabba</span></span></div>{share?<><div className="filebig"><Play/></div><h1>{share.name}</h1><p>Shared by {share.creator} · {fmt(share.size)}</p><div className="sharecta">To watch this video, open it in the ShareDabba Player app.</div><a className="primary full appopen" href={`sharedabba://play/${shareSlug}`}>Open in ShareDabba Player</a><small className="muted">The website does not play or expose the original video file.</small></>:<p>{shareError||"Loading shared file…"}</p>}</div></div>;
  if (authChecking) return <div className="authscreen"><div className="authcard">Loading your ShareDabba workspace…</div></div>;
  if (!user) return <div className="authscreen"><form className="authcard" onSubmit={submitAuth}><div className="brandmark">S</div><h1>{authMode==="register"?"Create your creator account":"Welcome back"}</h1><p>Sign in to manage your own files and sharing links.</p>{authMode==="register"&&<input required minLength={2} maxLength={60} placeholder="Your name" value={authName} onChange={e=>setAuthName(e.target.value)}/>}<input required type="email" placeholder="Email address" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/><input required minLength={8} type="password" placeholder="Password (at least 8 characters)" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}/>{notice&&<div className="notice">{notice}</div>}<button className="primary full" disabled={authBusy}>{authBusy?"Please wait…":authMode==="register"?"Create account":"Sign in"}</button><button type="button" className="textbtn" onClick={()=>{setAuthMode(authMode==="register"?"login":"register");setNotice("");}}>{authMode==="register"?"Already have an account? Sign in":"New to ShareDabba? Create account"}</button></form></div>;
  return <div className="shell">
    <aside className={`sidebar ${mobile?"show":""}`}>
      <div className="brand"><div className="brandmark">S</div><span>Share<span className="purple">Dabba</span></span><button className="close" onClick={()=>setMobile(false)}>×</button></div>
      <div className="workspace">CREATOR WORKSPACE</div>
      {nav.map(n=><button key={n.name} className={`nav ${tab===n.name?"active":""}`} onClick={()=>{setTab(n.name);setMobile(false)}}><n.icon size={18}/>{n.name}{n.name==="Admin panel"&&<span className="tag">DEMO</span>}</button>)}
      <div className="side-bottom"><div className="storage-head"><HardDrive size={16}/> Storage usage</div><div className="progress"><span style={{width:"18%"}}/></div><small>Prototype usage · {fmt(total)}</small><div className="plan">Free prototype <span>Preview</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="iconbtn mobilemenu" onClick={()=>setMobile(true)}><Menu/></button><div className="crumb">Workspace <span>/</span> {tab}</div><div className="topright"><button className="iconbtn"><Bell size={18}/></button><div className="avatar" title={user.display_name}>{user.display_name.slice(0,2).toUpperCase()}</div><button className="textbtn" onClick={signOut}>Sign out</button></div></header>
      <div className="content">
        <div className="welcome"><div><div className="eyebrow">CREATOR WORKSPACE</div><h1>{tab==="Dashboard"?"Welcome to ShareDabba":tab}</h1><p>Manage your files, sharing links and creator activity.</p></div><label className="uploadbtn"><Plus size={17}/> Upload files<input type="file" multiple onChange={e=>upload(e.target.files)}/></label></div>
        <div className="notice"><span className="notice-dot"/> {notice}</div>
        {tab==="Dashboard" && <>
          <div className="stats">
            <Stat icon={<Files/>} label="Total files" value={String(items.length)} trend="Files in workspace"/>
            <Stat icon={<Eye/>} label="Link visits" value={items.reduce((a,b)=>a+b.views,0).toLocaleString()} trend="Share-page opens · not video plays"/>
            <Stat icon={<Wallet/>} label="Estimated earnings" value="₹0.00" trend="No real ad revenue connected"/>
            <Stat icon={<HardDrive/>} label="Storage used" value={fmt(total)} trend="Cloud storage"/>
          </div>
          <div className="grid2"><section className="panel"><div className="panelhead"><div><h3>Recent files</h3><p>Your latest uploads</p></div><button className="textbtn" onClick={()=>setTab("My Files")}>View all</button></div><FileRows items={items.slice(0,4)} onSelect={x=>{setSelected(x);setRenameValue(x.name);setCopied(false);}}/></section>
          <section className="panel"><div className="panelhead"><div><h3>Getting started</h3><p>Prepare your creator workspace</p></div><span className="stepcount">1/4</span></div><CheckRow done title="Workspace created" desc="Your ShareDabba prototype is ready."/><CheckRow title="Connect cloud storage" desc="Required for persistent file hosting."/><CheckRow title="Configure ad provider" desc="Only count verified ad impressions."/><CheckRow title="Enable creator payouts" desc="After real revenue and compliance checks."/></section></div>
          <section className="panel"><div className="panelhead"><div><h3>Monetization overview</h3><p>Illustrative layout — not actual earnings</p></div><span className="demo-pill">DEMO DATA</span></div><div className="emptychart"><TrendingUp size={26}/><b>Connect advertising to see verified revenue</b><span>Views, ad impressions and payable earnings will be tracked separately.</span></div></section>
        </>}
        {tab==="My Files" && <section className="panel"><div className="panelhead"><div><h3>All files</h3><p>Manage your uploaded content</p></div><div className="search"><Search size={16}/><input placeholder="Search files..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><FileRows items={filtered} onSelect={x=>{setSelected(x);setRenameValue(x.name);setCopied(false);}}/></section>}
        {tab==="Upload" && <section className="panel uploadpanel"><div className="drop"><UploadCloud size={38}/><h2>Upload your files</h2><p>Choose videos, APKs, PDFs, ZIPs, images and other files.</p><label className="uploadbtn"><Plus size={17}/> Choose files<input type="file" multiple onChange={e=>upload(e.target.files)}/></label><small>Files are uploaded to Cloudinary and saved in your database. Maximum file size: 100 MB per file. Your uploads are private to your account.</small>{filesLoading&&<small>Loading your saved files…</small>}{uploadBusy&&<small>Uploading to cloud… please keep this page open.</small>}</div></section>}
        {tab==="Withdrawals" && <Placeholder icon={<Wallet/>} title="Creator withdrawals" desc="Withdrawal requests will become available after verified advertising revenue, creator balances and payment-provider integration are configured."/>}
        {tab==="Referrals" && <Placeholder icon={<Users/>} title="Referral tracking" desc="Referral links, attribution and eligible commission rules will be added after account authentication is connected."/>}
        {tab==="Settings" && <Placeholder icon={<Settings/>} title="Workspace settings" desc="Profile, security, storage provider and monetization preferences will be configured in the connected production backend."/>}
        {tab==="Admin panel" && <Placeholder icon={<ShieldCheck/>} title="Admin controls" desc="This preview does not grant admin access or modify users. Production admin roles and audit logs must be enforced server-side."/>}
        <footer>© 2026 ShareDabba · Prototype workspace <span>Built for file hosting, not a social video feed.</span></footer>
      </div>
    </main>
    {selected && <div className="modalback" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <button className="modalclose" onClick={()=>setSelected(null)}>×</button>
      <div className="filebig">{selected.type==="Video"?<Play/>:selected.type==="Document"?<FileText/>:selected.type==="Image"?<ImageIcon/>:<Archive/>}</div>
      <h2>{selected.name}</h2>
      <p>{selected.type} · {fmt(selected.size)} · {selected.views.toLocaleString()} link visits</p>
      <label className="renamefield">File name (keep the original extension)
        <input value={renameValue} onChange={e=>setRenameValue(e.target.value)} maxLength={180}/>
      </label>
      <button className="primary full" type="button" onClick={()=>void saveRename()} disabled={actionBusy||renameValue.trim()===selected.name}>{actionBusy?"Please wait…":"Save file name"}</button>
      <div className="sharestatus"><span className={selected.shareActive===false?"paused":"active"}>{selected.shareActive===false?"Sharing paused":"Share link active"}</span></div>
      <div className="sharebox">{selected.url || `${window.location.origin}/s/${selected.slug}`}</div>
      <div className="modalactions">
        <button className="secondary" type="button" onClick={()=>void toggleShare()} disabled={actionBusy}>{selected.shareActive===false?"Activate link":"Deactivate link"}</button>
        <button className="primary" type="button" onClick={()=>{navigator.clipboard?.writeText(selected.url || `${window.location.origin}/s/${selected.slug}`);setCopied(true)}} disabled={selected.shareActive===false}>{copied?"Copied":"Copy link"}</button>
      </div>
      <button className="danger full" type="button" onClick={()=>void deleteFile()} disabled={actionBusy}>Delete file</button>
      <small className="muted">Deleting disables the share link and removes the cloud-stored file. Playback is not yet connected to the Android player.</small>
    </div></div>}
  </div>;
}
function Stat({icon,label,value,trend}:{icon:React.ReactNode,label:string,value:string,trend:string}){return <div className="stat"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{trend}</small></div>}
function CheckRow({done=false,title,desc}:{done?:boolean,title:string,desc:string}){return <div className="checkrow"><span className={done?"check":"unchecked"}>{done&&<Check size={14}/>}</span><div><b>{title}</b><small>{desc}</small></div></div>}
function FileRows({items,onSelect}:{items:FileItem[],onSelect:(x:FileItem)=>void}){return <div className="filelist">{items.length===0?<div className="empty">No files found.</div>:items.map(x=><div className="filerow" key={x.id}><div className={`fileicon ${x.type.toLowerCase()}`}>{x.type==="Video"?<Play size={18}/>:x.type==="Document"?<FileText size={18}/>:x.type==="Image"?<ImageIcon size={18}/>:<Archive size={18}/>}</div><div className="filename"><b>{x.name}</b><small>{x.type} · {fmt(x.size)} · {x.date}</small></div><div className="views">{x.views.toLocaleString()} <small>opens</small></div><button className="iconbtn" onClick={()=>onSelect(x)}><MoreHorizontal size={19}/></button></div>)}</div>}
function Placeholder({icon,title,desc}:{icon:React.ReactNode,title:string,desc:string}){return <section className="panel placeholder"><div className="placeholdericon">{icon}</div><h2>{title}</h2><p>{desc}</p><span className="demo-pill">PLANNED MODULE</span></section>}
