import { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, getRedirectResult, signInWithRedirect, signInWithPopup, setPersistence, browserLocalPersistence, onAuthStateChanged } from "firebase/auth";

const firebaseApp = initializeApp({ apiKey: "AIzaSyDmXaqI47Ps0XEdm6LcNG9YVJ6F_1OxZ8U", authDomain: "sharedabba-login.firebaseapp.com", projectId: "sharedabba-login", storageBucket: "sharedabba-login.firebasestorage.app", messagingSenderId: "79368523457", appId: "1:79368523457:web:6b1ba06ae4776964674e40" });
const firebaseAuth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
import { LayoutDashboard, Files, UploadCloud, Wallet, Users, Settings, ShieldCheck, Search, Bell, Menu, Plus, HardDrive, Eye, TrendingUp, Check, Play, FileText, Archive, Image as ImageIcon, MoreHorizontal, Copy } from "lucide-react";

type FileItem = { id: string; name: string; type: string; size: number; date: string; views: number; slug: string; url?: string; shareActive?: boolean };
const initial: FileItem[] = [];
const fmt = (n:number) => n < 1e6 ? `${(n/1e3).toFixed(0)} KB` : `${(n/1e6).toFixed(1)} MB`;
const nav = [{name:"Dashboard",icon:LayoutDashboard},{name:"My Files",icon:Files},{name:"Upload",icon:UploadCloud},{name:"Withdrawals",icon:Wallet},{name:"Referrals",icon:Users},{name:"Settings",icon:Settings},{name:"Admin panel",icon:ShieldCheck}];

export default function App() {
  const [tab,setTab] = useState("Dashboard");
  const [items,setItems] = useState(initial);
  const [query,setQuery] = useState("");
  const [notice,setNotice] = useState("");
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
  const [profileName,setProfileName] = useState("");
  const [profileBusy,setProfileBusy] = useState(false);
  const [share,setShare] = useState<any>(null);
  const [shareError,setShareError] = useState("");
  const [publicAds,setPublicAds] = useState<any[]>([]);
  const [adSettings,setAdSettings] = useState<any[]>([{slot:1,imageUrl:"",targetUrl:"",active:true},{slot:2,imageUrl:"",targetUrl:"",active:true}]);
  const [adBusy,setAdBusy] = useState<number|null>(null);
  const [adNotice,setAdNotice] = useState("");
  const shareSlug = window.location.pathname.match(/^\/s\/([a-zA-Z0-9]+)/)?.[1];
  useEffect(() => { if (!shareSlug) return; fetch(`/api/share/${shareSlug}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Link unavailable");setShare(d.file);}).catch(e=>setShareError(e.message||"Link unavailable")); }, [shareSlug]);
  useEffect(() => { if (!shareSlug) return; fetch("/api/share-page-ads").then(r=>r.ok?r.json():null).then(d=>setPublicAds(d?.ads||[])).catch(()=>setPublicAds([])); }, [shareSlug]);
  useEffect(() => { if (tab!=="Admin panel" || user?.role!=="admin") return; fetch("/api/admin/share-page-ads").then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not load ad settings");setAdSettings([1,2].map(slot=>d.ads.find((x:any)=>x.slot===slot)||{slot,imageUrl:"",targetUrl:"",active:true}));}).catch(e=>setAdNotice(e.message||"Could not load ad settings.")); }, [tab,user]);
  const updateAdSetting=(slot:number,key:string,value:any)=>setAdSettings(current=>current.map(ad=>ad.slot===slot?{...ad,[key]:value}:ad));
  const uploadAdBanner=async(slot:number,file:File|null)=>{if(!file)return;setAdBusy(slot);setAdNotice("");try{const body=new FormData();body.append("file",file);const r=await fetch("/api/admin/share-page-ads/upload",{method:"POST",body});const d=await r.json();if(!r.ok)throw new Error(d.error||"Banner upload failed");updateAdSetting(slot,"imageUrl",d.imageUrl);setAdNotice(`Banner ${slot} uploaded. Save the slot to publish it.`);}catch(e){setAdNotice(e instanceof Error?e.message:"Banner upload failed.");}finally{setAdBusy(null);}};
  const saveAdSetting=async(slot:number)=>{const ad=adSettings.find(x=>x.slot===slot);if(!ad)return;setAdBusy(slot);setAdNotice("");try{const r=await fetch(`/api/admin/share-page-ads/${slot}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(ad)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not save banner");setAdSettings(current=>current.map(x=>x.slot===slot?d.ad:x));setAdNotice(`Banner ${slot} settings saved.`);}catch(e){setAdNotice(e instanceof Error?e.message:"Could not save banner.");}finally{setAdBusy(null);}};
  useEffect(() => { fetch("/api/auth/me").then(r=>r.ok?r.json():null).then(d=>setUser(d?.user||null)).catch(()=>setUser(null)).finally(()=>setAuthChecking(false)); }, []);
  const submitAuth = async (e:React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true); setNotice("");
    try { const response=await fetch("/api/auth/"+authMode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:authName,email:authEmail,password:authPassword})}); const data=await response.json(); if(!response.ok) throw new Error(data.error||"Authentication failed"); setUser(data.user); setItems([]); setNotice(authMode==="register"?"Your creator account is ready.":"Welcome back."); }
    catch(error){setNotice(error instanceof Error?error.message:"Could not sign in.");} finally{setAuthBusy(false);}
  };
  const finishFirebaseSignIn = async (firebaseUser: import("firebase/auth").User) => {
    const idToken = await firebaseUser.getIdToken();
    const response = await fetch("/api/auth/firebase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Google sign-in failed.");
    setUser(data.user); setItems([]); setNotice("You're signed in with Google.");
  };

  useEffect(() => {
    let active = true;
    let handled = false;
    const complete = async (firebaseUser: import("firebase/auth").User) => {
      if (!active || handled) return;
      handled = true;
      setAuthBusy(true);
      try { await finishFirebaseSignIn(firebaseUser); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Google sign-in could not be completed. Please try again."); }
      finally { if (active) setAuthBusy(false); }
    };
    getRedirectResult(firebaseAuth).then((credential) => {
      if (credential) return complete(credential.user);
      if (firebaseAuth.currentUser) return complete(firebaseAuth.currentUser);
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : "Google sign-in failed. Check Firebase authorized domains and try again.");
    });
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (firebaseUser) void complete(firebaseUser);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const signInWithGoogle = async () => {
    setAuthBusy(true); setNotice("Opening Google sign-in…");
    try {
      await setPersistence(firebaseAuth, browserLocalPersistence);
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      await finishFirebaseSignIn(credential.user);
      setNotice("You're signed in with Google.");
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user") {
        setNotice("Google's sign-in window was blocked or closed. Trying the full-page Google sign-in…");
        try {
          await signInWithRedirect(firebaseAuth, googleProvider);
          return;
        } catch (redirectError) {
          setNotice(redirectError instanceof Error ? redirectError.message : "Google redirect could not start. Open ShareDabba in Chrome and try again.");
        }
      } else {
        setNotice(error instanceof Error ? error.message : "Google sign-in failed. Please try again.");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileBusy(true); setNotice("");
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: profileName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update your profile.");
      setUser(data.user);
      setNotice("Profile name updated successfully.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update your profile.");
    } finally { setProfileBusy(false); }
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
  if (shareSlug) {
    const censoredTitle = (String(share?.name||"").split(/(\\s+)/).map((word:string)=>word.trim()?word.split("").map((ch:string,i:number)=>/[aeiou]/i.test(ch)&&i>1?"*":ch).join(""):word).join(""));
    const activeAds=[1,2].map(slot=>publicAds.find(ad=>ad.slot===slot&&ad.active)).filter(Boolean);
    const openPlayer=()=>{window.location.href=`sharedabba://v/${encodeURIComponent(shareSlug)}`;};
    return <div className="share-page"><header className="share-header"><div className="share-brandmark"><Play size={24} fill="white"/></div><div className="share-wordmark">Share<span>Dabba</span></div><div className="share-badge">↗ Shared Video</div></header><main className="share-main">
      {activeAds[0]?<a className="share-ad" href={activeAds[0].targetUrl} target="_blank" rel="noreferrer"><img src={activeAds[0].imageUrl} alt="Advertisement banner"/></a>:<div className="share-ad demo-ad"><span>ADVERTISEMENT</span><div><b>ShareDabba</b><strong>Earn $3 CPM</strong><small>Instant daily UPI payout · Crypto withdrawal also available</small></div><i>↗</i></div>}
      <section className="share-hero">{share?<><button className="share-play-icon" onClick={openPlayer} aria-label="Open video in ShareDabba"><Play size={48} fill="white"/></button><div className="creator-chip">♙ &nbsp; Created by <b>{share.creator}</b></div><h1>{censoredTitle}</h1><button className="share-open-app" onClick={openPlayer}><Play size={24} fill="white"/><span><b>View in App</b><small>Watch this video in ShareDabba</small></span><strong>›</strong></button><p className="share-hint">Tap to open the app or install ShareDabba from Google Play</p></>:<p>{shareError||"Loading shared video…"}</p>}</section>
      {activeAds[1]?<a className="share-ad" href={activeAds[1].targetUrl} target="_blank" rel="noreferrer"><img src={activeAds[1].imageUrl} alt="Advertisement banner"/></a>:<div className="share-ad demo-ad demo-ad-dark"><span>ADVERTISEMENT</span><div><b>Get the ShareDabba App</b><strong>Earn $3 CPM</strong><small>Instant daily UPI payout · Crypto withdrawal also available</small></div><i>▶</i></div>}
      <footer className="share-footer">💜 Made with ❤️ by the <b>ShareDabba Team</b></footer>
    </main></div>;
  }
  if (authChecking) return <div className="authscreen"><div className="authcard">Loading your ShareDabba workspace…</div></div>;
  if (!user) return <div className="authscreen"><form className="authcard" onSubmit={submitAuth}><div className="brandmark">S</div><h1>{authMode==="register"?"Create your creator account":"Welcome back"}</h1><p>Sign in to manage your own files and sharing links.</p><><button type="button" className="google-login-button" onClick={signInWithGoogle} disabled={authBusy}><svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.8 15.1l6.8 5.3C14.2 15.5 18.7 11.9 24 11.9Z"/></svg><span>Continue with Google</span></button><div className="auth-divider"><span>OR CONTINUE WITH EMAIL</span></div></>{authMode==="register"&&<input required minLength={2} maxLength={60} placeholder="Your name" value={authName} onChange={e=>setAuthName(e.target.value)}/>}<input required type="email" placeholder="Email address" value={authEmail} onChange={e=>setAuthEmail(e.target.value)}/><input required minLength={8} type="password" placeholder="Password (at least 8 characters)" value={authPassword} onChange={e=>setAuthPassword(e.target.value)}/>{notice&&<div className="notice">{notice}</div>}<button className="primary full" disabled={authBusy}>{authBusy?"Please wait…":authMode==="register"?"Create account":"Sign in"}</button><button type="button" className="textbtn" onClick={()=>{setAuthMode(authMode==="register"?"login":"register");setNotice("");}}>{authMode==="register"?"Already have an account? Sign in":"New to ShareDabba? Create account"}</button></form></div>;
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
        {tab==="Settings" && <div className="settings-stack">
          <section className="panel settings-panel"><div className="panelhead"><div><h3>Profile information</h3><p>Update the name shown on your creator workspace.</p></div><span className="demo-pill">ACCOUNT</span></div>
            <form className="settings-form" onSubmit={saveProfile}>
              <label>Display name<input value={profileName || user.display_name} onChange={e=>setProfileName(e.target.value)} minLength={2} maxLength={60} required/></label>
              <label>Email address<input value={user.email} readOnly disabled/><small>Your sign-in email cannot be changed here.</small></label>
              <button className="primary" disabled={profileBusy}>{profileBusy?"Saving…":"Save profile"}</button>
            </form>
          </section>
          <section className="panel settings-panel"><div className="panelhead"><div><h3>Account security</h3><p>Keep your account details private and secure.</p></div></div>
            <div className="security-note"><ShieldCheck size={19}/><span><b>Protected session</b><small>ShareDabba uses a secure, HTTP-only session cookie. Sign out on shared devices.</small></span></div>
            <button className="secondary settings-signout" onClick={signOut}>Sign out of this device</button>
          </section>
        </div>}
        {tab==="Admin panel" && (user.role!=="admin"?<Placeholder icon={<ShieldCheck/>} title="Admin access required" desc="Only accounts with the administrator role can manage public ShareDabba settings."/>:<div className="admin-ads"><section className="panel"><div className="panelhead"><div><h3>Share page advertisements</h3><p>Manage the two banner slots shown on every public video link page.</p></div><span className="demo-pill">ADMIN</span></div>{adNotice&&<div className="notice">{adNotice}</div>}{adSettings.map((ad:any)=><div className="ad-editor" key={ad.slot}><div className="ad-editor-head"><b>Banner slot {ad.slot}</b><label className="ad-toggle"><input type="checkbox" checked={ad.active} onChange={e=>updateAdSetting(ad.slot,"active",e.target.checked)}/> Active</label></div>{ad.imageUrl?<img className="ad-preview" src={ad.imageUrl} alt={`Banner slot ${ad.slot} preview`}/>:<div className="ad-preview demo-ad"><b>ShareDabba</b><strong>Earn $3 CPM</strong><small>Instant daily UPI payout · Crypto withdrawal also available</small></div>}<label className="ad-upload">Upload banner image (JPG, PNG, WEBP, GIF · max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>void uploadAdBanner(ad.slot,e.target.files?.[0]||null)}/></label><label className="ad-field">Banner destination URL<input type="url" placeholder="https://example.com" value={ad.targetUrl||""} onChange={e=>updateAdSetting(ad.slot,"targetUrl",e.target.value)}/></label><button className="primary" disabled={adBusy===ad.slot||!ad.imageUrl||!ad.targetUrl} onClick={()=>void saveAdSetting(ad.slot)}>{adBusy===ad.slot?"Saving…":`Save banner ${ad.slot}`}</button></div>)}</section></div>)}
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
