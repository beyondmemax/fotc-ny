import React, { useState, useEffect, useRef } from "react";
import { auth, db, rtdb, ref, onValue, set, onDisconnect, serverTimestamp } from "./firebase";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, updatePassword
} from "firebase/auth";
import {
  doc, setDoc, getDoc, collection, addDoc, onSnapshot,
  query, where, updateDoc, deleteDoc, deleteField
} from "firebase/firestore";

const CLAUDE_API_URL = "http://localhost:3001/claude";

// ── PRESENCE ──
function usePresence(uid) {
  useEffect(() => {
    if (!uid) return;
    const presenceRef = ref(rtdb, `presence/${uid}`);
    const connectedRef = ref(rtdb, ".info/connected");
    const unsub = onValue(connectedRef, snap => {
      if (!snap.val()) return;
      // When disconnected (close tab, logout, network drop) → set offline
      onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });
      // Set online now
      set(presenceRef, { online: true, lastSeen: serverTimestamp() });
    });
    return () => {
      unsub();
      set(presenceRef, { online: false, lastSeen: serverTimestamp() });
    };
  }, [uid]);
}

const FOTC_TAGS = [
  { code:"LE", label:"Learning & Education", color:"#4F7FFF" },
  { code:"HWB", label:"Health, Wellbeing & Fitness", color:"#FF5C7A" },
  { code:"CIB", label:"Community Involvement & Belonging", color:"#00E5A0" },
  { code:"SEL", label:"Social Emotional Learning", color:"#9B5CFF" },
];

const ROLES = [
  { id:"mentor", label:"Mentor", desc:"Log sessions & track your achiever", color:"#1565C0", bg:"#E3F2FD", img:"/icons/mentor.png" },
  { id:"mentee", label:"Achiever", desc:"My goals, XP & progress", color:"#2E7D32", bg:"#E8F5E9", img:"/icons/achiever.png" },
  { id:"parent", label:"Parent / Guardian", desc:"Confirm outings & stay connected", color:"#BF360C", bg:"#FBE9E7", img:"/icons/parent.png" },
  { id:"supervisor", label:"Supervisor", desc:"Program oversight & reports", color:"#F57F17", bg:"#FFF8E1", img:"/icons/supervisor.png" },
];

const LIGHT_ROLES = ["parent","supervisor"];

const DEMO_ACHIEVERS = [
  { uid:"demo1", name:"Jordan Williams", nickname:"J-Will", avatar:null, energy:8, energyUpdatedAt:new Date(Date.now()-5*60*1000).toISOString(), role:"mentee" },
  { uid:"demo2", name:"Marcus Johnson", nickname:"MJ", avatar:null, energy:5, energyUpdatedAt:new Date(Date.now()-45*60*1000).toISOString(), role:"mentee" },
  { uid:"demo3", name:"Destiny Carter", nickname:"Dee", avatar:null, energy:10, energyUpdatedAt:new Date(Date.now()-2*60*1000).toISOString(), role:"mentee" },
  { uid:"demo4", name:"Jaylen Brooks", nickname:null, avatar:null, energy:null, energyUpdatedAt:null, role:"mentee" },
  { uid:"demo5", name:"Aaliyah Simmons", nickname:"Ali", avatar:null, energy:3, energyUpdatedAt:new Date(Date.now()-120*60*1000).toISOString(), role:"mentee" },
  { uid:"demo6", name:"Tyrese Washington", nickname:"Ty", avatar:null, energy:7, energyUpdatedAt:new Date(Date.now()-10*60*1000).toISOString(), role:"mentee" },
];

const ENERGY_MAP = [
  {val:1,emoji:"😴",label:"Exhausted"},{val:2,emoji:"😔",label:"Low"},
  {val:3,emoji:"😞",label:"Down"},{val:4,emoji:"😐",label:"Meh"},
  {val:5,emoji:"🙂",label:"Okay"},{val:6,emoji:"😊",label:"Good"},
  {val:7,emoji:"😄",label:"Great"},{val:8,emoji:"💪",label:"Strong"},
  {val:9,emoji:"🔥",label:"On Fire"},{val:10,emoji:"⚡",label:"Unstoppable"},
];

const MOOD_MAP=[
  {val:1,emoji:"😞",label:"Really Tough",color:"#FF3B5C"},
  {val:2,emoji:"😔",label:"Tough",color:"#FF5C7A"},
  {val:3,emoji:"😕",label:"Difficult",color:"#FF7043"},
  {val:4,emoji:"😐",label:"Below Average",color:"#FFB300"},
  {val:5,emoji:"🙂",label:"Average",color:"#FFD600"},
  {val:6,emoji:"😊",label:"Decent",color:"#C6FF00"},
  {val:7,emoji:"😄",label:"Good",color:"#00E5A0"},
  {val:8,emoji:"💪",label:"Strong",color:"#29ABE2"},
  {val:9,emoji:"🔥",label:"Excellent",color:"#4F7FFF"},
  {val:10,emoji:"🚀",label:"Breakthrough",color:"#9B5CFF"},
];

function isValidEmail(e) { return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(e.trim()); }
function getEmailError(email) {
  if (!email.trim()) return "Email is required.";
  if (!email.includes("@")) return "Email must include an @ symbol.";
  const parts = email.split("@");
  if (!parts[1]||!parts[1].includes(".")) return "Email must have a valid domain.";
  if (!isValidEmail(email)) return "Please enter a valid email address.";
  return null;
}

function getTheme(dark) {
  if (dark) return {
    bg:"#09090F", surface:"#111118", card:"#16161F", border:"#2A2A3A",
    text:"#F0F0FF", textMid:"#A0A0C0", muted:"#60607A",
    inputBg:"#16161F", inputBorder:"#2A2A3A", headerBg:"#0B1437"
  };
  return {
    bg:"#EEF2F7", surface:"#FFFFFF", card:"#FFFFFF", border:"#B8C4D4",
    text:"#0D1B2A", textMid:"#2D3748", muted:"#4A5568",
    inputBg:"#F8FAFC", inputBorder:"#94A3B8", headerBg:"#1A365D"
  };
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.round((new Date()-new Date(iso))/1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  return `${Math.round(diff/3600)}h ago`;
}

function isActive(energyUpdatedAt) {
  if (!energyUpdatedAt) return false;
  return (new Date()-new Date(energyUpdatedAt)) < 1000*60*30;
}

// ── UI COMPONENTS ──
function FOTCLogo({ size=100 }) {
  const blue="#29ABE2", grey="#B0B8C1", sc=size/100;
  return (
    <svg width={Math.round(340*sc)} height={Math.round(220*sc)} viewBox="0 0 340 220" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="52" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={grey}>FR</text>
      <text x="72" y="52" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={blue}>1</text>
      <text x="102" y="52" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={grey}>ENDS</text>
      <rect x="80" y="75" width="28" height="5" fill={blue} rx="2"/>
      <text x="4" y="90" fontFamily="Arial,sans-serif" fontWeight="600" fontSize="22" fill={grey}>of the</text>
      <text x="0" y="138" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={grey}>CH</text>
      <text x="80" y="138" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={blue}>1</text>
      <text x="110" y="138" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="52" fill={grey}>LDREN</text>
      <text x="0" y="190" fontFamily="Arial Black,Arial" fontWeight="900" fontSize="38" fill={blue}>New York</text>
    </svg>
  );
}

function AppIcon({ size=48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#29ABE2"/>
      <text x="50" y="38" textAnchor="middle" fill="white" fontSize="30" fontWeight="900" fontFamily="Arial Black,Arial">1</text>
      <rect x="16" y="46" width="68" height="7" fill="white" rx="3.5"/>
      <text x="50" y="82" textAnchor="middle" fill="white" fontSize="30" fontWeight="900" fontFamily="Arial Black,Arial">1</text>
    </svg>
  );
}

function RoleIcon({ role, size=48 }) {
  const r=ROLES.find(x=>x.id===role)||ROLES[0];
  return (
    <div style={{width:size,height:size,borderRadius:size*0.22,background:r.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",border:`2px solid ${r.color}33`}}>
      <img src={r.img} alt={r.label} style={{width:size*0.78,height:size*0.78,objectFit:"contain"}}/>
    </div>
  );
}

function PBar({ pct, color }) {
  return (
    <div style={{height:8,borderRadius:8,background:"#E0E6F0",overflow:"hidden"}}>
      <div style={{height:"100%",width:`${Math.min(100,Math.max(0,pct))}%`,background:color,borderRadius:8,transition:"width 0.5s"}}/>
    </div>
  );
}

function Btn({ children, onClick, color="#29ABE2", textColor, outline, style:extra={}, disabled, size="md" }) {
  const sizes={sm:{padding:"6px 14px",fontSize:13},md:{padding:"11px 22px",fontSize:15},lg:{padding:"14px 22px",fontSize:16,width:"100%"}};
  return (
    <button onClick={onClick} disabled={disabled}
      style={{...sizes[size],borderRadius:12,border:outline?`2px solid ${color}`:"none",background:outline?"transparent":color,color:textColor||(outline?color:"#fff"),fontWeight:800,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s",opacity:disabled?0.6:1,...extra}}>
      {children}
    </button>
  );
}

function Card({ children, style:extra={}, onClick, t }) {
  return <div onClick={onClick} style={{background:t.card,borderRadius:18,border:`1.5px solid ${t.border}`,padding:"1rem 1.25rem",marginBottom:14,boxShadow:"0 2px 12px rgba(0,0,0,0.08)",cursor:onClick?"pointer":"default",...extra}}>{children}</div>;
}

function TagChip({ code, small }) {
  const tag=FOTC_TAGS.find(t=>t.code===code);
  if (!tag) return null;
  return <span style={{background:tag.color+"22",border:`1px solid ${tag.color}55`,borderRadius:20,padding:small?"2px 8px":"4px 12px",fontSize:small?10:12,fontWeight:700,color:tag.color,display:"inline-flex",alignItems:"center",gap:4,margin:"2px"}}>{tag.code}</span>;
}

function Avatar({ name="?", size=36, color="#29ABE2", imgUrl }) {
  if (imgUrl) return <img src={imgUrl} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>;
  const initials=name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return <div style={{width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:size*0.35,fontWeight:800,flexShrink:0}}>{initials}</div>;
}

function PulseDot({ color="#00E5A0" }) {
  return <span style={{width:8,height:8,borderRadius:"50%",background:color,display:"inline-block",boxShadow:`0 0 0 3px ${color}44`}}/>;
}

function ThemeToggle({ darkMode, setDarkMode, t }) {
  return (
    <button onClick={()=>setDarkMode(!darkMode)}
      style={{background:darkMode?"#FFFFFF":"#E8F0FE",border:`1px solid ${t.border}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,fontWeight:700,color:darkMode?"#000000":t.text,fontFamily:"inherit"}}>
      {darkMode?"☀️ Light Mode":"🌙 Dark Mode"}
    </button>
  );
}

function FInput({ label, value, onChange, type="text", placeholder, t, error }) {
  const [focused,setFocused]=useState(false);
  return (
    <div style={{marginBottom:16}}>
      {label&&<label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:6,display:"block"}}>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`2px solid ${error?"#FF5C7A":focused?"#29ABE2":t.inputBorder}`,background:focused?t.surface:t.inputBg,color:t.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box",outline:"none",boxShadow:focused?"0 0 0 3px rgba(41,171,226,0.15)":"none",transition:"all 0.15s",fontWeight:500}}/>
      {error&&<div style={{fontSize:12,color:"#FF5C7A",marginTop:5,fontWeight:600}}>⚠ {error}</div>}
    </div>
  );
}

function PinDots({ length, color }) {
  return (
    <div style={{display:"flex",justifyContent:"center",gap:16,margin:"20px 0"}}>
      {[0,1,2,3].map(i=>(
        <div key={i} style={{width:22,height:22,borderRadius:"50%",background:i<length?color:"transparent",border:`2.5px solid ${i<length?color:"#CBD5E0"}`,transition:"all 0.2s",boxShadow:i<length?`0 0 0 4px ${color}22`:"none"}}/>
      ))}
    </div>
  );
}

function PinKeypad({ pin, setPin, onComplete, color="#29ABE2" }) {
  const handleDigit=d=>{
    if (pin.length>=4) return;
    const np=pin+d; setPin(np);
    if (np.length===4&&onComplete) onComplete(np);
  };
  return (
    <div>
      <PinDots length={pin.length} color={color}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {["1","2","3","4","5","6","7","8","9","","0","<"].map((d,i)=>(
          <button key={i} onClick={()=>d==="<"?setPin(p=>p.slice(0,-1)):d&&handleDigit(d)}
            style={{padding:"18px 10px",borderRadius:16,border:d?"2px solid #E0E6F0":"none",background:d?"#fff":"transparent",color:"#0D1B2A",fontSize:24,fontWeight:700,cursor:d?"pointer":"default",fontFamily:"inherit",boxShadow:d?"0 2px 8px rgba(0,0,0,0.06)":"none"}}>
            {d==="<"?(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#718096" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>):d}
          </button>
        ))}
      </div>
    </div>
  );
}

async function inferTags(text) {
  const systemPrompt = "You are a youth development data analyst for Friends of the Children New York (FOTC NY). Your job is to read mentor session summaries and tag them with the correct FOTC goal areas. You always respond with valid JSON only — no explanation, no markdown, no code fences.";

  const userPrompt = [
    "Tag this mentor session summary with the FOTC goal areas that apply.",
    "",
    "GOAL AREAS:",
    "LE = Learning and Education: tutoring, homework help, academic work, essay writing, school subjects, studying, school records, career exploration, working with teachers or school staff.",
    "HWB = Health Wellbeing and Fitness: healthy habits, diet, sleep, exercise, stress relief, mental health check-in, skipping meals, body health, food, physical activity, breathing techniques.",
    "CIB = Community Involvement and Belonging: park visits, walks in the community, volunteering, neighborhood activities, connecting with peers or community, extracurriculars, civic activities, outings.",
    "SEL = Social Emotional Learning: emotions, feelings, stress, confidence, self-awareness, self-regulation, mental state, attitude, motivation, coping, relationships, communication, anxiety.",
    "",
    "RULES:",
    "- Apply a tag if the summary mentions ANYTHING related to that area, even briefly.",
    "- You MUST return at least one tag.",
    "- Return ONLY a raw JSON object using exactly this format:",
    JSON.stringify({tags:["LE","SEL","HWB"],confidence:{LE:0.95,SEL:0.85,HWB:0.7},reasoning:{LE:"worked on English essay",SEL:"discussed stress and anxiety",HWB:"mentioned skipping breakfast and poor sleep"}}),
    "",
    "SESSION SUMMARY:",
    text,
  ].join("\n");

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
    const data = await res.json();
    console.log("Claude raw response:", JSON.stringify(data));

    if (data.error) {
      console.error("Claude API error:", data.error);
      return { tags: [], confidence: {}, reasoning: {}, error: data.error.message };
    }

    const raw = data.content?.[0]?.text || "";
    console.log("Claude text:", raw);

    if (!raw) return { tags: [], confidence: {}, reasoning: {}, error: "Empty response from Claude" };

    const cleaned = raw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { tags: [], confidence: {}, reasoning: {}, error: "No JSON found in: " + cleaned };

    const parsed = JSON.parse(jsonMatch[0]);
    parsed.tags = (parsed.tags || []).filter(t => ["LE","HWB","CIB","SEL"].includes(t));
    return parsed;
  } catch(e) {
    console.error("inferTags error:", e);
    return { tags: [], confidence: {}, reasoning: {}, error: e.message };
  }
}

// ── LOGIN SCREEN ──
function LoginScreen({ onLogin }) {
  const [screen,setScreen]=useState("home");
  const [selectedRole,setSelectedRole]=useState(null);
  const [pin,setPin]=useState("");
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [regPin,setRegPin]=useState("");
  const [regRole,setRegRole]=useState("mentor");
  const [err,setErr]=useState("");
  const [emailErr,setEmailErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [verificationSent,setVerificationSent]=useState(false);
  const t=getTheme(false);
  const padPin=p=>p+"fotc";
  const validateEmail=val=>{ const e=getEmailError(val); setEmailErr(e||""); return !e; };

  const verifyPin=async p=>{
    setLoading(true); setErr("");
    try {
      await signInWithEmailAndPassword(auth,email,padPin(p));
      const u=auth.currentUser;
      if (!u.emailVerified){ setErr("Please verify your email first."); await signOut(auth); setPin(""); setLoading(false); return; }
      const snap=await getDoc(doc(db,"users",u.uid));
      if (snap.exists()) onLogin({uid:u.uid,...snap.data()});
      else setErr("Account not found.");
    } catch { setErr("Incorrect PIN or email. Please try again."); setPin(""); }
    setLoading(false);
  };

  const handleRegister=async()=>{
    setErr(""); setEmailErr("");
    if (!name.trim()){ setErr("Please enter your full name."); return; }
    if (!validateEmail(email)) return;
    if (regPin.length<4){ setErr("PIN must be exactly 4 digits."); return; }
    setLoading(true);
    try {
      const cred=await createUserWithEmailAndPassword(auth,email.trim(),padPin(regPin));
      await sendEmailVerification(cred.user);
      await setDoc(doc(db,"users",cred.user.uid),{name:name.trim(),email:email.trim(),role:regRole,createdAt:new Date().toISOString()});
      await signOut(auth);
      setVerificationSent(true);
    } catch(e) {
      if (e.code==="auth/email-already-in-use") setEmailErr("This email is already registered.");
      else if (e.code==="auth/invalid-email") setEmailErr("This email address is not valid.");
      else setErr(e.message.replace("Firebase: ",""));
    }
    setLoading(false);
  };

  const roleForLogin=ROLES.find(r=>r.id===selectedRole);

  if (screen==="home") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0F7FF 0%,#E8F4FD 60%,#EEF2FF 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Inter',system-ui,sans-serif;}`}</style>
      <div style={{marginBottom:36}}><FOTCLogo size={120}/></div>
      <div style={{textAlign:"center",marginBottom:44,maxWidth:420}}>
        <div style={{fontSize:44,fontWeight:900,color:"#0D1B2A",letterSpacing:-2,lineHeight:1.1,marginBottom:14}}>Mentorship,<br/><span style={{color:"#29ABE2"}}>Reimagined.</span></div>
        <div style={{fontSize:17,color:"#4A5568",fontWeight:500,lineHeight:1.7}}>Connecting mentors, achievers, parents and supervisors in one powerful platform.</div>
      </div>
      <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:14}}>
        <button onClick={()=>setScreen("register")} style={{padding:"18px 24px",borderRadius:16,border:"none",background:"#29ABE2",color:"#fff",fontSize:18,fontWeight:900,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 24px #29ABE244",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <AppIcon size={28}/> Create New Account
        </button>
        <button onClick={()=>setScreen("roleSelect")} style={{padding:"18px 24px",borderRadius:16,border:"2.5px solid #0D1B2A",background:"#fff",color:"#0D1B2A",fontSize:18,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>Sign In</button>
      </div>
      <div style={{display:"flex",gap:10,marginTop:36,flexWrap:"wrap",justifyContent:"center",width:"100%",maxWidth:400}}>
        {ROLES.map(r=>(
          <div key={r.id} style={{background:r.bg,border:`1.5px solid ${r.color}33`,borderRadius:14,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,flex:"1 1 160px"}}>
            <div style={{width:32,height:32,borderRadius:8,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",border:`1px solid ${r.color}22`}}>
              <img src={r.img} alt={r.label} style={{width:26,height:26,objectFit:"contain"}}/>
            </div>
            <span style={{fontSize:13,fontWeight:700,color:r.color,whiteSpace:"nowrap"}}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (screen==="roleSelect") return (
    <div style={{minHeight:"100vh",background:"#F5F7FA",padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:460}}>
        <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",marginBottom:28,fontSize:15,display:"flex",alignItems:"center",gap:6}}>&#8592; Back</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <AppIcon size={60}/>
          <div style={{fontSize:30,fontWeight:900,color:"#0D1B2A",marginTop:14,letterSpacing:-1}}>Welcome Back</div>
          <div style={{fontSize:16,color:"#718096",marginTop:6,fontWeight:600}}>Who are you signing in as?</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {ROLES.map(r=>(
            <button key={r.id} onClick={()=>{setSelectedRole(r.id);setScreen("pinLogin");}}
              style={{background:"#fff",borderRadius:20,border:`2.5px solid ${r.color}33`,padding:"22px 16px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:12,boxShadow:"0 2px 16px rgba(0,0,0,0.07)",fontFamily:"inherit"}}>
              <div style={{width:64,height:64,borderRadius:20,background:r.bg,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${r.color}33`,overflow:"hidden"}}>
                <img src={r.img} alt={r.label} style={{width:46,height:46,objectFit:"contain"}}/>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:900,fontSize:16,color:"#0D1B2A"}}>{r.label}</div>
                <div style={{fontSize:11,color:"#718096",marginTop:3,fontWeight:500,lineHeight:1.4}}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{textAlign:"center",marginTop:24}}>
          <button onClick={()=>setScreen("register")} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",fontSize:14}}>Don't have an account? Create one</button>
        </div>
      </div>
    </div>
  );

  if (screen==="pinLogin") return (
    <div style={{minHeight:"100vh",background:"#F5F7FA",padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setScreen("roleSelect");setPin("");setErr("");}} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",marginBottom:28,fontSize:15,display:"flex",alignItems:"center",gap:6}}>&#8592; Back</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><RoleIcon role={selectedRole} size={72}/></div>
          <div style={{fontSize:28,fontWeight:900,color:"#0D1B2A",letterSpacing:-1}}>Sign In</div>
          <div style={{fontSize:15,color:"#718096",marginTop:4,fontWeight:600}}>{roleForLogin?.label}</div>
        </div>
        <div style={{background:"#fff",borderRadius:24,padding:"1.75rem",boxShadow:"0 4px 28px rgba(0,0,0,0.09)",border:"1px solid #E0E6F0"}}>
          <FInput label="Email Address" value={email} onChange={e=>{setEmail(e.target.value);if(emailErr)validateEmail(e.target.value);}} placeholder="you@fotcny.org" type="email" t={t} error={emailErr}/>
          <label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:4,display:"block"}}>Your 4-Digit PIN</label>
          {loading&&<div style={{textAlign:"center",color:"#718096",marginBottom:12,fontWeight:600}}>Verifying...</div>}
          {err&&<div style={{color:"#FF5C7A",fontSize:13,fontWeight:700,marginBottom:14,textAlign:"center",background:"#FFF0F0",borderRadius:10,padding:"10px 14px",border:"1px solid #FF5C7A33"}}>{err}</div>}
          <PinKeypad pin={pin} setPin={setPin} onComplete={p=>{if(email&&!getEmailError(email))verifyPin(p);else{validateEmail(email);setPin("");}}} color={roleForLogin?.color||"#29ABE2"}/>
        </div>
        <div style={{textAlign:"center",marginTop:20}}>
          <button onClick={()=>setScreen("register")} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",fontSize:14}}>New here? Create account</button>
        </div>
      </div>
    </div>
  );

  if (verificationSent) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0F7FF,#E8F4FD)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{maxWidth:420,width:"100%",background:"#fff",borderRadius:24,padding:"2.5rem 2rem",boxShadow:"0 8px 40px rgba(41,171,226,0.12)",border:"1px solid #E0E6F0",textAlign:"center"}}>
        <div style={{width:80,height:80,borderRadius:"50%",background:"#E3F2FD",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#29ABE2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <div style={{fontSize:26,fontWeight:900,color:"#0D1B2A",marginBottom:12}}>Check Your Email</div>
        <div style={{fontSize:15,color:"#4A5568",lineHeight:1.7,marginBottom:8}}>A verification link has been sent to</div>
        <div style={{fontSize:16,fontWeight:800,color:"#29ABE2",marginBottom:20}}>{email}</div>
        <div style={{fontSize:14,color:"#718096",lineHeight:1.7,marginBottom:28}}>Click the link in the email to verify your account, then come back to sign in.</div>
        <button onClick={()=>{setVerificationSent(false);setScreen("roleSelect");setPin("");setErr("");setName("");setRegPin("");}}
          style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:"#29ABE2",color:"#fff",fontSize:16,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>
          Go to Sign In
        </button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#F0F7FF,#E8F4FD)",padding:24,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:460}}>
        <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",marginBottom:24,fontSize:15,display:"flex",alignItems:"center",gap:6}}>&#8592; Back</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <AppIcon size={60}/>
          <div style={{fontSize:28,fontWeight:900,color:"#0D1B2A",marginTop:12,letterSpacing:-1}}>Create Account</div>
          <div style={{fontSize:15,color:"#718096",marginTop:6,fontWeight:500}}>Join FOTC NY today</div>
        </div>
        <div style={{background:"#fff",borderRadius:24,padding:"2rem",boxShadow:"0 4px 28px rgba(0,0,0,0.09)",border:"1px solid #E0E6F0"}}>
          <FInput label="Full Name" value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" t={t}/>
          <FInput label="Email Address" value={email} onChange={e=>{setEmail(e.target.value);if(emailErr)validateEmail(e.target.value);}} placeholder="you@fotcny.org" type="email" t={t} error={emailErr}/>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:8,display:"block"}}>Choose a 4-Digit PIN</label>
            <PinKeypad pin={regPin} setPin={setRegPin} color="#29ABE2"/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:10,display:"block"}}>I am a...</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {ROLES.map(r=>(
                <button key={r.id} onClick={()=>setRegRole(r.id)}
                  style={{padding:"14px 12px",borderRadius:16,border:`2.5px solid ${regRole===r.id?r.color:"#E0E6F0"}`,background:regRole===r.id?r.bg:"#F5F7FA",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:regRole===r.id?r.bg:"#F0F4FF",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",border:`1px solid ${r.color}33`}}>
                    <img src={r.img} alt={r.label} style={{width:28,height:28,objectFit:"contain"}}/>
                  </div>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontWeight:800,fontSize:13,color:regRole===r.id?r.color:"#0D1B2A"}}>{r.label}</div>
                    <div style={{fontSize:10,color:"#718096",marginTop:1}}>{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {err&&<div style={{color:"#FF5C7A",fontSize:13,fontWeight:700,marginBottom:14,background:"#FFF0F0",borderRadius:10,padding:"10px 14px",border:"1px solid #FF5C7A33"}}>{err}</div>}
          <button onClick={handleRegister} disabled={loading}
            style={{width:"100%",padding:"16px",borderRadius:14,border:"none",background:"#29ABE2",color:"#fff",fontSize:17,fontWeight:900,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",opacity:loading?0.7:1}}>
            {loading?"Creating Account...":"Create My Account"}
          </button>
          <div style={{textAlign:"center",marginTop:16,fontSize:13,color:"#718096"}}>A verification email will be sent to confirm your address.</div>
          <div style={{textAlign:"center",marginTop:10}}>
            <button onClick={()=>setScreen("roleSelect")} style={{background:"none",border:"none",color:"#718096",fontWeight:600,cursor:"pointer",fontSize:13}}>Already have an account? Sign in</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PROFILE SCREEN ──
function ProfileScreen({ user, setUser, t, onBack }) {
  const [name,setName]=useState(user.name||"");
  const [nickname,setNickname]=useState(user.nickname||"");
  const [avatar,setAvatar]=useState(user.avatar||null);
  const [newPin,setNewPin]=useState("");
  const [confirmPin,setConfirmPin]=useState("");
  const [pinStep,setPinStep]=useState("new");
  const [showPinChange,setShowPinChange]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [msgType,setMsgType]=useState("success");
  const padPin=p=>p+"fotc";
  const roleColor={mentor:"#4F7FFF",mentee:"#2E7D32",parent:"#FF7043",supervisor:"#FFD700"}[user.role]||"#29ABE2";
  const displayName=user.nickname||user.name||"?";

  const handleAvatar = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type === "image/gif") {
      setMsg("GIFs are not allowed."); setMsgType("error");
      setTimeout(() => setMsg(""), 3000); return;
    }
    // Compress image to max 400x400 and quality 0.7 before saving
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      setAvatar(compressed);
    };
    img.onerror = () => { setMsg("Could not load image. Try another."); setMsgType("error"); };
    img.src = url;
  };

  const saveProfile=async()=>{
    if (!name.trim()){ setMsg("Name cannot be empty."); setMsgType("error"); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db,"users",user.uid),{name:name.trim(),nickname:nickname.trim(),avatar:avatar||null});
      setUser(prev=>({...prev,name:name.trim(),nickname:nickname.trim(),avatar:avatar||null}));
      setMsg("Profile updated!"); setMsgType("success");
    } catch { setMsg("Failed to save. Try again."); setMsgType("error"); }
    setSaving(false);
    setTimeout(()=>setMsg(""),3000);
  };

  const finishPinChange=async confirmedPin=>{
    if (confirmedPin!==newPin){ setMsg("PINs don't match. Try again."); setMsgType("error"); setNewPin(""); setConfirmPin(""); setPinStep("new"); setTimeout(()=>setMsg(""),3000); return; }
    setSaving(true);
    try {
      await updatePassword(auth.currentUser,padPin(confirmedPin));
      setMsg("PIN updated successfully!"); setMsgType("success");
      setShowPinChange(false); setNewPin(""); setConfirmPin(""); setPinStep("new");
    } catch(e) {
      if (e.code==="auth/requires-recent-login") setMsg("Please log out and back in before changing your PIN.");
      else setMsg("Failed to update PIN.");
      setMsgType("error"); setNewPin(""); setConfirmPin(""); setPinStep("new");
    }
    setSaving(false); setTimeout(()=>setMsg(""),4000);
  };

  return (
    <div style={{padding:16,paddingBottom:80}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:"#29ABE2",fontWeight:700,cursor:"pointer",marginBottom:16,fontSize:15,display:"flex",alignItems:"center",gap:6}}>&#8592; Back</button>
      <div style={{fontSize:24,fontWeight:900,color:t.text,marginBottom:20}}>My Profile</div>
      <Card t={t} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{position:"relative"}}>
          {avatar
            ?<img src={avatar} alt="avatar" style={{width:90,height:90,borderRadius:"50%",objectFit:"cover",border:`3px solid ${roleColor}`}}/>
            :<div style={{width:90,height:90,borderRadius:"50%",background:roleColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,fontWeight:800,color:"#fff"}}>{displayName.slice(0,2).toUpperCase()}</div>
          }
          <label style={{position:"absolute",bottom:0,right:0,background:"#29ABE2",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",border:"2px solid #fff"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp" onChange={handleAvatar} style={{display:"none"}}/>
          </label>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:18,color:t.text}}>{displayName}</div>
          {user.nickname&&<div style={{fontSize:13,color:t.muted,marginTop:2}}>Full name: {user.name}</div>}
          <div style={{fontSize:12,color:roleColor,fontWeight:700,textTransform:"capitalize",marginTop:4}}>{user.role==="mentee"?"Achiever":user.role}</div>
        </div>
        {/* Photo source buttons */}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <label style={{flex:1,cursor:"pointer"}}>
            <div style={{background:"#29ABE215",border:"1.5px solid #29ABE244",borderRadius:10,padding:"7px 10px",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#29ABE2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span style={{fontSize:12,fontWeight:700,color:"#29ABE2"}}>Camera</span>
            </div>
            <input type="file" accept="image/*" capture="user" onChange={handleAvatar} style={{display:"none"}}/>
          </label>
          <label style={{flex:1,cursor:"pointer"}}>
            <div style={{background:t.inputBg,border:`1.5px solid ${t.border}`,borderRadius:10,padding:"7px 10px",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill={t.muted} stroke="none"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{fontSize:12,fontWeight:700,color:t.muted}}>Gallery</span>
            </div>
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp" onChange={handleAvatar} style={{display:"none"}}/>
          </label>
        </div>
      </Card>
      <Card t={t} style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>DISPLAY INFO</div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:6,display:"block"}}>Full Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:13,fontWeight:700,color:"#29ABE2",marginBottom:6,display:"block"}}>Nickname <span style={{fontSize:11,color:t.muted,fontWeight:400}}>(shown instead of full name)</span></label>
          <input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="e.g. J-Dub, Coach Max..." style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:15,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
        </div>
        <button onClick={saveProfile} disabled={saving} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"#29ABE2",color:"#fff",fontSize:15,fontWeight:800,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit",opacity:saving?0.7:1}}>
          {saving?"Saving...":"Save Changes"}
        </button>
      </Card>
      <Card t={t} style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SECURITY</div>
        {!showPinChange
          ?<button onClick={()=>setShowPinChange(true)} style={{width:"100%",padding:"13px",borderRadius:12,border:`2px solid ${t.border}`,background:t.inputBg,color:t.text,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Change PIN</button>
          :<div>
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:800,color:t.text}}>{pinStep==="new"?"Enter your new 4-digit PIN":"Confirm your new PIN"}</div>
              <div style={{fontSize:12,color:t.muted,marginTop:4}}>{pinStep==="new"?"Choose a PIN you'll remember":"Re-enter the same PIN to confirm"}</div>
            </div>
            <PinKeypad
              pin={pinStep==="new"?newPin:confirmPin}
              setPin={pinStep==="new"?setNewPin:setConfirmPin}
              onComplete={p=>pinStep==="new"?(setNewPin(p),setPinStep("confirm")):finishPinChange(p)}
              color={roleColor}
            />
            <button onClick={()=>{setShowPinChange(false);setNewPin("");setConfirmPin("");setPinStep("new");}} style={{width:"100%",marginTop:12,padding:"10px",borderRadius:10,border:`1.5px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          </div>
        }
      </Card>
      {msg&&<div style={{padding:"12px 16px",borderRadius:12,background:msgType==="success"?"#00E5A015":"#FF5C7A15",border:`1px solid ${msgType==="success"?"#00E5A044":"#FF5C7A44"}`,color:msgType==="success"?"#00E5A0":"#FF5C7A",fontWeight:700,fontSize:14,textAlign:"center"}}>{msg}</div>}
    </div>
  );
}

// ── ACHIEVER DETAIL (mentor view) ──
function AchieverDetail({ achiever, mentor, onBack, t, setTab, setStartSessionWrite }) {
  const [sessions,setSessions]=useState([]);
  const currentEnergy=achiever.energy?ENERGY_MAP[achiever.energy-1]:null;
  const tagCounts={};
  FOTC_TAGS.forEach(tg=>{tagCounts[tg.code]=sessions.filter(s=>s.goalTags?.includes(tg.code)).length;});
  const displayName=achiever.nickname||achiever.name||"Achiever";
  const active=isActive(achiever.energyUpdatedAt);
  const totalSessions=sessions.length;
  const confirmedSessions=sessions.filter(s=>s.parentConfirmed).length;

  useEffect(()=>{
    if(achiever.uid.startsWith("demo")){setSessions([]);return;}
    const q=query(collection(db,"sessions"),where("mentorId","==",mentor.uid),where("achieverId","==",achiever.uid));
    return onSnapshot(q,snap=>setSessions(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[achiever,mentor]);

  const getMood=session=>session.selMood?MOOD_MAP[Math.min(session.selMood-1,9)]:MOOD_MAP[6];

  return (
    <div style={{paddingBottom:100}}>
      {/* Hero Header */}
      <div style={{background:`linear-gradient(135deg, #0B1437 0%, #1a2a5e 100%)`,padding:"24px 20px 20px"}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:20,fontSize:14,display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20}}>&#8592; All Achievers</button>

        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
          <div style={{position:"relative",flexShrink:0}}>
            {achiever.avatar
              ?<img src={achiever.avatar} alt={displayName} style={{width:72,height:72,borderRadius:"50%",objectFit:"cover",border:"3px solid rgba(255,255,255,0.3)"}}/>
              :<div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:900,color:"#fff",border:"3px solid rgba(255,255,255,0.2)"}}>
                {displayName.slice(0,2).toUpperCase()}
              </div>
            }
            <div style={{position:"absolute",bottom:3,right:3,width:16,height:16,borderRadius:"50%",background:active?"#00E5A0":"#718096",border:"2.5px solid #0B1437"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>{displayName}</div>
            {achiever.nickname&&<div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>{achiever.name}</div>}
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
              <div style={{display:"flex",alignItems:"center",gap:5,background:active?"rgba(0,229,160,0.15)":"rgba(255,255,255,0.08)",borderRadius:20,padding:"4px 10px",border:`1px solid ${active?"rgba(0,229,160,0.3)":"rgba(255,255,255,0.1)"}`}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:active?"#00E5A0":"#718096"}}/>
                <span style={{fontSize:11,fontWeight:700,color:active?"#00E5A0":"rgba(255,255,255,0.4)"}}>
                  {active?`Active now`:"Offline"}
                </span>
              </div>
              {active&&<span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>· {timeAgo(achiever.energyUpdatedAt)}</span>}
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {[
            {label:"Sessions",val:totalSessions,color:"#29ABE2"},
            {label:"Confirmed",val:confirmedSessions,color:"#00E5A0"},
            {label:"Streak",val:"12d",color:"#FF5C7A"},
          ].map(st=>(
            <div key={st.label} style={{background:"rgba(255,255,255,0.07)",borderRadius:14,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.1)"}}>
              <div style={{fontSize:22,fontWeight:900,color:st.color,lineHeight:1}}>{st.val}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 16px 0"}}>
        {/* Live Energy */}
        {currentEnergy&&(
          <>
            <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,marginTop:4}}>CURRENT ENERGY</div>
            <div style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,padding:"16px",marginBottom:14,display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:42,lineHeight:1,flexShrink:0}}>{currentEnergy.emoji}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:18,color:"#9B5CFF"}}>{currentEnergy.label}</div>
                    <div style={{fontSize:12,color:t.muted,marginTop:2}}>Logged {timeAgo(achiever.energyUpdatedAt)}</div>
                  </div>
                  <div style={{background:"#9B5CFF15",borderRadius:10,padding:"4px 10px",border:"1px solid #9B5CFF33"}}>
                    <span style={{fontSize:14,fontWeight:900,color:"#9B5CFF"}}>{achiever.energy}<span style={{fontSize:10,color:t.muted}}>/10</span></span>
                  </div>
                </div>
                <div style={{height:6,borderRadius:6,background:t.border,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(achiever.energy/10)*100}%`,background:"linear-gradient(90deg,#9B5CFF,#C084FC)",borderRadius:6}}/>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Goal Area Breakdown */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>GOAL AREA BREAKDOWN</div>
        <div style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,padding:"16px",marginBottom:14}}>
          {FOTC_TAGS.map((tag,i)=>{
            const count=tagCounts[tag.code];
            const pct=totalSessions>0?Math.round((count/totalSessions)*100):0;
            return(
              <div key={tag.code} style={{marginBottom:i<3?14:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:700,color:t.text}}>{tag.code}</span>
                    <span style={{fontSize:12,color:t.muted}}>— {tag.label}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:t.muted}}>{count} session{count!==1?"s":""}</span>
                    <span style={{fontSize:12,fontWeight:800,color:tag.color,minWidth:35,textAlign:"right"}}>{pct}%</span>
                  </div>
                </div>
                <div style={{height:6,borderRadius:6,background:t.border,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:tag.color,borderRadius:6,transition:"width 0.5s"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Sessions */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>SESSION HISTORY</div>
        {sessions.length===0&&(
          <div style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,padding:"32px 20px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>📋</div>
            <div style={{fontWeight:700,fontSize:15,color:t.text,marginBottom:6}}>No sessions yet</div>
            <div style={{fontSize:13,color:t.muted,lineHeight:1.6}}>Log your first session with {displayName} to start tracking progress.</div>
          </div>
        )}
        {sessions.slice(0,5).map((session,i)=>{const mood=getMood(session);return(
          <div key={session.id} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,padding:"16px",marginBottom:10,borderLeft:`4px solid ${mood.color}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:t.text}}>{session.date}</div>
                <div style={{fontSize:12,color:t.muted,marginTop:2}}>{session.time} · {session.outingType}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>{mood.emoji}</span>
                <div style={{background:mood.color+"18",border:`1px solid ${mood.color}44`,borderRadius:20,padding:"3px 10px"}}>
                  <span style={{fontSize:11,fontWeight:700,color:mood.color}}>{mood.label}{session.selMood?` · ${session.selMood}/10`:""}</span>
                </div>
              </div>
            </div>
            {session.goalTags?.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                {session.goalTags.map(code=><TagChip key={code} code={code} small/>)}
              </div>
            )}
            {session.summary&&<div style={{fontSize:13,color:t.textMid,lineHeight:1.6,marginBottom:10}}>{session.summary}</div>}
            {/* Locations */}
            {session.locations?.filter(l=>l.trim()).length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:6}}>LOCATIONS</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {session.locations.filter(l=>l.trim()).map((loc,li)=>(
                    <div key={li} style={{display:"flex",alignItems:"center",gap:4,background:"#29ABE215",borderRadius:20,padding:"4px 10px",border:"1px solid #29ABE233"}}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#29ABE2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span style={{fontSize:11,fontWeight:700,color:"#29ABE2"}}>{loc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* External attendees */}
            {session.hasExternalAttendees&&session.externalAttendees?.filter(a=>a.firstName).length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:6}}>EXTERNAL ATTENDEES</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {session.externalAttendees.filter(a=>a.firstName).map((a,ai)=>(
                    <div key={ai} style={{background:"#9B5CFF15",borderRadius:20,padding:"4px 10px",border:"1px solid #9B5CFF33"}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#9B5CFF"}}>👤 {a.firstName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:12,paddingTop:10,borderTop:`1px solid ${t.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:session.achieverConfirmed?"#00E5A0":"#718096"}}/>
                <span style={{fontSize:11,color:session.achieverConfirmed?"#00E5A0":t.muted,fontWeight:600}}>Achiever {session.achieverConfirmed?"confirmed":"pending"}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:session.parentConfirmed?"#00E5A0":"#718096"}}/>
                <span style={{fontSize:11,color:session.parentConfirmed?"#00E5A0":t.muted,fontWeight:600}}>Parent {session.parentConfirmed?"confirmed":"pending"}</span>
              </div>
            </div>
          </div>
        );})}

        {/* Log Session CTA */}
        <button onClick={()=>{setStartSessionWrite(true);setTab("notes");}}
          style={{width:"100%",padding:"16px",borderRadius:16,border:"none",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",color:"#fff",fontSize:16,fontWeight:900,cursor:"pointer",fontFamily:"inherit",marginTop:8,boxShadow:"0 4px 20px rgba(41,171,226,0.35)"}}>
          + Log New Session with {displayName}
        </button>
      </div>
    </div>
  );
}

// ── MENTOR DASHBOARD ──
function MentorDash({ user, setTab, t, selectedAchiever, setSelectedAchiever, setSelectedAchieverId, setSelectedAchieverName, setStartSessionWrite }) {
  const [achievers,setAchievers]=useState(DEMO_ACHIEVERS);
  const [presenceMap,setPresenceMap]=useState({});
  const [announcements,setAnnouncements]=useState([]);
  const h=new Date().getHours();
  const greeting=h<12?"Good morning":h<17?"Good afternoon":"Good evening";

  useEffect(()=>{
    const q=query(collection(db,"users"),where("role","==","mentee"));
    return onSnapshot(q,snap=>{
      const real=snap.docs.map(d=>({uid:d.id,...d.data()}));
      setAchievers([...real,...DEMO_ACHIEVERS]);
    });
  },[]);

  useEffect(()=>{
    const presenceRef = ref(rtdb,"presence");
    const unsub = onValue(presenceRef, snap=>{
      const data = snap.val()||{};
      const map = {};
      Object.entries(data).forEach(([uid,val])=>{ map[uid]=val?.online||false; });
      setPresenceMap(map);
    });
    return ()=>unsub();
  },[]);

  // Load supervisor announcements
  useEffect(()=>{
    const q=query(collection(db,"announcements"),where("targetRole","in",["mentor","all"]));
    return onSnapshot(q,snap=>setAnnouncements(
      snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    ));
  },[]);

  if (selectedAchiever) return <AchieverDetail achiever={selectedAchiever} mentor={user} onBack={()=>{ setSelectedAchiever(null); setSelectedAchieverId(null); setSelectedAchieverName(null); }} t={t} setTab={setTab} setStartSessionWrite={setStartSessionWrite}/>;

  return (
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{background:t.surface,borderRadius:18,padding:20,marginBottom:20,border:`1px solid ${t.border}`}}>
        <div style={{fontSize:11,color:t.muted,fontWeight:700,letterSpacing:2,marginBottom:4}}>MENTOR DASHBOARD</div>
        <div style={{fontSize:26,fontWeight:900,color:t.text}}>{greeting}, <span style={{color:"#29ABE2"}}>{user.nickname||user.name?.split(" ")[0]}</span></div>
        <div style={{fontSize:13,color:t.muted,marginTop:6}}>{achievers.length} achiever{achievers.length!==1?"s":""} connected</div>
      </div>

      {/* Supervisor Announcements — always visible */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>📢</span> SUPERVISOR ANNOUNCEMENTS
        </div>
        {announcements.length===0?(
          <div style={{background:t.card,borderRadius:16,border:`1.5px solid ${t.border}`,padding:"16px",textAlign:"center"}}>
            <div style={{fontSize:20,marginBottom:6}}>📭</div>
            <div style={{fontSize:13,color:t.muted,fontWeight:600}}>No announcements yet</div>
            <div style={{fontSize:11,color:t.muted,marginTop:3}}>Your supervisor will post updates here</div>
          </div>
        ):(
          announcements.map(ann=>(
            <div key={ann.id} style={{background:`linear-gradient(135deg,#FFD70015,#FFD70008)`,borderRadius:16,border:"1.5px solid #FFD70044",padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"#FFD70022",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📢</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:t.text}}>{ann.title}</div>
                    <div style={{fontSize:11,color:t.muted,marginTop:1}}>From {ann.authorName||"Supervisor"} · {timeAgo(ann.createdAt)}</div>
                  </div>
                </div>
              </div>
              <div style={{fontSize:13,color:t.textMid,lineHeight:1.5,paddingLeft:40}}>{ann.body}</div>
            </div>
          ))
        )}
      </div>      <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>MY ACHIEVERS</div>
      {achievers.length===0&&<div style={{textAlign:"center",color:t.muted,padding:"3rem",fontSize:14}}>No achievers connected yet.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:14}}>
        {achievers.map(achiever=>{
          const displayName=achiever.nickname||achiever.name||"Achiever";
          const isOnline=presenceMap[achiever.uid]||false;
          const energyInfo=achiever.energy?ENERGY_MAP[achiever.energy-1]:null;
          return (
            <button key={achiever.uid} onClick={()=>{ setSelectedAchiever(achiever); setSelectedAchieverId(achiever.uid); setSelectedAchieverName(achiever.nickname||achiever.name||"Unknown Achiever"); }}
              style={{background:t.card,borderRadius:18,border:`1.5px solid ${isOnline?"#00E5A044":t.border}`,padding:"20px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,boxShadow:isOnline?"0 2px 16px rgba(0,229,160,0.12)":"0 2px 12px rgba(0,0,0,0.06)",fontFamily:"inherit",transition:"all 0.15s",textAlign:"center"}}>
              <div style={{position:"relative"}}>
                {achiever.avatar
                  ?<img src={achiever.avatar} alt={displayName} style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:`2.5px solid ${isOnline?"#00E5A0":t.border}`}}/>
                  :<div style={{width:64,height:64,borderRadius:"50%",background:"#29ABE2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"#fff",border:`2.5px solid ${isOnline?"#00E5A0":t.border}`}}>
                    {displayName.slice(0,2).toUpperCase()}
                  </div>
                }
                <div style={{position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:"50%",background:isOnline?"#00E5A0":"#718096",border:"2px solid #fff",boxShadow:isOnline?"0 0 6px #00E5A088":"none"}}/>
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:t.text,lineHeight:1.2}}>{displayName}</div>
                {achiever.nickname&&<div style={{fontSize:10,color:t.muted,marginTop:2}}>{achiever.name}</div>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:isOnline?"#00E5A0":"#718096"}}/>
                <span style={{fontSize:11,fontWeight:700,color:isOnline?"#00E5A0":t.muted}}>{isOnline?"Online":"Offline"}</span>
              </div>
              {energyInfo&&(
                <div style={{background:"#9B5CFF15",borderRadius:8,padding:"4px 10px",fontSize:12,color:"#9B5CFF",fontWeight:700}}>
                  {energyInfo.emoji} {achiever.energy}/10
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── SESSION LOG ──

function SessionLog({ user, setTab, t, selectedAchieverId, selectedAchieverName, onBack, startWriting }) {
  const [sessions,setSessions]=useState([]);
  const [writing,setWriting]=useState(startWriting||false);
  const [editingId,setEditingId]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiSuggestions,setAiSuggestions]=useState(null);
  const [saving,setSaving]=useState(false);
  const [draft,setDraft]=useState({outingType:"Individual",selMood:7,summary:"",focus:"",goalTags:[],parentNote:"",hasExternalAttendees:false,externalAttendees:[],locations:[],groupAchievers:[]});
  const [allAchievers,setAllAchievers]=useState([]);

  useEffect(()=>{
    const q=query(collection(db,"users"),where("role","==","mentee"));
    return onSnapshot(q,snap=>setAllAchievers(snap.docs.map(d=>({uid:d.id,...d.data()}))));
  },[]);

  useEffect(()=>{
    if (!user?.uid) return;
    const q = query(collection(db,"sessions"), where("mentorId","==",user.uid));
    return onSnapshot(q,snap=>{
      let list = snap.docs.map(d=>({id:d.id,...d.data()}));
      if (selectedAchieverId) list = list.filter(s=>s.achieverId===selectedAchieverId);
      setSessions(list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
    });
  },[user?.uid, selectedAchieverId]);

  const runAI=async()=>{
    if (!draft.summary.trim()) return;
    setAiLoading(true); setAiSuggestions(null);
    const result=await inferTags(draft.summary);
    // Auto-apply detected tags directly
    setDraft(p=>({...p,goalTags:result.tags||[]}));
    setAiSuggestions(result);
    setAiLoading(false);
  };

  const startEdit=session=>{
    setEditingId(session.id);
    setDraft({outingType:session.outingType||"Individual",selMood:session.selMood||7,summary:session.summary||"",focus:session.focus||"",goalTags:session.goalTags||[],parentNote:session.parentNote||"",hasExternalAttendees:session.hasExternalAttendees||false,externalAttendees:session.externalAttendees||[],locations:session.locations||[],groupAchievers:session.groupAchievers||[]});
    setAiSuggestions(null);
    setWriting(true);
  };

  const saveSession=async()=>{
    if (!draft.summary.trim()) return;
    setSaving(true);
    const now=new Date();
    if (editingId){
      await updateDoc(doc(db,"sessions",editingId),{...draft,updatedAt:now.toISOString()});
      setEditingId(null);
    } else {
      // Look up achiever's real name from Firestore
      let achieverName = selectedAchieverName || "Unknown Achiever";
      if (selectedAchieverId && !selectedAchieverName) {
        try {
          const aSnap = await getDoc(doc(db,"users",selectedAchieverId));
          if (aSnap.exists()) {
            const ad = aSnap.data();
            achieverName = ad.nickname || ad.name || ad.displayName || achieverName;
          }
        } catch {}
      }
      await addDoc(collection(db,"sessions"),{...draft,mentorId:user.uid,mentorName:user.name,achieverId:selectedAchieverId||null,achieverName,date:now.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}),time:now.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),createdAt:now.toISOString(),parentConfirmed:false,achieverConfirmed:false});
    }
    setDraft({outingType:"Individual",selMood:7,summary:"",focus:"",goalTags:[],parentNote:"",hasExternalAttendees:false,externalAttendees:[],locations:[],groupAchievers:[]});
    setAiSuggestions(null); setWriting(false); setSaving(false);
  };

  const currentMood=MOOD_MAP[Math.min(Math.max((draft.selMood||7)-1,0),9)];

  const userCache = useUserCache();
  // Group sessions by achiever — use live name from cache when available
  const sessionsByAchiever=sessions.reduce((acc,s)=>{
    const liveUser = s.achieverId ? userCache[s.achieverId] : null;
    const liveName = liveUser ? (liveUser.nickname||liveUser.name) : null;
    const key = liveName || (s.achieverName&&s.achieverName!=="Unknown Achiever"?s.achieverName:s.achieverId?"Achiever ("+s.achieverId.slice(0,6)+"...)":"Unknown Achiever");
    if(!acc[key]) acc[key]=[];
    acc[key].push({...s, _liveUser: liveUser});
    return acc;
  },{});

  // ── NEW / EDIT SESSION FORM ──
  if (writing) return (
    <div style={{paddingBottom:100}}>
      {/* Form Hero Header */}
      <div style={{background:"linear-gradient(135deg,#0B1437 0%,#1a2456 100%)",padding:"24px 20px 28px"}}>
        <button onClick={()=>{setWriting(false);setEditingId(null);if(onBack) onBack();}} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:20,fontSize:14,display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20}}>&#8592; {onBack?`Back to ${selectedAchieverName||"Achiever"}`:"Back"}</button>
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:6}}>{editingId?"EDITING SESSION":"NEW SESSION LOG"}</div>
        <div style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>{editingId?"Update Entry":"Log an Outing"}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>Document today's session with your achiever</div>
      </div>

      <div style={{padding:"20px 16px"}}>
        {/* Outing Type */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>OUTING TYPE</div>
        <div style={{display:"flex",gap:10,marginBottom:draft.outingType==="Group"?16:24}}>
          {[{id:"Individual",emoji:"👤",sub:"1-on-1 session"},{id:"Group",emoji:"👥",sub:"Group/chapter event"}].map(type=>(
            <button key={type.id} onClick={()=>setDraft(p=>({...p,outingType:type.id,groupAchievers:[]}))}
              style={{flex:1,padding:"16px 14px",borderRadius:16,border:`2px solid ${draft.outingType===type.id?"#29ABE2":t.border}`,background:draft.outingType===type.id?"#29ABE218":t.card,color:draft.outingType===type.id?"#29ABE2":t.muted,fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:15,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,boxShadow:draft.outingType===type.id?"0 0 0 3px #29ABE222":"none",transition:"all 0.15s"}}>
              <span style={{fontSize:22}}>{type.emoji}</span>
              <span>{type.id}</span>
              <span style={{fontSize:10,fontWeight:500,opacity:0.7}}>{type.sub}</span>
            </button>
          ))}
        </div>

        {/* Group achiever selector — shown when Group is selected */}
        {draft.outingType==="Group"&&(
          <div style={{marginBottom:24,background:t.card,borderRadius:16,border:`1.5px solid #29ABE244`,padding:"14px 16px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#29ABE2",letterSpacing:2,marginBottom:4}}>OTHER ACHIEVERS IN THIS SESSION</div>
            <div style={{fontSize:12,color:t.muted,marginBottom:12}}>{selectedAchieverName&&`${selectedAchieverName} is already included. `}Select any other achievers who joined.</div>
            {allAchievers.filter(a=>a.uid!==selectedAchieverId).length===0&&(
              <div style={{fontSize:12,color:t.muted,fontStyle:"italic"}}>No other achievers on your roster yet.</div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {allAchievers.filter(a=>a.uid!==selectedAchieverId).map(a=>{
                const displayName=a.nickname||a.name||"Achiever";
                const selected=draft.groupAchievers.includes(a.uid);
                return(
                  <button key={a.uid}
                    onClick={()=>setDraft(p=>({...p,groupAchievers:selected?p.groupAchievers.filter(id=>id!==a.uid):[...p.groupAchievers,a.uid]}))}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${selected?"#29ABE2":t.border}`,background:selected?"#29ABE215":t.inputBg,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
                    {a.avatar
                      ?<img src={a.avatar} alt={displayName} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
                      :<div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",flexShrink:0}}>{displayName.slice(0,2).toUpperCase()}</div>
                    }
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:t.text}}>{displayName}</div>
                      {a.name&&a.nickname&&<div style={{fontSize:11,color:t.muted}}>{a.name}</div>}
                    </div>
                    <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${selected?"#29ABE2":t.border}`,background:selected?"#29ABE2":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                      {selected&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  </button>
                );
              })}
            </div>
            {draft.groupAchievers.length>0&&(
              <div style={{marginTop:10,padding:"8px 12px",background:"#29ABE215",borderRadius:10,border:"1px solid #29ABE233"}}>
                <span style={{fontSize:12,fontWeight:700,color:"#29ABE2"}}>
                  {draft.groupAchievers.length+1} achievers total in this session ✓
                </span>
              </div>
            )}
          </div>
        )}

        {/* External Attendees */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>EXTERNAL ATTENDEES</div>
          <div style={{background:t.card,borderRadius:16,border:`1.5px solid ${t.border}`,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:t.text}}>Did anyone else join?</div>
                <div style={{fontSize:12,color:t.muted,marginTop:2}}>Family, friends, or other guests</div>
              </div>
              {/* Toggle switch */}
              <div onClick={()=>setDraft(p=>({...p,hasExternalAttendees:!p.hasExternalAttendees,externalAttendees:p.hasExternalAttendees?[]:[{firstName:"",lastName:""}]}))}
                style={{width:50,height:28,borderRadius:14,background:draft.hasExternalAttendees?"#29ABE2":"#718096",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:3,left:draft.hasExternalAttendees?24:3,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.25)"}}/>
              </div>
            </div>

            {/* Attendee fields */}
            {draft.hasExternalAttendees&&(
              <div style={{marginTop:14}}>
                {draft.externalAttendees.map((att,i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{fontSize:12,fontWeight:700,color:t.muted}}>Person {i+1}</div>
                      {draft.externalAttendees.length>1&&(
                        <button onClick={()=>setDraft(p=>({...p,externalAttendees:p.externalAttendees.filter((_,j)=>j!==i)}))}
                          style={{background:"#FF5C7A15",border:"1px solid #FF5C7A44",borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit"}}>
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      value={att.firstName}
                      onChange={e=>{const a=[...draft.externalAttendees];a[i]={...a[i],firstName:e.target.value};setDraft(p=>({...p,externalAttendees:a}));}}
                      placeholder="Full name (e.g. Marcus Johnson)"
                      style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:10}}
                      onFocus={e=>e.target.style.border=`1.5px solid #29ABE2`}
                      onBlur={e=>e.target.style.border=`1.5px solid ${t.inputBorder}`}
                    />
                  </div>
                ))}
                <button onClick={()=>setDraft(p=>({...p,externalAttendees:[...p.externalAttendees,{firstName:"",lastName:""}]}))}
                  style={{width:"100%",background:"#29ABE210",border:"1.5px dashed #29ABE244",borderRadius:10,padding:"9px",color:"#29ABE2",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
                  + Add Another Person
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Locations */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>LOCATIONS VISITED</div>
          <div style={{background:t.card,borderRadius:16,border:`1.5px solid ${t.border}`,padding:"14px 16px"}}>
            {draft.locations.length===0&&(
              <div style={{fontSize:13,color:t.muted,marginBottom:12}}>Where did you go? Add the places you visited.</div>
            )}
            {draft.locations.map((loc,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#29ABE222",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#29ABE2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <input value={loc} onChange={e=>{const l=[...draft.locations];l[i]=e.target.value;setDraft(p=>({...p,locations:l}));}}
                  placeholder={`Location ${i+1} (e.g. Central Park, BCNY HQ)`}
                  style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.border=`1.5px solid #29ABE2`}
                  onBlur={e=>e.target.style.border=`1.5px solid ${t.inputBorder}`}/>
                <button onClick={()=>setDraft(p=>({...p,locations:p.locations.filter((_,j)=>j!==i)}))}
                  style={{background:"#FF5C7A15",border:"1px solid #FF5C7A44",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:"#FF5C7A",fontSize:16,fontWeight:700}}>×</button>
              </div>
            ))}
            <button onClick={()=>setDraft(p=>({...p,locations:[...p.locations,""]}))}
              style={{width:"100%",background:"#29ABE210",border:"1.5px dashed #29ABE244",borderRadius:10,padding:"9px",color:"#29ABE2",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              + Add Location
            </button>
          </div>
        </div>

        {/* Session Mood — slider */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>SESSION MOOD</div>
        <div style={{background:t.card,borderRadius:20,border:`1px solid ${currentMood.color}44`,padding:"20px 18px",marginBottom:24,boxShadow:`0 2px 16px ${currentMood.color}12`,transition:"border 0.3s,box-shadow 0.3s"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            <div style={{width:64,height:64,borderRadius:18,background:currentMood.color+"18",border:`2px solid ${currentMood.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,flexShrink:0,transition:"background 0.3s"}}>
              {currentMood.emoji}
            </div>
            <div>
              <div style={{fontWeight:900,fontSize:22,color:currentMood.color,lineHeight:1,transition:"color 0.3s"}}>{currentMood.label}</div>
              <div style={{fontSize:12,color:t.muted,marginTop:3}}>Level {draft.selMood} out of 10</div>
            </div>
            <div style={{marginLeft:"auto",background:currentMood.color,borderRadius:12,width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.3s"}}>
              <span style={{fontSize:16,fontWeight:900,color:"#fff"}}>{draft.selMood}</span>
            </div>
          </div>
          <style>{`
            .mood-slider{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:8px;outline:none;cursor:pointer;}
            .mood-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:var(--mood-color,#29ABE2);cursor:pointer;box-shadow:0 0 0 4px var(--mood-glow,#29ABE233),0 2px 8px rgba(0,0,0,0.3);}
            .mood-slider::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:var(--mood-color,#29ABE2);cursor:pointer;border:none;}
          `}</style>
          <input type="range" min="1" max="10" step="1" value={Math.min(Math.max(draft.selMood||7,1),10)}
            onChange={e=>setDraft(p=>({...p,selMood:parseInt(e.target.value)||7}))}
            className="mood-slider"
            style={{"--mood-color":currentMood.color,"--mood-glow":currentMood.color+"33",background:`linear-gradient(to right, ${currentMood.color} ${(Math.min(Math.max(draft.selMood||7,1),10)-1)/9*100}%, ${t.border} ${(Math.min(Math.max(draft.selMood||7,1),10)-1)/9*100}%)`}}
          />
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {MOOD_MAP.map((m,i)=>{const sv=Math.min(Math.max(draft.selMood||7,1),10);return(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,width:"10%"}}>
                <span style={{fontSize:sv===m.val?14:10,transition:"font-size 0.1s",opacity:sv===m.val?1:0.4}}>{m.emoji}</span>
                <span style={{fontSize:9,color:sv===m.val?currentMood.color:t.muted,fontWeight:sv===m.val?800:400}}>{m.val}</span>
              </div>
            );})}
          </div>
        </div>


        {/* Text fields — summary and focus only */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>SESSION SUMMARY *</label>
          <textarea value={draft.summary} onChange={e=>{setDraft(p=>({...p,summary:e.target.value}));if(aiSuggestions) setAiSuggestions(null);}} placeholder="What happened? Energy, attitude, activities..." rows={5}
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.6,transition:"border 0.15s"}}
            onFocus={e=>e.target.style.border=`2px solid #29ABE2`}
            onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}
          />
          {/* Done button — triggers Gemini auto-tag */}
          {!aiSuggestions&&(
            <button onClick={runAI} disabled={aiLoading||!draft.summary.trim()}
              style={{marginTop:10,width:"100%",padding:"13px",borderRadius:14,border:"none",background:!draft.summary.trim()?"#718096":"linear-gradient(135deg,#9B5CFF,#7B3FE4)",color:"#fff",fontSize:15,fontWeight:900,cursor:!draft.summary.trim()?"not-allowed":"pointer",fontFamily:"inherit",opacity:!draft.summary.trim()?0.5:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}>
              {aiLoading?<><span style={{fontSize:18}}>🤖</span> Scanning summary...</>:<><span style={{fontSize:18}}>✅</span> Done — Auto-Tag with AI</>}
            </button>
          )}
        </div>

        {/* AI auto-tagged result — shown after Done is clicked */}
        {aiSuggestions&&(
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#9B5CFF",letterSpacing:2,textTransform:"uppercase"}}>FOTC TAGS — AUTO-DETECTED</div>
              <button onClick={()=>{setAiSuggestions(null);setDraft(p=>({...p,goalTags:[]}));}} style={{background:"none",border:"none",color:t.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Re-scan</button>
            </div>
            {draft.goalTags.length===0&&(
              <div style={{background:"#FF5C7A12",borderRadius:12,padding:12,border:"1px solid #FF5C7A44",marginBottom:10,fontSize:13,color:"#FF5C7A",fontWeight:600}}>
                ⚠ No tags detected — try adding more detail to your summary, or re-scan.
                {aiSuggestions.error&&<div style={{fontSize:11,marginTop:6,opacity:0.8,fontWeight:400}}>Debug: {aiSuggestions.error}</div>}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {FOTC_TAGS.map(tag=>{
                const detected=draft.goalTags.includes(tag.code);
                const conf=aiSuggestions.confidence?.[tag.code];
                return(
                  <div key={tag.code} style={{padding:"12px 14px",borderRadius:14,border:`2px solid ${detected?tag.color:t.border}`,background:detected?tag.color+"18":t.card,display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontWeight:900,fontSize:14,color:detected?tag.color:t.muted}}>{tag.code}</span>
                      {detected&&<span style={{fontSize:16}}>✓</span>}
                    </div>
                    <span style={{fontSize:10,color:detected?tag.color:t.muted,fontWeight:600,opacity:0.8}}>{tag.label}</span>
                    {detected&&conf&&<div style={{height:4,borderRadius:4,background:t.border,overflow:"hidden",marginTop:2}}><div style={{height:"100%",width:`${Math.round(conf*100)}%`,background:tag.color,borderRadius:4}}/></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next session focus */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>NEXT SESSION FOCUS</label>
          <textarea value={draft.focus} onChange={e=>setDraft(p=>({...p,focus:e.target.value}))} placeholder="Follow-up items, action steps?" rows={3}
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.6,transition:"border 0.15s"}}
            onFocus={e=>e.target.style.border=`2px solid #29ABE2`}
            onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}
          />
        </div>

        {/* Parent note */}
        <div style={{background:"#FF704312",borderRadius:16,padding:16,border:"1.5px solid #FF704344",marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:"#FF7043",letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>📝 NOTE FOR PARENT (OPTIONAL)</label>
          <textarea value={draft.parentNote} onChange={e=>setDraft(p=>({...p,parentNote:e.target.value}))} rows={3} placeholder="Anything the parent should know..."
            style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1px solid #FF704344",background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>

        {/* Save button — always visible */}
        <button onClick={saveSession} disabled={saving||!draft.summary.trim()}
          style={{width:"100%",padding:"18px",borderRadius:18,border:"none",background:saving||!draft.summary.trim()?"#718096":"linear-gradient(135deg,#29ABE2,#4F7FFF)",color:"#fff",fontSize:17,fontWeight:900,cursor:saving||!draft.summary.trim()?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:saving||!draft.summary.trim()?"none":"0 6px 24px rgba(41,171,226,0.4)",transition:"all 0.2s",marginBottom:8}}>
          {saving?"Saving...":editingId?"Update Session ✓":"Save Session & Notify Parent 🚀"}
        </button>
      </div>
    </div>
  );

  // ── JOURNAL HOME ──
  return (
    <div style={{padding:16,paddingBottom:80}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",borderRadius:20,padding:"20px",marginBottom:20}}>
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>MENTOR JOURNAL</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5,marginBottom:4}}>Outing Journal</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)"}}>{sessions.length} session{sessions.length!==1?"s":""} logged</div>
      </div>

      {/* Quick stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
        {[
          {label:"Total",val:sessions.length,color:"#29ABE2"},
          {label:"Confirmed",val:sessions.filter(s=>s.parentConfirmed).length,color:"#00E5A0"},
        ].map(st=>(
          <div key={st.label} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,padding:"14px 12px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:900,color:st.color,lineHeight:1}}>{st.val}</div>
            <div style={{fontSize:10,color:t.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* All sessions — grouped by achiever, sorted latest first */}
      {sessions.length===0&&(
        <div style={{textAlign:"center",padding:"4rem 2rem",background:t.card,borderRadius:20,border:`1px solid ${t.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>📓</div>
          <div style={{fontWeight:800,fontSize:16,color:t.text,marginBottom:6}}>No sessions logged yet</div>
          <div style={{fontSize:13,color:t.muted}}>Tap "Log New Session" to get started.</div>
        </div>
      )}
      {Object.entries(sessionsByAchiever).map(([achieverKey,achSessions])=>{
        const liveUser = achSessions[0]?._liveUser;
        const liveAvatar = liveUser?.avatar || null;
        return (
        <div key={achieverKey} style={{marginBottom:28}}>
          {/* Achiever name header — live from cache */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            {liveAvatar
              ?<img src={liveAvatar} alt={achieverKey} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
              :<div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",flexShrink:0}}>
                {achieverKey.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
              </div>
            }
            <div>
              <div style={{fontWeight:900,fontSize:15,color:t.text}}>{achieverKey}</div>
              <div style={{fontSize:11,color:t.muted,fontWeight:600}}>{achSessions.length} session{achSessions.length!==1?"s":""}</div>
            </div>
            <div style={{flex:1,height:1,background:t.border,marginLeft:4}}/>
          </div>
          {achSessions.map(session=>{
            const mood=MOOD_MAP[Math.min(Math.max((session.selMood||7)-1,0),9)];
            const energyInfo=session.selEnergy?ENERGY_MAP[Math.min(session.selEnergy-1,9)]:null;
            return(
              <div key={session.id} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,marginBottom:10,overflow:"hidden",borderLeft:`4px solid ${mood.color}`}}>
                <div style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:t.text}}>{session.date}</div>
                      <div style={{fontSize:12,color:t.muted,marginTop:2}}>{session.time} · {session.outingType}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:16}}>{mood.emoji}</span>
                      <div style={{background:mood.color+"22",border:`1px solid ${mood.color}55`,borderRadius:20,padding:"3px 10px"}}>
                        <span style={{fontSize:11,fontWeight:800,color:mood.color}}>{mood.label}{session.selMood?` · ${session.selMood}/10`:""}</span>
                      </div>
                    </div>
                  </div>
                  {energyInfo&&(
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,background:"#9B5CFF12",borderRadius:10,padding:"6px 12px",border:"1px solid #9B5CFF22"}}>
                      <span style={{fontSize:16}}>{energyInfo.emoji}</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#9B5CFF"}}>Energy {session.selEnergy}/10 — {energyInfo.label}</span>
                    </div>
                  )}
                  {session.goalTags?.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                      {session.goalTags.map(code=><TagChip key={code} code={code} small/>)}
                    </div>
                  )}
                  {session.summary&&<div style={{fontSize:13,color:t.textMid,lineHeight:1.6,marginBottom:10}}>{session.summary}</div>}
                  {/* Locations */}
                  {session.locations?.filter(l=>l.trim()).length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:6}}>LOCATIONS</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {session.locations.filter(l=>l.trim()).map((loc,li)=>(
                          <div key={li} style={{display:"flex",alignItems:"center",gap:4,background:"#29ABE215",borderRadius:20,padding:"4px 10px",border:"1px solid #29ABE233"}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#29ABE2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span style={{fontSize:11,fontWeight:700,color:"#29ABE2"}}>{loc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Who joined this session */}
                  {(session.outingType==="Group"&&session.groupAchievers?.length>0)||session.hasExternalAttendees&&session.externalAttendees?.filter(a=>a.firstName).length>0 ? (
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:6}}>WHO JOINED</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {/* Other achievers from roster (group session) */}
                        {session.groupAchievers?.map((uid,gi)=>{
                          const liveA = userCache[uid];
                          const aName = liveA ? (liveA.nickname||liveA.name) : uid.slice(0,8)+"...";
                          const aAvatar = liveA?.avatar||null;
                          return(
                            <div key={gi} style={{display:"flex",alignItems:"center",gap:5,background:"#29ABE215",borderRadius:20,padding:"4px 10px",border:"1px solid #29ABE233"}}>
                              {aAvatar
                                ?<img src={aAvatar} alt={aName} style={{width:16,height:16,borderRadius:"50%",objectFit:"cover"}}/>
                                :<div style={{width:16,height:16,borderRadius:"50%",background:"#29ABE2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:"#fff"}}>{aName.slice(0,1)}</div>
                              }
                              <span style={{fontSize:11,fontWeight:700,color:"#29ABE2"}}>{aName}</span>
                            </div>
                          );
                        })}
                        {/* External attendees */}
                        {session.hasExternalAttendees&&session.externalAttendees?.filter(a=>a.firstName).map((a,ai)=>(
                          <div key={`ext-${ai}`} style={{display:"flex",alignItems:"center",gap:5,background:"#9B5CFF15",borderRadius:20,padding:"4px 10px",border:"1px solid #9B5CFF33"}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9B5CFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span style={{fontSize:11,fontWeight:700,color:"#9B5CFF"}}>{a.firstName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:10,borderTop:`1px solid ${t.border}`}}>
                    <div style={{display:"flex",gap:12,fontSize:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:session.achieverConfirmed?"#00E5A0":"#718096"}}/>
                        <span style={{color:session.achieverConfirmed?"#00E5A0":t.muted,fontWeight:600}}>{session.achieverConfirmed?"Achiever ✓":"Achiever pending"}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:session.parentConfirmed?"#00E5A0":"#718096"}}/>
                        <span style={{color:session.parentConfirmed?"#00E5A0":t.muted,fontWeight:600}}>{session.parentConfirmed?"Parent ✓":"Parent pending"}</span>
                      </div>
                    </div>
                    <button onClick={()=>startEdit(session)} style={{background:"#29ABE215",border:"1.5px solid #29ABE244",borderRadius:10,padding:"4px 12px",fontSize:12,fontWeight:700,color:"#29ABE2",cursor:"pointer",fontFamily:"inherit"}}>Edit</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

// ── ACHIEVER DASHBOARD ──
function AchieverDash({ user, t }) {
  const [energy,setEnergy]=useState(5);
  const [burst,setBurst]=useState(false);
  const [goals,setGoals]=useState([]);
  const [sessions,setSessions]=useState([]);

  useEffect(()=>{
    const unsub=onSnapshot(doc(db,"users",user.uid),snap=>{
      if (snap.exists()&&snap.data().energy) setEnergy(snap.data().energy);
    });
    return unsub;
  },[user.uid]);

  // Load real goals
  useEffect(()=>{
    const q=query(collection(db,"goals"),where("achieverId","==",user.uid));
    return onSnapshot(q,snap=>setGoals(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[user.uid]);

  // Load real sessions
  useEffect(()=>{
    const q=query(collection(db,"sessions"),where("achieverId","==",user.uid));
    return onSnapshot(q,snap=>setSessions(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[user.uid]);

  const current=ENERGY_MAP[energy-1];
  const doneGoals=goals.filter(g=>g.done).length;
  const totalGoals=goals.length;
  const totalSessions=sessions.length;

  // XP: 100 per session + 200 per completed goal
  const xp = totalSessions*100 + doneGoals*200;
  const level = Math.max(1,Math.floor(xp/500)+1);
  const xpPct = ((xp%500)/500)*100;

  const handleRelease=async()=>{
    setBurst(true);
    setTimeout(()=>setBurst(false),2000);
    await updateDoc(doc(db,"users",user.uid),{energy,energyUpdatedAt:new Date().toISOString()});
  };

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1A237E)",padding:24}}>
        <div style={{fontSize:11,color:"#C6FF00",fontWeight:700,letterSpacing:2}}>ACHIEVER DASHBOARD</div>
        <div style={{fontSize:28,fontWeight:900,color:"#fff",margin:"4px 0 14px"}}>LET'S GO, <span style={{color:"#C6FF00"}}>{(user.nickname||user.name?.split(" ")[0]||"").toUpperCase()}</span></div>
        <Card t={{card:"rgba(255,255,255,0.08)",border:"rgba(255,255,255,0.15)"}} style={{marginBottom:0}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{background:"#C6FF00",borderRadius:8,padding:"3px 12px",fontWeight:900,fontSize:13,color:"#000"}}>LEVEL {level}</span>
            <span style={{fontSize:12,color:"#C6FF00",fontWeight:700}}>{500-(xp%500)} XP to Level {level+1}</span>
          </div>
          <PBar pct={xpPct} color="#C6FF00"/>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:6,fontWeight:700,letterSpacing:1}}>{xp} TOTAL XP EARNED</div>
        </Card>
      </div>
      <div style={{padding:16}}>
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"8px 0"}}>MY ENERGY RIGHT NOW</div>
        <Card t={t} style={{border:"1px solid #9B5CFF44",position:"relative",overflow:"hidden"}}>
          {burst&&(
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,pointerEvents:"none"}}>
              <style>{`@keyframes burstFade{0%{opacity:1;transform:scale(0.5)}50%{opacity:1;transform:scale(1.3)}100%{opacity:0;transform:scale(1.6)}}`}</style>
              {[...Array(8)].map((_,i)=>(
                <div key={i} style={{position:"absolute",fontSize:36,animation:`burstFade 1.8s ease-out forwards`,animationDelay:`${i*0.08}s`,transform:`rotate(${i*45}deg) translateY(-${40+Math.random()*30}px)`}}>{current.emoji}</div>
              ))}
              <div style={{fontSize:52,animation:`burstFade 2s ease-out forwards`}}>{current.emoji}</div>
            </div>
          )}
          <div style={{fontSize:12,color:t.textMid,marginBottom:14}}>Your mentor can see this in real time</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            {ENERGY_MAP.map((e,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,width:"10%"}}>
                <div style={{fontSize:energy===e.val?28:16,transition:"font-size 0.15s ease",transform:energy===e.val?"scale(1.3)":"scale(1)",filter:energy===e.val?"drop-shadow(0 0 6px #9B5CFF88)":"none"}}>{e.emoji}</div>
                <div style={{fontSize:9,color:energy===e.val?"#9B5CFF":t.muted,fontWeight:energy===e.val?800:400,textAlign:"center"}}>{e.val}</div>
                <div style={{fontSize:7,color:energy===e.val?"#9B5CFF":t.muted,fontWeight:energy===e.val?700:400,textAlign:"center",lineHeight:1.2,wordBreak:"break-word"}}>{e.label}</div>
              </div>
            ))}
          </div>
          <input type="range" min="1" max="10" step="1" value={energy}
            onChange={e=>setEnergy(parseInt(e.target.value))} onMouseUp={handleRelease} onTouchEnd={handleRelease}
            style={{width:"100%",accentColor:"#9B5CFF",cursor:"pointer",margin:"4px 0"}}/>
          <div style={{textAlign:"center",marginTop:10,padding:"8px 16px",background:"#9B5CFF15",borderRadius:12,border:"1px solid #9B5CFF33"}}>
            <span style={{fontSize:24,marginRight:8}}>{current.emoji}</span>
            <span style={{fontSize:15,fontWeight:800,color:"#9B5CFF"}}>{current.label}</span>
            <span style={{fontSize:12,color:t.muted,marginLeft:8}}>· {energy}/10</span>
          </div>
        </Card>
        {/* Real stats */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16,marginTop:16}}>
          {[
            {val:totalSessions.toString(),label:"Total Sessions",color:"#FF5C7A"},
            {val:xp.toString(),label:"Total XP",color:"#C6FF00"},
            {val:`${doneGoals}/${totalGoals||0}`,label:"Goals Done",color:"#00E5A0"},
            {val:`Level ${level}`,label:"Current Level",color:"#4F7FFF"},
          ].map(st=>(
            <Card key={st.label} t={t} style={{borderLeft:`4px solid ${st.color}`}}>
              <div style={{fontSize:26,fontWeight:900,color:st.color,lineHeight:1}}>{st.val}</div>
              <div style={{fontSize:9,color:t.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{st.label}</div>
            </Card>
          ))}
        </div>
        {/* Active goals preview */}
        {goals.filter(g=>!g.done).length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>MY ACTIVE GOALS</div>
            {goals.filter(g=>!g.done).slice(0,3).map(goal=>{
              const tag=FOTC_TAGS.find(tg=>tg.code===goal.fotcTag);
              const color=tag?.color||"#29ABE2";
              const pct=goal.progress||0;
              return(
                <div key={goal.id} style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:700,fontSize:14,color:t.text}}>{goal.title}</div>
                    <span style={{fontSize:12,fontWeight:800,color}}>{pct}%</span>
                  </div>
                  <PBar pct={pct} color={color}/>
                  {goal.targetDate&&<div style={{fontSize:11,color:t.muted,marginTop:4}}>Due {new Date(goal.targetDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MENTOR CONFIRM PANEL — direct Firestore lookup, no composite index ──
function MentorConfirmPanel({ goal, sg, t, onConfirm, onDeny }) {
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    const q = query(collection(db,"subgoalCompletions"), where("goalId","==",goal.id));
    const unsub = onSnapshot(q, snap => {
      const match = snap.docs
        .map(d=>({id:d.id,...d.data()}))
        .find(r=>r.subgoalId===sg.id && !r.confirmed);
      setReq(match||null);
      setLoading(false);
    });
    return ()=>unsub();
  }, [goal.id, sg.id]);

  if (loading) return <div style={{fontSize:11,color:"#FFB300",marginTop:6}}>Loading...</div>;

  return (
    <div style={{marginTop:8}}>
      {/* Full PhotoLightbox — same as chat photos */}
      {lightboxSrc&&<PhotoLightbox src={lightboxSrc} onClose={()=>setLightboxSrc(null)}/>}

      {req&&(req.proofFiles?.length>0||req.proofNote)&&(
        <div style={{background:t.inputBg,borderRadius:10,padding:"10px 12px",marginBottom:8,border:`1px solid ${t.border}`}}>
          <div style={{fontSize:10,fontWeight:700,color:"#FFB300",letterSpacing:1,marginBottom:8}}>📎 PROOF SUBMITTED</div>
          {req.proofFiles?.map((f,fi)=>(
            <div key={fi} style={{marginBottom:8}}>
              {f.type?.startsWith("image/")
                ? <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setLightboxSrc(f.dataUrl)}>
                    <img src={f.dataUrl} alt="proof"
                      style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:10,display:"block"}}/>
                    {/* Tap to expand overlay */}
                    <div style={{position:"absolute",inset:0,borderRadius:10,background:"rgba(0,0,0,0.18)",display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:8}}>
                      <div style={{background:"rgba(0,0,0,0.55)",borderRadius:6,padding:"3px 10px",fontSize:10,color:"#fff",fontWeight:700,backdropFilter:"blur(4px)"}}>
                        Tap to expand
                      </div>
                    </div>
                  </div>
                : <div style={{display:"flex",alignItems:"center",gap:8,background:t.card,borderRadius:8,padding:"8px 10px"}}>
                    <span style={{fontSize:20}}>📄</span>
                    <span style={{fontSize:12,fontWeight:600,color:t.text}}>{f.name}</span>
                  </div>
              }
            </div>
          ))}
          {req.proofNote&&(
            <div style={{fontSize:12,color:t.textMid,fontStyle:"italic",marginTop:4,padding:"6px 8px",background:t.card,borderRadius:8}}>
              "{req.proofNote}"
            </div>
          )}
        </div>
      )}
      {(!req||(!req.proofFiles?.length&&!req.proofNote))&&(
        <div style={{fontSize:11,color:t.muted,marginBottom:8,fontStyle:"italic"}}>No proof attached by achiever.</div>
      )}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onConfirm(goal,sg.id,req?.id)}
          style={{flex:1,background:"#00E5A015",border:"1.5px solid #00E5A044",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,color:"#00E5A0",cursor:"pointer",fontFamily:"inherit"}}>
          ✓ Confirm
        </button>
        <button onClick={()=>onDeny(goal,sg.id,req?.id)}
          style={{flex:1,background:"#FF5C7A15",border:"1.5px solid #FF5C7A44",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit"}}>
          ✗ Deny
        </button>
      </div>
    </div>
  );
}

// ── USER CACHE — live lookup of any user's name/avatar by UID ──
// Prevents stale names/avatars across sessions, goals, messages, journals
const UserCacheContext = React.createContext({});
function UserCacheProvider({ children }) {
  const [cache, setCache] = useState({});
  useEffect(() => {
    return onSnapshot(collection(db,"users"), snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = { uid:d.id, ...d.data() }; });
      setCache(map);
    });
  }, []);
  return <UserCacheContext.Provider value={cache}>{children}</UserCacheContext.Provider>;
}
function useUserCache() { return React.useContext(UserCacheContext); }
function useUser(uid) {
  const cache = useUserCache();
  return uid ? cache[uid] : null;
}
// Helper: get display name from cache, fall back to stored name
function getDisplayName(uid, storedName, cache) {
  const u = cache[uid];
  if (!u) return storedName || "Unknown";
  return u.nickname || u.name || storedName || "Unknown";
}
// Helper: get avatar from cache
function getAvatar(uid, cache) {
  return cache[uid]?.avatar || null;
}


function CalendarPicker({ value, onChange, t }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewDate, setViewDate] = useState(()=>{
    if (value) { const d=new Date(value); return {month:d.getMonth(),year:d.getFullYear()}; }
    return {month:today.getMonth(),year:today.getFullYear()};
  });
  const [mode, setMode] = useState("day");

  // Manual entry fields
  const [manYear, setManYear] = useState(value?value.split("-")[0]:"");
  const [manMonth, setManMonth] = useState(value?String(parseInt(value.split("-")[1])):"");
  const [manDay, setManDay] = useState(value?String(parseInt(value.split("-")[2])):"");
  const [manError, setManError] = useState("");

  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];

  // Parse selected from value string directly — avoids timezone issues
  const selectedStr = value || "";

  const isSameDay = (year, month, day) => {
    if (!selectedStr) return false;
    const [sy,sm,sd] = selectedStr.split("-").map(Number);
    return sy===year && sm===(month+1) && sd===day;
  };

  const isTodayCell = (year, month, day) => {
    return year===today.getFullYear() && month===today.getMonth() && day===today.getDate();
  };

  const isPastCell = (year, month, day) => {
    const d = new Date(year, month, day); d.setHours(0,0,0,0);
    return d < today;
  };

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month+1, 0).getDate();
  const cells = [];
  for (let i=0;i<firstDay;i++) cells.push(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(d);

  const selectDay = (day) => {
    if (!day) return;
    if (isPastCell(viewDate.year, viewDate.month, day)) return;
    const mm = String(viewDate.month+1).padStart(2,"0");
    const dd = String(day).padStart(2,"0");
    const iso = `${viewDate.year}-${mm}-${dd}`;
    onChange(iso);
    // Sync manual fields
    setManYear(String(viewDate.year));
    setManMonth(String(viewDate.month+1));
    setManDay(String(day));
    setManError("");
  };

  const applyManual = () => {
    const y=parseInt(manYear), m=parseInt(manMonth), d=parseInt(manDay);
    if (!y||!m||!d||m<1||m>12||d<1||d>31) { setManError("Enter a valid date"); return; }
    const date = new Date(y, m-1, d); date.setHours(0,0,0,0);
    if (date < today) { setManError("Date must be in the future"); return; }
    const mm=String(m).padStart(2,"0");
    const dd=String(d).padStart(2,"0");
    const iso=`${y}-${mm}-${dd}`;
    onChange(iso);
    setViewDate({month:m-1, year:y});
    setManError("");
  };

  const prevMonth = () => setViewDate(v=>v.month===0?{month:11,year:v.year-1}:{month:v.month-1,year:v.year});
  const nextMonth = () => setViewDate(v=>v.month===11?{month:0,year:v.year+1}:{month:v.month+1,year:v.year});

  const [yearOffset, setYearOffset] = useState(0);
  const baseYear = today.getFullYear();
  const yearRange = Array.from({length:18},(_,i)=>baseYear+yearOffset+i);

  const fieldStyle = {
    background:t.inputBg, border:`1.5px solid #29ABE244`, borderRadius:10,
    color:t.text, fontSize:15, fontFamily:"inherit", outline:"none",
    textAlign:"center", padding:"8px 4px", width:"100%",
  };

  return (
    <div style={{background:t.card,borderRadius:18,border:`2px solid #29ABE244`,overflow:"hidden",boxShadow:"0 4px 20px rgba(41,171,226,0.1)"}}>

      {/* Manual entry — separate Month / Day / Year fields */}
      <div style={{padding:"12px 14px",background:t.inputBg,borderBottom:`1px solid #29ABE222`}}>
        <div style={{fontSize:10,fontWeight:700,color:"#29ABE2",letterSpacing:1,marginBottom:8}}>OR ENTER DATE MANUALLY</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 2fr",gap:8,marginBottom:8}}>
          <div>
            <div style={{fontSize:10,color:t.muted,fontWeight:700,marginBottom:4,letterSpacing:1}}>MONTH</div>
            <select value={manMonth} onChange={e=>{setManMonth(e.target.value);setTimeout(applyManual,0);}}
              style={{...fieldStyle,cursor:"pointer"}}>
              <option value="">Month</option>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=>(
                <option key={m} value={String(i+1)}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:t.muted,fontWeight:700,marginBottom:4,letterSpacing:1}}>DAY</div>
            <input type="number" min="1" max="31" placeholder="DD" value={manDay}
              onChange={e=>setManDay(e.target.value)} onBlur={applyManual}
              style={fieldStyle}/>
          </div>
          <div>
            <div style={{fontSize:10,color:t.muted,fontWeight:700,marginBottom:4,letterSpacing:1}}>YEAR</div>
            <input type="number" min={today.getFullYear()} placeholder="YYYY" value={manYear}
              onChange={e=>setManYear(e.target.value)} onBlur={applyManual}
              style={fieldStyle}/>
          </div>
        </div>
        {manError&&<div style={{fontSize:11,color:"#FF5C7A",marginTop:2}}>{manError}</div>}
      </div>

      {/* Calendar header */}
      <div style={{background:"linear-gradient(135deg,#1A365D,#2A4A8A)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        {mode==="day"?<button onClick={prevMonth} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:10,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>:<div style={{width:34}}/>}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setMode(m=>m==="month"?"day":"month")}
            style={{background:mode==="month"?"#29ABE2":"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:14,fontFamily:"inherit"}}>
            {MONTHS[viewDate.month]}
          </button>
          <button onClick={()=>setMode(m=>m==="year"?"day":"year")}
            style={{background:mode==="year"?"#29ABE2":"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontWeight:800,fontSize:14,fontFamily:"inherit"}}>
            {viewDate.year}
          </button>
        </div>
        {mode==="day"?<button onClick={nextMonth} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:10,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>›</button>:<div style={{width:34}}/>}
      </div>

      {/* Month picker */}
      {mode==="month"&&(
        <div style={{padding:12,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {MONTHS.map((m,i)=>{
            const active=i===viewDate.month;
            return(
              <button key={m} onClick={()=>{setViewDate(v=>({...v,month:i}));setMode("day");}}
                style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${active?"#29ABE2":t.border}`,background:active?"#29ABE222":t.inputBg,color:active?"#29ABE2":t.text,fontWeight:active?800:500,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>
                {m.slice(0,3)}
              </button>
            );
          })}
        </div>
      )}

      {/* Year picker */}
      {mode==="year"&&(
        <div style={{padding:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button onClick={()=>setYearOffset(o=>o-18)} disabled={baseYear+yearOffset<=baseYear}
              style={{background:baseYear+yearOffset<=baseYear?t.border:"#29ABE222",border:"none",borderRadius:10,padding:"6px 14px",color:baseYear+yearOffset<=baseYear?t.muted:"#29ABE2",fontWeight:800,cursor:baseYear+yearOffset<=baseYear?"not-allowed":"pointer",fontFamily:"inherit",fontSize:13}}>‹ Prev</button>
            <span style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:1}}>{yearRange[0]} — {yearRange[yearRange.length-1]}</span>
            <button onClick={()=>setYearOffset(o=>o+18)}
              style={{background:"#29ABE222",border:"none",borderRadius:10,padding:"6px 14px",color:"#29ABE2",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>Next ›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {yearRange.map(y=>{
              const active=y===viewDate.year;
              return(
                <button key={y} onClick={()=>{setViewDate(v=>({...v,year:y}));setMode("day");}}
                  style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${active?"#29ABE2":t.border}`,background:active?"#29ABE222":t.inputBg,color:active?"#29ABE2":t.text,fontWeight:active?800:500,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Day grid */}
      {mode==="day"&&(
        <div style={{padding:"8px 12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
            {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:t.muted,padding:"6px 0",letterSpacing:0.5}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {cells.map((day,i)=>{
              if (!day) return <div key={`e${i}`}/>;
              const past = isPastCell(viewDate.year, viewDate.month, day);
              const todayCell = isTodayCell(viewDate.year, viewDate.month, day);
              const sel = isSameDay(viewDate.year, viewDate.month, day);
              return(
                <button key={`d${day}`}
                  onClick={()=>selectDay(day)}
                  disabled={past}
                  style={{
                    height:36, minWidth:0, padding:0,
                    borderRadius:10, border:"none",
                    background: sel?"#29ABE2":todayCell?"#29ABE222":"transparent",
                    color: sel?"#fff":past?"#444":todayCell?"#29ABE2":t.text,
                    fontWeight: sel||todayCell?800:400,
                    cursor: past?"default":"pointer",
                    fontSize:14, fontFamily:"inherit",
                    boxShadow: sel?"0 2px 10px #29ABE255":"none",
                  }}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SEASON GOAL ──
const SEASONS = [
  { id:"Summer", emoji:"☀️", color:"#FFB300" },
  { id:"Fall",   emoji:"🍂", color:"#FF7043" },
  { id:"Spring", emoji:"🌸", color:"#00E5A0" },
];

function SeasonGoalSection({ user, t, achieverId, achieverName, isMentor }) {
  const [seasonGoals, setSeasonGoals] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ season:"Summer", targetDate:"", targets:{ LE:0, HWB:0, CIB:0, SEL:0 } });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [expiredGoals, setExpiredGoals] = useState([]);

  useEffect(() => {
    if (!achieverId) return;
    const q = query(collection(db,"seasonGoals"), where("achieverId","==",achieverId));
    return onSnapshot(q, snap => {
      const today = new Date(); today.setHours(0,0,0,0);
      const all = snap.docs.map(d=>({id:d.id,...d.data()}));
      // kept:true means mentor chose to keep it for records — show in active, not expired
      const expired = all.filter(sg => {
        if (sg.kept) return false;
        if (!sg.targetDate) return false;
        const [y,m,d] = sg.targetDate.split("-").map(Number);
        const end = new Date(y, m-1, d); // local midnight
        return end < today;
      });
      const active = all.filter(sg => {
        if (sg.kept) return true; // kept for records — show as active
        if (!sg.targetDate) return false;
        const [y,m,d] = sg.targetDate.split("-").map(Number);
        const end = new Date(y, m-1, d);
        return end >= today;
      });
      setExpiredGoals(expired.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
      setSeasonGoals(active.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)));
    });
  }, [achieverId]);

  // Load sessions and goals to calculate actuals
  useEffect(() => {
    if (!achieverId) return;
    const q1 = query(collection(db,"sessions"), where("achieverId","==",achieverId));
    const q2 = query(collection(db,"goals"), where("achieverId","==",achieverId));
    const u1 = onSnapshot(q1, snap => setSessions(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(q2, snap => setGoals(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); };
  }, [achieverId]);

  const getActuals = (sg) => {
    const actuals = { LE:0, HWB:0, CIB:0, SEL:0 };
    // Parse start/end as local dates to avoid timezone offset issues
    const start = new Date(sg.createdAt);
    let end;
    if (sg.targetDate) {
      const [y,m,d] = sg.targetDate.split("-").map(Number);
      end = new Date(y, m-1, d, 23, 59, 59); // local end of day
    } else {
      end = new Date(); // now
    }
    sessions.forEach(s => {
      const d = new Date(s.createdAt||s.date);
      if (d >= start && d <= end) {
        (s.goalTags||[]).forEach(tag => { if (actuals[tag]!==undefined) actuals[tag]++; });
      }
    });
    goals.forEach(g => {
      const d = new Date(g.createdAt);
      if (d >= start && d <= end && g.fotcTag && actuals[g.fotcTag]!==undefined) {
        actuals[g.fotcTag]++;
      }
    });
    return actuals;
  };

  const saveSeasonGoal = async () => {
    if (!draft.targetDate) return;
    setSaving(true);
    await addDoc(collection(db,"seasonGoals"), {
      season: draft.season,
      targetDate: draft.targetDate,
      targets: draft.targets,
      achieverId,
      achieverName: achieverName||"Achiever",
      mentorId: user.uid,
      createdAt: new Date().toISOString(),
    });
    setDraft({ season:"Summer", targetDate:"", targets:{ LE:0, HWB:0, CIB:0, SEL:0 } });
    setAdding(false);
    setSaving(false);
  };

  const deleteSeasonGoal = async (id) => {
    await deleteDoc(doc(db,"seasonGoals",id));
  };

  if (!isMentor && seasonGoals.length===0 && expiredGoals.length===0) return null;

  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>SEASON GOALS</div>

      {/* Expired season goal prompts — ask mentor before deleting */}
      {isMentor&&expiredGoals.map(sg=>{
        const season = SEASONS.find(s=>s.id===sg.season)||SEASONS[0];
        const actuals = getActuals(sg);
        return(
          <div key={sg.id} style={{background:`linear-gradient(135deg,#FF5C7A18,#FF5C7A08)`,borderRadius:16,border:"2px solid #FF5C7A55",padding:"16px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:20}}>{season.emoji}</span>
              <div>
                <div style={{fontWeight:900,fontSize:14,color:"#FF5C7A"}}>Season Goal Ended</div>
                <div style={{fontSize:11,color:t.muted,marginTop:1}}>
                  {sg.season} · Ended {new Date(sg.targetDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                </div>
              </div>
            </div>
            {/* Final progress summary */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
              {FOTC_TAGS.map(tag=>{
                const target = sg.targets?.[tag.code]||0;
                const actual = actuals[tag.code]||0;
                const pct = target>0?Math.min(Math.round((actual/target)*100),100):0;
                if (target===0) return null;
                return(
                  <div key={tag.code} style={{background:t.card,borderRadius:10,padding:"8px 10px",border:`1px solid ${tag.color}33`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:800,color:tag.color}}>{tag.code}</span>
                      <span style={{fontSize:10,fontWeight:700,color:pct>=100?"#00E5A0":t.muted}}>{actual}/{target} {pct>=100?"✓":""}</span>
                    </div>
                    <div style={{height:5,borderRadius:5,background:t.border,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:tag.color,borderRadius:5}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:12,color:t.muted,marginBottom:10,lineHeight:1.4}}>
              This season goal has passed its due date. Remove it to set a new season goal, or keep it for your records.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>deleteSeasonGoal(sg.id)}
                style={{flex:1,padding:"10px",borderRadius:12,border:"none",background:"#FF5C7A",color:"#fff",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>
                Remove & Reset
              </button>
              <button onClick={async()=>{
                // Keep it — extend the targetDate by marking it as kept so it won't show as expired
                await updateDoc(doc(db,"seasonGoals",sg.id),{targetDate:"", kept:true});
              }}
                style={{flex:1,padding:"10px",borderRadius:12,border:`1.5px solid ${t.border}`,background:t.card,color:t.text,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Keep for Records
              </button>
            </div>
          </div>
        );
      })}

      {isMentor&&!adding&&(
        <button onClick={()=>setAdding(true)}
          style={{width:"100%",padding:"16px",borderRadius:18,border:"none",background:"linear-gradient(135deg,#FFB300,#FF7043)",color:"#fff",fontSize:16,fontWeight:900,cursor:"pointer",fontFamily:"inherit",marginBottom:16,boxShadow:"0 4px 20px rgba(255,179,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:20}}>☀️</span> New Season Goal
        </button>
      )}

      {isMentor&&adding&&(
        <button onClick={()=>setAdding(false)}
          style={{width:"100%",padding:"12px",borderRadius:14,border:"1.5px solid #FF5C7A44",background:"#FF5C7A15",color:"#FF5C7A",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>
          ✕ Cancel
        </button>
      )}

      {/* Add form */}
      {adding&&(
        <div style={{background:t.card,borderRadius:16,border:`1.5px solid #FFB30044`,padding:"16px",marginBottom:14}}>
          {/* Season picker */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:8}}>SEASON</div>
            <div style={{display:"flex",gap:8}}>
              {SEASONS.map(s=>{
                const active = draft.season===s.id;
                return(
                  <button key={s.id} onClick={()=>setDraft(p=>({...p,season:s.id}))}
                    style={{flex:1,padding:"10px 8px",borderRadius:12,border:`2px solid ${active?s.color:t.border}`,background:active?s.color+"18":t.inputBg,cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                    <div style={{fontSize:18}}>{s.emoji}</div>
                    <div style={{fontSize:12,fontWeight:800,color:active?s.color:t.muted,marginTop:2}}>{s.id}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due date */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:6}}>SEASON END DATE</div>
            <input type="date" value={draft.targetDate} onChange={e=>setDraft(p=>({...p,targetDate:e.target.value}))}
              min={new Date().toISOString().split("T")[0]}
              style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
              onFocus={e=>e.target.style.border="1.5px solid #FFB300"}
              onBlur={e=>e.target.style.border=`1.5px solid ${t.inputBorder}`}/>
          </div>

          {/* Targets per focus area */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:8}}>TARGET COUNT PER FOCUS AREA <span style={{fontWeight:400,opacity:0.7}}>(sessions + goals combined)</span></div>
            {FOTC_TAGS.map(tag=>(
              <div key={tag.code} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:tag.color+"18",border:`1.5px solid ${tag.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:900,color:tag.color}}>{tag.code}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:t.text}}>{tag.label}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>setDraft(p=>({...p,targets:{...p.targets,[tag.code]:Math.max(0,(p.targets[tag.code]||0)-1)}}))}
                    style={{width:30,height:30,borderRadius:8,border:`1px solid ${t.border}`,background:t.inputBg,color:t.text,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>−</button>
                  <div style={{width:40,textAlign:"center",fontSize:16,fontWeight:900,color:tag.color}}>{draft.targets[tag.code]||0}</div>
                  <button onClick={()=>setDraft(p=>({...p,targets:{...p.targets,[tag.code]:(p.targets[tag.code]||0)+1}}))}
                    style={{width:30,height:30,borderRadius:8,border:`1px solid ${t.border}`,background:t.inputBg,color:t.text,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>+</button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={saveSeasonGoal} disabled={saving||!draft.targetDate||Object.values(draft.targets).every(v=>v===0)}
            style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:saving||!draft.targetDate||Object.values(draft.targets).every(v=>v===0)?"#718096":"linear-gradient(135deg,#FFB300,#FF7043)",color:"#fff",fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>
            {saving?"Saving...":"Set Season Goal ✓"}
          </button>
          {Object.values(draft.targets).every(v=>v===0)&&<div style={{fontSize:11,color:t.muted,textAlign:"center",marginTop:6}}>Set at least one focus area target</div>}
        </div>
      )}

      {/* Season goal cards */}
      {seasonGoals.length===0&&!adding&&(
        <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,padding:"14px",textAlign:"center",color:t.muted,fontSize:13}}>
          No season goals set yet.{isMentor?" Tap \"+ New Season Goal\" to get started.":""}
        </div>
      )}

      {seasonGoals.map(sg=>{
        const season = SEASONS.find(s=>s.id===sg.season)||SEASONS[0];
        const actuals = getActuals(sg);
        const isExpanded = expanded===sg.id;
        return(
          <div key={sg.id} style={{background:t.card,borderRadius:16,border:`1.5px solid ${season.color}44`,marginBottom:10,overflow:"hidden",borderLeft:`4px solid ${season.color}`}}>
            <div style={{padding:"12px 14px",cursor:"pointer"}} onClick={()=>setExpanded(isExpanded?null:sg.id)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20}}>{season.emoji}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:t.text}}>{sg.season} Season Goal</div>
                    <div style={{fontSize:11,color:t.muted,marginTop:1}}>
                      {sg.targetDate?`Ends ${new Date(sg.targetDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:"No end date"}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {isMentor&&<button onClick={e=>{e.stopPropagation();deleteSeasonGoal(sg.id);}} style={{background:"#FF5C7A15",border:"1px solid #FF5C7A44",borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit"}}>Remove</button>}
                  <span style={{fontSize:12,color:t.muted}}>{isExpanded?"▲":"▼"}</span>
                </div>
              </div>
              {/* Mini overview bars */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {FOTC_TAGS.map(tag=>{
                  const target = sg.targets?.[tag.code]||0;
                  const actual = actuals[tag.code]||0;
                  const pct = target>0?Math.min(Math.round((actual/target)*100),100):0;
                  if (target===0) return null;
                  return(
                    <div key={tag.code}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:10,fontWeight:700,color:tag.color}}>{tag.code}</span>
                        <span style={{fontSize:10,color:t.muted,fontWeight:600}}>{actual}/{target}</span>
                      </div>
                      <div style={{height:6,borderRadius:6,background:t.border,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:tag.color,borderRadius:6,transition:"width 0.4s ease"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Expanded detail */}
            {isExpanded&&(
              <div style={{borderTop:`1px solid ${t.border}`,padding:"12px 14px",background:t.inputBg}}>
                <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:1,marginBottom:10}}>FOCUS AREA BREAKDOWN</div>
                {FOTC_TAGS.map(tag=>{
                  const target = sg.targets?.[tag.code]||0;
                  const actual = actuals[tag.code]||0;
                  const pct = target>0?Math.min(Math.round((actual/target)*100),100):0;
                  return(
                    <div key={tag.code} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:28,height:28,borderRadius:8,background:tag.color+"18",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <span style={{fontSize:10,fontWeight:900,color:tag.color}}>{tag.code}</span>
                          </div>
                          <span style={{fontSize:13,fontWeight:700,color:t.text}}>{tag.label}</span>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <span style={{fontSize:14,fontWeight:900,color:tag.color}}>{actual}</span>
                          <span style={{fontSize:11,color:t.muted}}>/{target>0?target:"—"}</span>
                          {target>0&&<span style={{fontSize:11,color:pct>=100?"#00E5A0":tag.color,fontWeight:700,marginLeft:6}}>{pct}%</span>}
                        </div>
                      </div>
                      {target>0?(
                        <div style={{height:8,borderRadius:8,background:t.border,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${tag.color},${tag.color}CC)`,borderRadius:8,transition:"width 0.5s ease",position:"relative"}}>
                            {pct>=100&&<div style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:8}}>✓</div>}
                          </div>
                        </div>
                      ):(
                        <div style={{fontSize:11,color:t.muted,fontStyle:"italic"}}>No target set for this area</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── GOALS ──
const MILESTONES = [15, 30, 50, 75, 100];

function Goals({ user, t }) {
  const isMentor = user.role === "mentor";
  const [achievers, setAchievers] = useState(DEMO_ACHIEVERS);
  const [selectedAchiever, setSelectedAchiever] = useState(null);
  const [goals, setGoals] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null); // goal being edited
  const [expandedGoal, setExpandedGoal] = useState(null);
  const [draft, setDraft] = useState({ title:"", fotcTag:"LE", targetDate:"", note:"", subgoals:["","",""] });
  const [saving, setSaving] = useState(false);
  const [submittingSubgoal, setSubmittingSubgoal] = useState(null);
  const [proofNote, setProofNote] = useState("");
  const [proofFiles, setProofFiles] = useState([]);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState([]); // subgoal completions pending mentor confirm

  useEffect(() => {
    if (!isMentor) return;
    const q = query(collection(db,"users"), where("role","==","mentee"));
    return onSnapshot(q, snap => {
      const real = snap.docs.map(d=>({uid:d.id,...d.data()}));
      setAchievers([...real,...DEMO_ACHIEVERS]);
    });
  }, [isMentor]);

  useEffect(() => {
    const uid = isMentor ? selectedAchiever?.uid : user.uid;
    if (!uid) { setGoals([]); return; }
    const q = query(collection(db,"goals"), where("achieverId","==",uid));
    return onSnapshot(q, snap => setGoals(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
  }, [selectedAchiever, user.uid, isMentor]);

  // Load pending confirmations — query by single field only, filter client-side (no composite index needed)
  useEffect(() => {
    if (isMentor) {
      const q = query(collection(db,"subgoalCompletions"), where("mentorId","==",user.uid));
      return onSnapshot(q, snap => setPendingConfirm(snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.confirmed)));
    } else {
      const q = query(collection(db,"subgoalCompletions"), where("achieverId","==",user.uid));
      return onSnapshot(q, snap => setPendingConfirm(snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.confirmed)));
    }
  }, [isMentor, user.uid]);

  const saveGoal = async () => {
    if (!draft.title.trim()||!draft.targetDate) return;
    setSaving(true);
    const achieverId = isMentor ? selectedAchiever?.uid : user.uid;
    const achieverName = isMentor ? (selectedAchiever?.nickname||selectedAchiever?.name||"Achiever") : (user.nickname||user.name);
    const tag = FOTC_TAGS.find(tg=>tg.code===draft.fotcTag);
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(draft.targetDate); target.setHours(0,0,0,0);
    const daysRemaining = Math.max(1, Math.ceil((target-today)/(1000*60*60*24)));
    const validSubgoals = draft.subgoals
      .map((s,i)=>({ id:`sg_${Date.now()}_${i}`, title:(typeof s==="object"?s.title:s).trim(), done:false, pendingConfirm:false }))
      .filter(sg=>sg.title);
    await addDoc(collection(db,"goals"), {
      title: draft.title.trim(),
      fotcTag: draft.fotcTag,
      color: tag?.color||"#29ABE2",
      targetDate: draft.targetDate,
      target: daysRemaining,
      progress: 0,
      note: draft.note.trim(),
      achieverId,
      achieverName,
      mentorId: isMentor ? user.uid : null,
      mentorName: user.name||user.nickname,
      done: false,
      createdAt: new Date().toISOString(),
      subgoals: validSubgoals,
    });
    setDraft({ title:"", fotcTag:"LE", targetDate:"", note:"", subgoals:["","",""] });
    setAdding(false);
    setSaving(false);
  };

  // Achiever submits proof + marks subgoal complete → sends to mentor for confirmation
  const achieverCompleteSubgoal = async (goal, sgId, note, files) => {
    setUploadingProof(true);
    const updatedSubgoals = goal.subgoals.map(sg=>sg.id===sgId?{...sg,pendingConfirm:true}:sg);
    await updateDoc(doc(db,"goals",goal.id), { subgoals:updatedSubgoals });
    await addDoc(collection(db,"subgoalCompletions"), {
      goalId: goal.id,
      goalTitle: goal.title,
      subgoalId: sgId,
      subgoalTitle: goal.subgoals.find(s=>s.id===sgId)?.title,
      achieverId: goal.achieverId,
      achieverName: goal.achieverName,
      mentorId: goal.mentorId,
      confirmed: false,
      proofNote: note||"",
      proofFiles: files||[],
      createdAt: new Date().toISOString(),
    });
    setSubmittingSubgoal(null);
    setProofNote("");
    setProofFiles([]);
    setUploadingProof(false);
  };

  // Achiever unsubmits — pulls back pending confirmation
  const unsubmitSubgoal = async (goal, sgId, confirmationId) => {
    const updatedSubgoals = goal.subgoals.map(sg=>sg.id===sgId?{...sg,pendingConfirm:false}:sg);
    await updateDoc(doc(db,"goals",goal.id), { subgoals:updatedSubgoals });
    await deleteDoc(doc(db,"subgoalCompletions",confirmationId));
  };

  // Mentor confirms a subgoal → progress = done/total * 100
  const mentorConfirmSubgoal = async (goal, sgId, confirmationId) => {
    const updatedSubgoals = goal.subgoals.map(sg=>sg.id===sgId?{...sg,done:true,pendingConfirm:false}:sg);
    const doneSGs = updatedSubgoals.filter(sg=>sg.done).length;
    const totalSGs = updatedSubgoals.length;
    const pct = totalSGs > 0 ? Math.round((doneSGs/totalSGs)*100) : 0;
    await updateDoc(doc(db,"goals",goal.id), { subgoals:updatedSubgoals, progress:pct, done:pct===100 });
    if (confirmationId) await updateDoc(doc(db,"subgoalCompletions",confirmationId), { confirmed:true });
  };

  // Mentor denies a subgoal
  const mentorDenySubgoal = async (goal, sgId, confirmationId) => {
    const updatedSubgoals = goal.subgoals.map(sg=>sg.id===sgId?{...sg,pendingConfirm:false}:sg);
    await updateDoc(doc(db,"goals",goal.id), { subgoals:updatedSubgoals });
    if (confirmationId) await updateDoc(doc(db,"subgoalCompletions",confirmationId), { confirmed:true, denied:true });
  };

  const deleteGoal = async (id) => {
    setDeletingId(id);
    try { await deleteDoc(doc(db,"goals",id)); } catch {}
    setDeletingId(null);
  };

  const saveEditGoal = async () => {
    if (!draft.title.trim()||!draft.targetDate) return;
    setSaving(true);
    const tag = FOTC_TAGS.find(tg=>tg.code===draft.fotcTag);
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(draft.targetDate); target.setHours(0,0,0,0);
    const daysRemaining = Math.max(1, Math.ceil((target-today)/(1000*60*60*24)));
    const validSubgoals = draft.subgoals.map((s,i)=>{
      const titleStr = (typeof s==="object" ? (s.title||"") : (s||"")).trim();
      const existing = editingGoal.subgoals?.find(sg=>sg.id===(typeof s==="object"?s.id:null));
      return existing
        ? {...existing, title:titleStr}
        : { id:`sg_${Date.now()}_${i}_new`, title:titleStr, done:false, pendingConfirm:false };
    }).filter(sg=>sg.title);
    // Recalculate progress based on updated subgoals
    const doneSGs = validSubgoals.filter(sg=>sg.done).length;
    const pct = validSubgoals.length > 0 ? Math.round((doneSGs/validSubgoals.length)*100) : 0;
    await updateDoc(doc(db,"goals",editingGoal.id), {
      title: draft.title.trim(),
      fotcTag: draft.fotcTag,
      color: tag?.color||"#29ABE2",
      targetDate: draft.targetDate,
      target: daysRemaining,
      subgoals: validSubgoals,
      progress: pct,
      done: pct===100,
      note: draft.note.trim(),
      updatedAt: new Date().toISOString(),
    });
    setEditingGoal(null);
    setDraft({ title:"", fotcTag:"LE", targetDate:"", note:"", subgoals:["","",""] });
    setSaving(false);
  };

  const startEditGoal = (goal) => {
    setEditingGoal(goal);
    setDraft({
      title: goal.title,
      fotcTag: goal.fotcTag,
      targetDate: goal.targetDate||"",
      note: goal.note||"",
      subgoals: goal.subgoals?.length > 0 ? goal.subgoals.map(sg=>({id:sg.id,title:sg.title,done:sg.done,pendingConfirm:sg.pendingConfirm})) : [""],
    });
  };

  const activeGoals = goals.filter(g=>!g.done);
  const doneGoals = goals.filter(g=>g.done);

  // ── MENTOR: Achiever grid ──
  if (isMentor && !selectedAchiever) return (
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",borderRadius:20,padding:"20px",marginBottom:20}}>
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>MENTOR</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>Goals</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>Select an achiever to manage their goals</div>
      </div>

      {/* Pending confirmations banner */}
      {pendingConfirm.length>0&&(
        <div style={{background:"#FFB30015",borderRadius:16,border:"1.5px solid #FFB30055",padding:"14px 16px",marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:800,color:"#FFB300",marginBottom:8}}>⏳ {pendingConfirm.length} SUBGOAL{pendingConfirm.length>1?"S":""} AWAITING YOUR CONFIRMATION</div>
          {pendingConfirm.slice(0,3).map(pc=>(
            <div key={pc.id} style={{fontSize:12,color:t.textMid,marginBottom:4}}>• <b>{pc.achieverName}</b> — {pc.subgoalTitle}</div>
          ))}
          {pendingConfirm.length>3&&<div style={{fontSize:11,color:t.muted}}>+{pendingConfirm.length-3} more...</div>}
        </div>
      )}

      <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>MY ACHIEVERS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:14}}>
        {achievers.map(achiever=>{
          const displayName = achiever.nickname||achiever.name||"Achiever";
          const pendingCount = pendingConfirm.filter(p=>p.achieverId===achiever.uid).length;
          return (
            <button key={achiever.uid} onClick={()=>setSelectedAchiever(achiever)}
              style={{background:t.card,borderRadius:18,border:`1.5px solid ${pendingCount>0?"#FFB300":t.border}`,padding:"20px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,fontFamily:"inherit",transition:"all 0.15s",textAlign:"center",position:"relative"}}>
              {pendingCount>0&&<div style={{position:"absolute",top:10,right:10,background:"#FFB300",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:"#000"}}>{pendingCount}</div>}
              {achiever.avatar
                ?<img src={achiever.avatar} alt={displayName} style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",border:"2.5px solid #29ABE2"}}/>
                :<div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:"#fff"}}>{displayName.slice(0,2).toUpperCase()}</div>
              }
              <div>
                <div style={{fontWeight:800,fontSize:13,color:t.text}}>{displayName}</div>
                {achiever.nickname&&achiever.name&&<div style={{fontSize:11,color:t.muted,marginTop:2}}>{achiever.name}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── GOAL FORM ──
  if (adding) return (
    <div style={{paddingBottom:100}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",padding:"24px 20px 28px"}}>
        <button onClick={()=>setAdding(false)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:20,fontSize:14,display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontFamily:"inherit"}}>&#8592; Back</button>
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:6}}>NEW GOAL</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff"}}>Assign a Goal</div>
        {isMentor&&<div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>For {selectedAchiever?.nickname||selectedAchiever?.name}</div>}
      </div>
      <div style={{padding:"20px 16px"}}>
        {/* Title */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>GOAL TITLE *</label>
          <input value={draft.title} onChange={e=>setDraft(p=>({...p,title:e.target.value}))} placeholder="e.g. Read 20 minutes every day"
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:15,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.border=`2px solid #29ABE2`} onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}/>
        </div>
        {/* FOTC Tag */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,display:"block"}}>FOTC GOAL AREA</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {FOTC_TAGS.map(tag=>{
              const active=draft.fotcTag===tag.code;
              return(
                <button key={tag.code} onClick={()=>setDraft(p=>({...p,fotcTag:tag.code}))}
                  style={{padding:"14px 12px",borderRadius:14,border:`2px solid ${active?tag.color:t.border}`,background:active?tag.color+"18":t.card,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
                  <div style={{fontWeight:900,fontSize:14,color:active?tag.color:t.muted}}>{tag.code}</div>
                  <div style={{fontSize:10,color:active?tag.color:t.muted,fontWeight:600,marginTop:2,opacity:0.8}}>{tag.label}</div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Subgoals */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>SUBGOALS / CHECKPOINTS</label>
          <div style={{fontSize:11,color:t.muted,marginBottom:10}}>Each checkpoint the achiever completes needs your confirmation before progress updates.</div>
          {draft.subgoals.map((sg,i)=>{
            const val = typeof sg==="object" ? sg.title : sg;
            return (
              <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#29ABE222",border:"1.5px solid #29ABE244",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#29ABE2",flexShrink:0}}>{i+1}</div>
                <input value={val} onChange={e=>{const s=[...draft.subgoals];s[i]=e.target.value;setDraft(p=>({...p,subgoals:s}));}}
                  placeholder={`Checkpoint ${i+1} (e.g. Read first chapter)`}
                  style={{flex:1,padding:"10px 14px",borderRadius:12,border:`1.5px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:13,fontFamily:"inherit",outline:"none"}}
                  onFocus={e=>e.target.style.border=`1.5px solid #29ABE2`} onBlur={e=>e.target.style.border=`1.5px solid ${t.inputBorder}`}/>
                {draft.subgoals.length>1&&(
                  <button onClick={()=>setDraft(p=>({...p,subgoals:p.subgoals.filter((_,j)=>j!==i)}))}
                    style={{background:"none",border:"none",color:"#FF5C7A",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
                )}
              </div>
            );
          })}
          <button onClick={()=>setDraft(p=>({...p,subgoals:[...p.subgoals,""]}))}
            style={{background:"#29ABE210",border:"1.5px dashed #29ABE244",borderRadius:12,padding:"8px 16px",color:"#29ABE2",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%",marginTop:4}}>
            + Add Checkpoint
          </button>
        </div>
        {/* Target Date */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,display:"block"}}>TARGET DATE *</label>
          <CalendarPicker value={draft.targetDate} onChange={date=>setDraft(p=>({...p,targetDate:date}))} t={t}/>
          {draft.targetDate&&(
            <div style={{marginTop:10,background:"#29ABE215",borderRadius:12,padding:"10px 14px",border:"1px solid #29ABE244",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>📅</span>
              <span style={{fontSize:13,fontWeight:700,color:"#29ABE2"}}>Target: {new Date(draft.targetDate).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</span>
            </div>
          )}
        </div>
        {/* Note */}
        <div style={{marginBottom:28}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>NOTE (OPTIONAL)</label>
          <textarea value={draft.note} onChange={e=>setDraft(p=>({...p,note:e.target.value}))} rows={3} placeholder="Any context or instructions..."
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.border=`2px solid #29ABE2`} onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}/>
        </div>
        <button onClick={saveGoal} disabled={saving||!draft.title.trim()||!draft.targetDate}
          style={{width:"100%",padding:"18px",borderRadius:18,border:"none",background:saving||!draft.title.trim()||!draft.targetDate?"#718096":"linear-gradient(135deg,#29ABE2,#4F7FFF)",color:"#fff",fontSize:17,fontWeight:900,cursor:saving||!draft.title.trim()||!draft.targetDate?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 6px 24px rgba(41,171,226,0.4)"}}>
          {saving?"Saving...":"Assign Goal ✓"}
        </button>
        {!draft.targetDate&&<div style={{textAlign:"center",fontSize:12,color:t.muted,marginTop:8}}>Pick a target date to save</div>}
      </div>
    </div>
  );

  // ── EDIT GOAL FORM ──
  if (editingGoal) return (
    <div style={{paddingBottom:100}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",padding:"24px 20px 28px"}}>
        <button onClick={()=>{setEditingGoal(null);setDraft({title:"",fotcTag:"LE",targetDate:"",note:"",subgoals:["","",""]});}} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:20,fontSize:14,display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,fontFamily:"inherit"}}>&#8592; Back</button>
        <div style={{fontSize:11,color:"#FFB300",fontWeight:700,letterSpacing:2,marginBottom:6}}>EDITING GOAL</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff"}}>Edit Goal</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>For {selectedAchiever?.nickname||selectedAchiever?.name}</div>
      </div>
      <div style={{padding:"20px 16px"}}>
        {/* Title */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>GOAL TITLE *</label>
          <input value={draft.title} onChange={e=>setDraft(p=>({...p,title:e.target.value}))} placeholder="e.g. Read 20 minutes every day"
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:15,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.border=`2px solid #FFB300`} onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}/>
        </div>
        {/* FOTC Tag */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,display:"block"}}>FOTC GOAL AREA</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {FOTC_TAGS.map(tag=>{
              const active=draft.fotcTag===tag.code;
              return(
                <button key={tag.code} onClick={()=>setDraft(p=>({...p,fotcTag:tag.code}))}
                  style={{padding:"14px 12px",borderRadius:14,border:`2px solid ${active?tag.color:t.border}`,background:active?tag.color+"18":t.card,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
                  <div style={{fontWeight:900,fontSize:14,color:active?tag.color:t.muted}}>{tag.code}</div>
                  <div style={{fontSize:10,color:active?tag.color:t.muted,fontWeight:600,marginTop:2,opacity:0.8}}>{tag.label}</div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Subgoals editor */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>CHECKPOINTS</label>
          <div style={{fontSize:11,color:t.muted,marginBottom:10}}>Already completed checkpoints are locked. You can add new ones or edit incomplete ones.</div>
          {draft.subgoals.map((sg,i)=>{
            const isDone = sg.done;
            const isPending = sg.pendingConfirm;
            const title = typeof sg==="object" ? (sg.title||"") : (sg||"");
            return(
              <div key={sg.id||i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,background:isDone?"#00E5A0":isPending?"#FFB300":"#29ABE222",color:isDone||isPending?"#000":"#29ABE2"}}>
                  {isDone?"✓":isPending?"⏳":(i+1)}
                </div>
                <input value={title}
                  onChange={e=>{if(isDone||isPending) return;const s=[...draft.subgoals];s[i]={...sg,title:e.target.value};setDraft(p=>({...p,subgoals:s}));}}
                  disabled={isDone||isPending}
                  placeholder={`Checkpoint ${i+1}`}
                  style={{flex:1,padding:"10px 14px",borderRadius:12,border:`1.5px solid ${isDone?"#00E5A044":isPending?"#FFB30044":t.inputBorder}`,background:isDone||isPending?t.border+"44":t.inputBg,color:isDone?t.muted:t.text,fontSize:13,fontFamily:"inherit",outline:"none",opacity:isDone||isPending?0.7:1}}
                  onFocus={e=>!isDone&&!isPending&&(e.target.style.border=`1.5px solid #FFB300`)}
                  onBlur={e=>e.target.style.border=`1.5px solid ${isDone?"#00E5A044":isPending?"#FFB30044":t.inputBorder}`}/>
                {!isDone&&!isPending&&draft.subgoals.length>1&&(
                  <button onClick={()=>setDraft(p=>({...p,subgoals:p.subgoals.filter((_,j)=>j!==i)}))}
                    style={{background:"none",border:"none",color:"#FF5C7A",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
                )}
                {isDone&&<span style={{fontSize:11,color:"#00E5A0",fontWeight:700,whiteSpace:"nowrap"}}>Done ✓</span>}
                {isPending&&<span style={{fontSize:11,color:"#FFB300",fontWeight:700,whiteSpace:"nowrap"}}>Pending</span>}
              </div>
            );
          })}
          <button onClick={()=>setDraft(p=>({...p,subgoals:[...p.subgoals,{id:`sg_new_${Date.now()}`,title:"",done:false,pendingConfirm:false}]}))}
            style={{background:"#FFB30010",border:"1.5px dashed #FFB30044",borderRadius:12,padding:"8px 16px",color:"#FFB300",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",width:"100%",marginTop:4}}>
            + Add New Checkpoint
          </button>
        </div>
        {/* Target Date */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,display:"block"}}>TARGET DATE *</label>
          <CalendarPicker value={draft.targetDate} onChange={date=>setDraft(p=>({...p,targetDate:date}))} t={t}/>
          {draft.targetDate&&(
            <div style={{marginTop:10,background:"#FFB30015",borderRadius:12,padding:"10px 14px",border:"1px solid #FFB30044",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>📅</span>
              <span style={{fontSize:13,fontWeight:700,color:"#FFB300"}}>Target: {new Date(draft.targetDate).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</span>
            </div>
          )}
        </div>
        {/* Note */}
        <div style={{marginBottom:28}}>
          <label style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:8,display:"block"}}>NOTE (OPTIONAL)</label>
          <textarea value={draft.note} onChange={e=>setDraft(p=>({...p,note:e.target.value}))} rows={3} placeholder="Any context or instructions..."
            style={{width:"100%",padding:"14px 16px",borderRadius:14,border:`2px solid ${t.inputBorder}`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box"}}
            onFocus={e=>e.target.style.border=`2px solid #FFB300`} onBlur={e=>e.target.style.border=`2px solid ${t.inputBorder}`}/>
        </div>
        <button onClick={saveEditGoal} disabled={saving||!draft.title.trim()||!draft.targetDate}
          style={{width:"100%",padding:"18px",borderRadius:18,border:"none",background:saving||!draft.title.trim()||!draft.targetDate?"#718096":"linear-gradient(135deg,#FFB300,#FF7043)",color:"#fff",fontSize:17,fontWeight:900,cursor:saving||!draft.title.trim()||!draft.targetDate?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:"0 6px 24px rgba(255,179,0,0.4)"}}>
          {saving?"Saving...":"Update Goal ✓"}
        </button>
      </div>
    </div>
  );

  // ── GOALS LIST ──
  const displayName = isMentor?(selectedAchiever?.nickname||selectedAchiever?.name||"Achiever"):(user.nickname||user.name);
  const myPending = isMentor
    ? pendingConfirm.filter(p=>p.achieverId===selectedAchiever?.uid)
    : pendingConfirm; // achiever sees all their own pending

  const renderGoalCard = (goal) => {
    const tag = FOTC_TAGS.find(tg=>tg.code===goal.fotcTag);
    const color = tag?.color||"#29ABE2";
    const subgoals = goal.subgoals||[];
    const doneSGs = subgoals.filter(sg=>sg.done).length;
    const totalSGs = subgoals.length;
    const pct = goal.progress||0;
    const expanded = expandedGoal===goal.id;

    return (
      <div key={goal.id} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,marginBottom:12,overflow:"hidden",borderLeft:`4px solid ${color}`}}>
        {/* Goal header — tap to expand */}
        <div style={{padding:"14px 16px",cursor:"pointer"}} onClick={()=>setExpandedGoal(expanded?null:goal.id)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{flex:1,paddingRight:8}}>
              <TagChip code={goal.fotcTag} small/>
              <div style={{fontWeight:800,fontSize:15,color:t.text,marginTop:6}}>{goal.title}</div>
              {goal.note&&<div style={{fontSize:12,color:t.muted,marginTop:4}}>{goal.note}</div>}
              {/* Show pending badge if any subgoals are awaiting approval */}
              {!isMentor&&subgoals.some(sg=>sg.pendingConfirm&&!sg.done)&&(
                <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,background:"#FFB30015",border:"1px solid #FFB30044",borderRadius:20,padding:"3px 10px"}}>
                  <span style={{fontSize:11}}>⏳</span>
                  <span style={{fontSize:11,fontWeight:700,color:"#FFB300"}}>Awaiting mentor approval</span>
                </div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              {isMentor&&(
                <>
                  <button onClick={e=>{e.stopPropagation();startEditGoal(goal);}}
                    style={{background:"#FFB30015",border:"1.5px solid #FFB30044",borderRadius:10,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#FFB300",cursor:"pointer",fontFamily:"inherit"}}>
                    Edit
                  </button>
                  <button onClick={e=>{e.stopPropagation();deleteGoal(goal.id);}} disabled={deletingId===goal.id}
                    style={{background:"#FF5C7A15",border:"1.5px solid #FF5C7A44",borderRadius:10,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit"}}>
                    {deletingId===goal.id?"...":"Remove"}
                  </button>
                </>
              )}
              <span style={{fontSize:12,color:t.muted}}>{expanded?"▲":"▼"}</span>
            </div>
          </div>

          {/* Progress bar — purely based on done/total subgoals */}
          <div style={{position:"relative",marginBottom:6}}>
            <div style={{height:10,borderRadius:10,background:t.border,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color},${color}CC)`,borderRadius:10,transition:"width 0.5s ease"}}/>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:color}}>{pct}% complete · {doneSGs}/{totalSGs} checkpoint{totalSGs!==1?"s":""}</div>
            <div style={{fontSize:11,color:t.muted,fontWeight:600}}>
              {goal.targetDate?`Due ${new Date(goal.targetDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:""}
            </div>
          </div>
        </div>

        {/* Expanded subgoals */}
        {expanded&&subgoals.length>0&&(
          <div style={{borderTop:`1px solid ${t.border}`,padding:"12px 16px",background:t.inputBg}}>
            <div style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>CHECKPOINTS</div>
            {subgoals.map((sg,i)=>{
              const pending = sg.pendingConfirm && !sg.done;
              const confirmReq = pendingConfirm.find(p=>p.goalId===goal.id&&p.subgoalId===sg.id);
              return (
                <div key={sg.id||i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12,padding:"10px 12px",borderRadius:12,background:sg.done?"#00E5A012":pending?"#FFB30012":t.card,border:`1.5px solid ${sg.done?"#00E5A044":pending?"#FFB30044":t.border}`}}>
                  {/* Status icon */}
                  <div style={{width:26,height:26,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:sg.done?"#00E5A0":pending?"#FFB300":t.border,marginTop:1}}>
                    <span style={{fontSize:12}}>{sg.done?"✓":pending?"⏳":(i+1)}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:sg.done?600:700,color:sg.done?t.muted:t.text,textDecoration:sg.done?"line-through":"none"}}>{sg.title}</div>
                    {pending&&!isMentor&&<div style={{fontSize:11,color:"#FFB300",fontWeight:600,marginTop:3}}>⏳ Awaiting mentor approval...</div>}
                    {pending&&isMentor&&<div style={{fontSize:11,color:"#FFB300",fontWeight:600,marginTop:3}}>⏳ Pending your confirmation...</div>}
                    {sg.done&&<div style={{fontSize:11,color:"#00E5A0",fontWeight:600,marginTop:3}}>Confirmed ✓</div>}
                    {/* Achiever: submit proof panel */}
                    {!isMentor&&!sg.done&&!pending&&(
                      submittingSubgoal?.goalId===goal.id&&submittingSubgoal?.sgId===sg.id ? (
                        <div style={{marginTop:10,background:t.inputBg,borderRadius:12,border:`1.5px solid #29ABE244`,padding:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#29ABE2",letterSpacing:1,marginBottom:8}}>SUBMIT PROOF</div>

                          {/* Uploaded files list */}
                          {proofFiles.length>0&&(
                            <div style={{marginBottom:10}}>
                              {proofFiles.map((f,fi)=>(
                                <div key={fi} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,background:t.card,borderRadius:10,padding:"8px 10px",border:`1px solid ${t.border}`}}>
                                  {f.type?.startsWith("image/")
                                    ?<img src={f.dataUrl} alt="proof" style={{width:48,height:48,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                                    :<div style={{width:48,height:48,borderRadius:6,background:"#29ABE215",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📄</div>
                                  }
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:12,fontWeight:700,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                                    <div style={{fontSize:10,color:t.muted}}>{f.type?.startsWith("image/")?"Image":"Document"}</div>
                                  </div>
                                  <button onClick={()=>setProofFiles(p=>p.filter((_,j)=>j!==fi))}
                                    style={{background:"none",border:"none",color:"#FF5C7A",cursor:"pointer",fontSize:18,padding:"0 4px",flexShrink:0}}>×</button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add file button */}
                          <label style={{display:"block",marginBottom:8,cursor:"pointer"}}>
                            <div style={{border:`2px dashed #29ABE244`,borderRadius:10,padding:"10px",textAlign:"center",background:"transparent"}}>
                              <div style={{fontSize:20,marginBottom:2}}>📎</div>
                              <div style={{fontSize:12,fontWeight:700,color:"#29ABE2"}}>{proofFiles.length>0?"+ Add another file":"Tap to upload photo or file"}</div>
                              <div style={{fontSize:10,color:t.muted,marginTop:1}}>Image, PDF, or document</div>
                            </div>
                            <input type="file" accept="image/*,.pdf,.doc,.docx" style={{display:"none"}} multiple
                              onChange={e=>{
                                const files=Array.from(e.target.files);
                                files.forEach(f=>{
                                  const reader=new FileReader();
                                  reader.onload=ev=>setProofFiles(p=>[...p,{name:f.name,type:f.type,dataUrl:ev.target.result}]);
                                  reader.readAsDataURL(f);
                                });
                                e.target.value="";
                              }}/>
                          </label>

                          {/* Note */}
                          <textarea value={proofNote} onChange={e=>setProofNote(e.target.value)}
                            placeholder="Add a note explaining what you did... (optional)"
                            rows={2}
                            style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${t.inputBorder}`,background:t.card,color:t.text,fontSize:12,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:10}}
                            onFocus={e=>e.target.style.border=`1.5px solid #29ABE2`}
                            onBlur={e=>e.target.style.border=`1.5px solid ${t.inputBorder}`}/>

                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>{setSubmittingSubgoal(null);setProofNote("");setProofFiles([]);}}
                              style={{flex:1,padding:"8px",borderRadius:10,border:`1.5px solid ${t.border}`,background:"transparent",color:t.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                              Cancel
                            </button>
                            <button onClick={()=>achieverCompleteSubgoal(goal,sg.id,proofNote,proofFiles)}
                              disabled={uploadingProof||(proofFiles.length===0&&!proofNote.trim())}
                              style={{flex:2,padding:"8px",borderRadius:10,border:"none",background:uploadingProof||(proofFiles.length===0&&!proofNote.trim())?"#718096":"linear-gradient(135deg,#29ABE2,#4F7FFF)",color:"#fff",fontSize:12,fontWeight:800,cursor:uploadingProof||(proofFiles.length===0&&!proofNote.trim())?"not-allowed":"pointer",fontFamily:"inherit"}}>
                              {uploadingProof?"Submitting...":"Submit for Approval →"}
                            </button>
                          </div>
                          {proofFiles.length===0&&!proofNote.trim()&&<div style={{textAlign:"center",fontSize:10,color:t.muted,marginTop:6}}>Add at least one file or a note to submit</div>}
                        </div>
                      ) : (
                        <button onClick={()=>setSubmittingSubgoal({goalId:goal.id,sgId:sg.id})}
                          style={{marginTop:6,background:"#29ABE215",border:"1.5px solid #29ABE244",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:700,color:"#29ABE2",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                          <span>📤</span> Submit Proof
                        </button>
                      )
                    )}

                    {/* Achiever: pending — show unsubmit button */}
                    {!isMentor&&pending&&(
                      <div style={{marginTop:8}}>
                        <button onClick={async()=>{
                          // Try to find and delete the completion record
                          if (confirmReq) {
                            await unsubmitSubgoal(goal,sg.id,confirmReq.id);
                          } else {
                            // Fallback: just reset the subgoal state without deleting record
                            const updatedSubgoals = goal.subgoals.map(s=>s.id===sg.id?{...s,pendingConfirm:false}:s);
                            await updateDoc(doc(db,"goals",goal.id),{subgoals:updatedSubgoals});
                          }
                        }}
                          style={{background:"#FF5C7A15",border:"1.5px solid #FF5C7A44",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                          <span>↩</span> Unsubmit & Edit
                        </button>
                      </div>
                    )}

                    {/* Mentor: confirm or deny — show proof */}
                    {isMentor&&pending&&(
                      <MentorConfirmPanel goal={goal} sg={sg} t={t} onConfirm={mentorConfirmSubgoal} onDeny={mentorDenySubgoal} db={db}/> 
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",borderRadius:20,padding:"20px",marginBottom:20}}>
        {isMentor&&<button onClick={()=>setSelectedAchiever(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:12,fontSize:13,display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:16,fontFamily:"inherit"}}>&#8592; All Achievers</button>}
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>GOALS</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>{displayName}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>{activeGoals.length} active · {doneGoals.length} completed</div>
      </div>

      {/* Pending banner — mentor sees what to confirm, achiever sees what's waiting */}
      {isMentor&&myPending.length>0&&(
        <div style={{background:"#FFB30015",borderRadius:16,border:"1.5px solid #FFB30055",padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:800,color:"#FFB300",marginBottom:4}}>⏳ {myPending.length} CHECKPOINT{myPending.length>1?"S":""} NEED YOUR CONFIRMATION</div>
          <div style={{fontSize:12,color:t.muted}}>Tap a goal below to expand and confirm or deny.</div>
        </div>
      )}
      {!isMentor&&myPending.length>0&&(
        <div style={{background:"#FFB30015",borderRadius:16,border:"1.5px solid #FFB30055",padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:800,color:"#FFB300",marginBottom:4}}>⏳ {myPending.length} CHECKPOINT{myPending.length>1?"S":""} WAITING FOR MENTOR APPROVAL</div>
          <div style={{fontSize:12,color:t.muted}}>Your mentor will review and confirm your completed checkpoints.</div>
        </div>
      )}

      {/* Season Goals */}
      <SeasonGoalSection
        user={user}
        t={t}
        achieverId={isMentor ? selectedAchiever?.uid : user.uid}
        achieverName={isMentor ? (selectedAchiever?.nickname||selectedAchiever?.name) : (user.nickname||user.name)}
        isMentor={isMentor}
      />

      {isMentor&&(
        <button onClick={()=>setAdding(true)}
          style={{width:"100%",padding:"16px",borderRadius:18,border:"none",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",color:"#fff",fontSize:16,fontWeight:900,cursor:"pointer",fontFamily:"inherit",marginBottom:20,boxShadow:"0 4px 20px rgba(41,171,226,0.35)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:20}}>+</span> Assign New Goal
        </button>
      )}

      {goals.length===0&&(
        <div style={{textAlign:"center",padding:"4rem 2rem",background:t.card,borderRadius:20,border:`1px solid ${t.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>🎯</div>
          <div style={{fontWeight:800,fontSize:16,color:t.text,marginBottom:6}}>No goals yet</div>
          <div style={{fontSize:13,color:t.muted}}>{isMentor?"Tap \"Assign New Goal\" to get started.":"Your mentor hasn't assigned any goals yet."}</div>
        </div>
      )}

      {activeGoals.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>ACTIVE</div>
          {activeGoals.map(goal=>renderGoalCard(goal))}
        </>
      )}

      {doneGoals.length>0&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:12,marginTop:20}}>COMPLETED 🏆</div>
          {doneGoals.map(goal=>{
            const tag = FOTC_TAGS.find(tg=>tg.code===goal.fotcTag);
            const color = tag?.color||"#29ABE2";
            return(
              <div key={goal.id} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,marginBottom:10,overflow:"hidden",borderLeft:"4px solid #00E5A0",opacity:0.75}}>
                <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <TagChip code={goal.fotcTag} small/>
                    <div style={{fontWeight:800,fontSize:14,color:t.text,marginTop:6,textDecoration:"line-through",opacity:0.7}}>{goal.title}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>🏆</span>
                    {isMentor&&<button onClick={()=>deleteGoal(goal.id)} style={{background:"#FF5C7A15",border:"1.5px solid #FF5C7A44",borderRadius:10,padding:"4px 10px",fontSize:12,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit"}}>Remove</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── MESSAGE BUBBLE — hold for options (reply/react), double-tap for ❤️ ──
function MessageBubble({ children, style, onReact, onHeart }) {
  const holdTimer = useRef(null);
  const lastTapTime = useRef(0);
  const didHold = useRef(false);
  const didMove = useRef(false);
  const ref = useRef(null);
  const DOUBLE_TAP_MS = 300;
  const HOLD_MS = 500;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // ── TOUCH handlers (mobile) ──
    const onTouchStart = () => {
      didMove.current = false;
      didHold.current = false;
      holdTimer.current = setTimeout(() => {
        if (!didMove.current) {
          didHold.current = true;
          if (navigator.vibrate) navigator.vibrate(40);
          onReact();
        }
      }, HOLD_MS);
    };

    const onTouchMove = () => {
      didMove.current = true;
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    };

    const onTouchEnd = () => {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      if (didHold.current || didMove.current) return;
      const now = Date.now();
      const gap = now - lastTapTime.current;
      if (lastTapTime.current > 0 && gap < DOUBLE_TAP_MS) {
        // Genuine double tap
        lastTapTime.current = 0;
        if (navigator.vibrate) navigator.vibrate(20);
        onHeart();
      } else {
        lastTapTime.current = now;
      }
    };

    // ── MOUSE handlers (desktop) — only context menu for hold ──
    const onContextMenu = (e) => {
      e.preventDefault();
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      onReact();
    };

    // Desktop double-click = heart
    const onDblClick = (e) => {
      e.preventDefault();
      onHeart();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchMove, { passive: true });
    el.addEventListener("contextmenu", onContextMenu);
    el.addEventListener("dblclick", onDblClick);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchMove);
      el.removeEventListener("contextmenu", onContextMenu);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [onReact, onHeart]);

  return (
    <div ref={ref} style={{
      ...style,
      cursor:"pointer",
      WebkitTapHighlightColor:"transparent",
      WebkitUserSelect:"none",
      userSelect:"none",
      touchAction:"pan-y",
    }}>
      {children}
    </div>
  );
}

// ── PHOTO LIGHTBOX ──
function PhotoLightbox({ src, onClose }) {
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = e => { if (e.key==="Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStart = e => { startY.current = e.touches[0].clientY; };
    const onMove = e => {
      if (startY.current===null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) setDragY(dy);
    };
    const onEnd = () => {
      if (dragY > 80) { close(); }
      else setDragY(0);
      startY.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [dragY]);

  const opacity = visible ? Math.max(0, 1 - dragY / 250) : 0;
  const scale = visible ? Math.max(0.7, 1 - dragY / 800) : 0.5;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:`rgba(0,0,0,${opacity})`,
      display:"flex", alignItems:"center", justifyContent:"center",
      transition: dragY > 0 ? "none" : "background 0.28s ease",
    }}
      onClick={close}>
      {/* X button */}
      <button onClick={e=>{e.stopPropagation();close();}}
        style={{position:"absolute",top:16,right:16,width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,backdropFilter:"blur(8px)"}}>
        ✕
      </button>
      {/* Photo */}
      <img
        ref={ref}
        src={src}
        alt="full"
        onClick={e=>e.stopPropagation()}
        style={{
          maxWidth:"100%",
          maxHeight:"90vh",
          objectFit:"contain",
          borderRadius:12,
          transform:`translateY(${dragY}px) scale(${scale})`,
          transition: dragY > 0 ? "none" : "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.28s ease",
          opacity,
          boxShadow:"0 20px 60px rgba(0,0,0,0.8)",
          cursor:"default",
          touchAction:"pan-x",
        }}
      />
      {/* Swipe down hint */}
      {dragY===0&&visible&&(
        <div style={{position:"absolute",bottom:32,left:"50%",transform:"translateX(-50%)",color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:600,letterSpacing:1,textAlign:"center"}}>
          Swipe down to close
        </div>
      )}
    </div>
  );
}

// ── MESSAGES ──
const EMOJI_LIST = ["😂","❤️","🔥","👏","😮","😢","💪","🎯","✅","🙏","👀","😤","🥶","💯","🤝","😎","🏆","⚡","🫡","💬"];

function Messages({ user, t }) {
  const userCache = useUserCache();
  const isMentor = user.role === "mentor";
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [presenceMap, setPresenceMap] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [reacting, setReacting] = useState(null);
  const [replyTo, setReplyTo] = useState(null); // {id, text, senderName}
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [convoPreviews, setConvoPreviews] = useState({});
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  const BUBBLE_COLORS = [
    "linear-gradient(135deg,#29ABE2,#4F7FFF)",
    "linear-gradient(135deg,#9B5CFF,#6C3FD4)",
    "linear-gradient(135deg,#FF5C7A,#FF3D6B)",
    "linear-gradient(135deg,#00C9A7,#00E5A0)",
    "linear-gradient(135deg,#FF7043,#FFB300)",
  ];
  const myColor = BUBBLE_COLORS[0]; // mentor always blue

  useEffect(() => {
    if (isMentor) {
      const q = query(collection(db,"users"), where("role","==","mentee"));
      return onSnapshot(q, snap => setContacts(snap.docs.map(d=>({uid:d.id,...d.data()}))));
    } else {
      const q = query(collection(db,"users"), where("role","==","mentor"));
      return onSnapshot(q, snap => setContacts(snap.docs.map(d=>({uid:d.id,...d.data()}))));
    }
  }, [isMentor]);

  useEffect(() => {
    const presenceRef = ref(rtdb,"presence");
    const unsub = onValue(presenceRef, snap => {
      const data = snap.val()||{};
      const map = {};
      Object.entries(data).forEach(([uid,val])=>{ map[uid]=val?.online||false; });
      setPresenceMap(map);
    });
    return ()=>unsub();
  }, []);

  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!activeChat) return;
    isFirstLoad.current = true; // reset on chat change
    const chatId = [user.uid, activeChat.uid].sort().join("_");
    const q = query(collection(db,"messages"), where("chatId","==",chatId));
    return onSnapshot(q, snap => {
      const msgs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
      setMessages(msgs);
      msgs.forEach(m => {
        if (m.senderId!==user.uid && m.status!=="seen") {
          updateDoc(doc(db,"messages",m.id), {status:"seen"});
        }
      });
    });
  }, [activeChat, user.uid]);

  // Scroll to bottom — instant on first load, smooth on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    if (isFirstLoad.current) {
      // Jump instantly to bottom when chat first opens
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({behavior:"instant"});
        isFirstLoad.current = false;
      }, 50);
    } else {
      // Only smooth scroll if already near bottom
      if (!scrollRef.current) return;
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) scrollToBottom("smooth");
    }
  }, [messages]);

  const scrollToBottom = (behavior="smooth") => {
    bottomRef.current?.scrollIntoView({behavior});
    setShowScrollBtn(false);
  };

  const handleScroll = (e) => {
    const el = e.target;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  };

  const getChatId = (a, b) => [a,b].sort().join("_");

  const sendMessage = async () => {
    if ((!msg.trim() && !imagePreview) || sending) return;
    setSending(true);
    const chatId = getChatId(user.uid, activeChat.uid);
    await addDoc(collection(db,"messages"), {
      chatId,
      senderId: user.uid,
      senderName: user.nickname||user.name,
      receiverId: activeChat.uid,
      text: msg.trim(),
      image: imagePreview||null,
      replyTo: replyTo||null,
      status: "sent",
      createdAt: new Date().toISOString(),
      reactions: {},
    });
    await setDoc(doc(db,"conversations",chatId), {
      participants: [user.uid, activeChat.uid],
      lastMessage: msg.trim()||(imagePreview?"📷 Photo":""),
      lastSenderId: user.uid,
      updatedAt: new Date().toISOString(),
    }, {merge:true});
    setMsg(""); setImagePreview(null); setReplyTo(null);
    setSending(false);
    setTimeout(()=>scrollToBottom(), 100);
  };

  const addReaction = async (msgId, emoji) => {
    const msg = messages.find(m=>m.id===msgId);
    const existing = msg?.reactions?.[user.uid];
    if (existing===emoji) {
      // Toggle off — remove reaction
      await updateDoc(doc(db,"messages",msgId), {[`reactions.${user.uid}`]: deleteField()});
    } else {
      await updateDoc(doc(db,"messages",msgId), {[`reactions.${user.uid}`]: emoji});
    }
    setReacting(null);
  };

  useEffect(() => {
    if (contacts.length===0) return;
    const unsubs = contacts.map(c => {
      const chatId = getChatId(user.uid, c.uid);
      return onSnapshot(doc(db,"conversations",chatId), snap => {
        if (snap.exists()) setConvoPreviews(p=>({...p,[c.uid]:snap.data()}));
      });
    });
    return ()=>unsubs.forEach(u=>u());
  }, [contacts, user.uid]);

  // ── CHAT THREAD ──
  if (activeChat) {
    const isOnline = presenceMap[activeChat.uid]||false;

    return (
      <div style={{display:"flex",flexDirection:"column",flex:1,background:t.bg,overflow:"hidden"}}>
        {/* Header — Instagram style */}
        <div style={{background:t.headerBg,padding:"10px 12px 10px",display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${t.border}`,flexShrink:0,paddingTop:"env(safe-area-inset-top,10px)"}}>
          <button onClick={()=>{setActiveChat(null);setMessages([]);setReplyTo(null);}}
            style={{background:"none",border:"none",color:"#fff",cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
          <div style={{position:"relative",flexShrink:0}}>
            {activeChat.avatar
              ?<img src={activeChat.avatar} alt="" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}}/>
              :<div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>{(activeChat.name||"?").slice(0,2).toUpperCase()}</div>
            }
            {isOnline&&<div style={{position:"absolute",bottom:1,right:1,width:10,height:10,borderRadius:"50%",background:"#00E5A0",border:"2px solid #000"}}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:"#fff"}}>{activeChat.nickname||activeChat.name}</div>
            <div style={{fontSize:11,color:isOnline?"#00E5A0":t.muted,fontWeight:500}}>{isOnline?"Active now":"Offline"}</div>
          </div>
        </div>

        {/* Messages scroll area */}
        <div ref={scrollRef} onScroll={handleScroll}
          onMouseDown={e=>{ if(e.target===e.currentTarget){setReacting(null);}}}
          style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:2,background:t.bg}}>

          {messages.length===0&&(
            <div style={{textAlign:"center",margin:"auto",color:t.muted,paddingBottom:40}}>
              <div style={{width:72,height:72,borderRadius:"50%",background:t.card,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                {activeChat.avatar
                  ?<img src={activeChat.avatar} alt="" style={{width:72,height:72,borderRadius:"50%",objectFit:"cover"}}/>
                  :<div style={{width:72,height:72,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:900,color:"#fff"}}>{(activeChat.name||"?").slice(0,2).toUpperCase()}</div>
                }
              </div>
              <div style={{fontWeight:700,fontSize:16,color:"#fff",marginBottom:4}}>{activeChat.nickname||activeChat.name}</div>
              <div style={{fontSize:13,color:t.muted}}>Say hi!</div>
            </div>
          )}

          {messages.map((m,i)=>{
            const isMine = m.senderId===user.uid;
            const prevMsg = messages[i-1];
            const nextMsg = messages[i+1];
            const showAvatar = !isMine&&(!nextMsg||nextMsg.senderId!==m.senderId);
            const grouped = prevMsg&&prevMsg.senderId===m.senderId;
            const groupedNext = nextMsg&&nextMsg.senderId===m.senderId;
            const reactions = Object.values(m.reactions||{});
            const uniqueReactions=[...new Set(reactions)];
            const bubbleBg = isMine ? myColor : "#1e1e1e";
            const replyMsg = m.replyTo ? messages.find(x=>x.id===m.replyTo.id)||m.replyTo : null;

            // Border radius Instagram style
            const br = isMine
              ? (grouped&&groupedNext?"18px 4px 4px 18px":grouped?"18px 4px 18px 18px":groupedNext?"18px 4px 4px 18px":"18px 18px 4px 18px")
              : (grouped&&groupedNext?"4px 18px 18px 4px":grouped?"4px 18px 18px 4px":groupedNext?"4px 18px 4px 4px":"18px 18px 18px 4px");

            const messageContent = (
              <div style={{marginBottom:groupedNext?1:6}}>
                  <div style={{display:"flex",justifyContent:isMine?"flex-end":"flex-start",alignItems:"flex-end",gap:6}}>
                    {!isMine&&(
                      <div style={{width:28,flexShrink:0,alignSelf:"flex-end"}}>
                        {showAvatar&&(activeChat.avatar
                          ?<img src={activeChat.avatar} alt="" style={{width:28,height:28,borderRadius:"50%",objectFit:"cover"}}/>
                          :<div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:"#fff"}}>{(activeChat.name||"?")[0]}</div>
                        )}
                      </div>
                    )}

                    <div style={{maxWidth:"72%",display:"flex",flexDirection:"column",alignItems:isMine?"flex-end":"flex-start"}}>
                      {/* Instagram-style reply preview */}
                      {replyMsg&&(
                        <div style={{display:"flex",flexDirection:"column",alignItems:isMine?"flex-end":"flex-start",marginBottom:0,width:"100%"}}>
                          {/* "You replied to X" label */}
                          <div style={{fontSize:11,color:t.muted,marginBottom:4,paddingLeft:isMine?0:0,fontStyle:"normal"}}>
                            {isMine
                              ? `You replied to ${replyMsg.senderName||activeChat.nickname||activeChat.name}`
                              : `${activeChat.nickname||activeChat.name} replied to you`}
                          </div>
                          {/* Quoted grey bubble — sits above main bubble */}
                          <div style={{
                            background:t.card,
                            borderRadius:14,
                            padding:"7px 12px",
                            maxWidth:"100%",
                            marginBottom:2,
                            display:"flex",
                            alignItems:"center",
                            gap:8,
                            opacity:0.9,
                          }}>
                            <div style={{width:3,height:"100%",minHeight:16,background:isMine?"#29ABE2":t.inputBorder,borderRadius:2,flexShrink:0,alignSelf:"stretch"}}/>
                            <div style={{fontSize:12,color:t.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>
                              {replyMsg.text||"📷 Photo"}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Image — tap to open fullscreen lightbox */}
                      {m.image&&(
                        <img src={m.image} alt="shared"
                          style={{maxWidth:"100%",borderRadius:18,maxHeight:240,objectFit:"cover",display:"block",cursor:"pointer",marginBottom:m.text?3:0}}
                          onClick={e=>{e.stopPropagation();setLightboxSrc(m.image);}}/>
                      )}

                      {/* Text bubble — hold for options, double-tap for ❤️ */}
                      {m.text&&(
                        <MessageBubble
                          onReact={()=>setReacting(reacting===m.id?null:m.id)}
                          onHeart={()=>addReaction(m.id,"❤️")}
                          onReply={()=>setReplyTo({id:m.id,text:m.text,senderName:isMine?(user.nickname||user.name):(activeChat.nickname||activeChat.name)})}
                          style={{padding:"10px 14px",background:bubbleBg,borderRadius:br}}>
                          <div style={{fontSize:15,color:"#fff",lineHeight:1.4,wordBreak:"break-word"}}>{m.text}</div>
                        </MessageBubble>
                      )}

                      {/* Reactions display */}
                      {uniqueReactions.length>0&&(
                        <div style={{background:t.card,borderRadius:20,padding:"3px 8px",border:`1px solid ${t.border}`,fontSize:13,marginTop:3,alignSelf:isMine?"flex-end":"flex-start"}}>
                          {uniqueReactions.join("")} {reactions.length>1&&<span style={{fontSize:10,color:t.muted}}>{reactions.length}</span>}
                        </div>
                      )}

                      {/* Hold options panel — reply only */}
                      {reacting===m.id&&(
                        <div onClick={e=>e.stopPropagation()}
                          style={{marginTop:6,background:t.surface,borderRadius:16,padding:"8px 10px",border:`1px solid ${t.border}`,boxShadow:"0 8px 32px rgba(0,0,0,0.7)",zIndex:10,minWidth:160}}>
                          <button onClick={ev=>{ev.stopPropagation();setReplyTo({id:m.id,text:m.text,senderName:isMine?(user.nickname||user.name):(activeChat.nickname||activeChat.name)});setReacting(null);}}
                            style={{width:"100%",background:"#252525",border:"none",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:8,display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                            Reply
                          </button>
                          <button onClick={ev=>{ev.stopPropagation();setReacting(null);}}
                            style={{width:"100%",background:t.inputBorder,border:"none",borderRadius:8,padding:"6px",color:t.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seen/sent status */}
                  {isMine&&i===messages.length-1&&(
                    <div style={{textAlign:"right",paddingRight:4,marginTop:2}}>
                      {m.status==="seen"
                        ?(activeChat.avatar
                          ?<img src={activeChat.avatar} alt="" style={{width:14,height:14,borderRadius:"50%",objectFit:"cover"}}/>
                          :<div style={{width:14,height:14,borderRadius:"50%",background:"#29ABE2",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:900}}>{(activeChat.name||"?")[0]}</div>)
                        :<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.status==="delivered"?"#fff":t.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      }
                    </div>
                  )}
                </div>
            );

            return <div key={m.id}>{messageContent}</div>;
          })}
          <div ref={bottomRef}/>
        </div>

        {/* Photo lightbox */}
        {lightboxSrc&&<PhotoLightbox src={lightboxSrc} onClose={()=>setLightboxSrc(null)}/>}

        {/* Scroll to bottom button — sits just above input bar */}
        {showScrollBtn&&(
          <div style={{display:"flex",justifyContent:"flex-end",padding:"6px 16px 0",background:t.bg,flexShrink:0}}>
            <button onClick={()=>scrollToBottom()}
              style={{width:34,height:34,borderRadius:"50%",background:"#fff",border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        )}

        {/* Reply preview bar */}
        {replyTo&&(
          <div style={{background:t.surface,borderTop:`1px solid ${t.border}`,padding:"8px 12px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:3,height:36,background:"#29ABE2",borderRadius:2,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:700,color:"#29ABE2",marginBottom:2}}>{replyTo.senderName}</div>
              <div style={{fontSize:12,color:t.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{replyTo.text||"📷 Photo"}</div>
            </div>
            <button onClick={()=>setReplyTo(null)} style={{background:"none",border:"none",color:"#888",cursor:"pointer",padding:4}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Image preview */}
        {imagePreview&&(
          <div style={{background:"#111",borderTop:"1px solid #222",padding:"8px 12px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <img src={imagePreview} alt="preview" style={{height:52,width:52,objectFit:"cover",borderRadius:8}}/>
            <div style={{flex:1,fontSize:12,color:t.muted}}>Photo ready</div>
            <button onClick={()=>setImagePreview(null)} style={{background:"none",border:"none",color:"#FF5C7A",cursor:"pointer",padding:4}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Emoji panel */}
        {/* Input bar — Instagram style */}
        <div style={{background:t.headerBg,borderTop:`1px solid ${t.border}`,padding:"10px 12px",paddingBottom:"calc(10px + env(safe-area-inset-bottom,0px))",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>

          {/* Camera — opens device camera */}
          <label style={{cursor:"pointer",flexShrink:0}}>
            <div style={{width:38,height:38,borderRadius:"50%",background:"#29ABE2",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
            <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
              onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setImagePreview(ev.target.result);r.readAsDataURL(f);e.target.value="";}}/>
          </label>

          {/* Text input pill — no emoji button */}
          <div style={{flex:1,display:"flex",alignItems:"center",background:t.inputBg,borderRadius:24,border:`1px solid ${t.inputBorder}`,padding:"0 16px",minHeight:40}}>
            <input value={msg} onChange={e=>setMsg(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMessage()}
              placeholder={`Message ${activeChat.nickname||activeChat.name}...`}
              style={{flex:1,background:"none",border:"none",color:"#fff",fontSize:15,fontFamily:"inherit",outline:"none",padding:"10px 0"}}/>
          </div>

          {/* Gallery OR Send */}
          {msg.trim()||imagePreview ? (
            <button onClick={sendMessage} disabled={sending}
              style={{width:38,height:38,borderRadius:"50%",background:"#29ABE2",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          ) : (
            <label style={{cursor:"pointer",flexShrink:0}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:t.card,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="#fff" stroke="none"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" style={{display:"none"}}
                onChange={e=>{const f=e.target.files[0];if(!f||!f.type.startsWith("image/"))return;const r=new FileReader();r.onload=ev=>setImagePreview(ev.target.result);r.readAsDataURL(f);e.target.value="";}}/>
            </label>
          )}
        </div>
      </div>
    );
  }

  // ── INBOX LIST ──
  const getRelativeTime = (isoStr) => {
    if (!isoStr) return "";
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  };

  return (
    <div style={{background:t.bg,flex:1,overflowY:"auto"}}>
      {/* Header */}
      <div style={{background:t.bg,padding:"16px 16px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${t.border}`}}>
        <div style={{fontSize:24,fontWeight:900,color:"#fff",letterSpacing:-0.5}}>Messages</div>
      </div>

      {contacts.length===0&&(
        <div style={{textAlign:"center",padding:"4rem 2rem"}}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto 16px",display:"block"}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div style={{fontWeight:700,fontSize:15,color:"#fff",marginBottom:4}}>No messages yet</div>
          <div style={{fontSize:13,color:t.muted}}>Your conversations will appear here.</div>
        </div>
      )}

      {contacts.map(contact=>{
        const liveContact = userCache[contact.uid] || contact;
        const displayName = liveContact.nickname||liveContact.name||"User";
        const liveAvatar = liveContact.avatar||null;
        const isOnline = presenceMap[contact.uid]||false;
        const preview = convoPreviews[contact.uid];
        const lastMsg = preview?.lastMessage||"";
        const isMyLast = preview?.lastSenderId===user.uid;
        const relTime = getRelativeTime(preview?.updatedAt);
        const hasUnread = preview && !isMyLast && lastMsg;
        const unreadColor = isMentor ? "#9B5CFF" : "#29ABE2";

        return (
          <button key={contact.uid}
            onClick={()=>setActiveChat({uid:contact.uid,name:displayName,avatar:liveAvatar,nickname:liveContact.nickname})}
            style={{width:"100%",background:"none",border:"none",padding:"10px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,fontFamily:"inherit",textAlign:"left",borderBottom:"1px solid #111"}}>

            {/* Avatar — large, with online ring */}
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{width:70,height:70,borderRadius:"50%",padding:isOnline?2:0,background:isOnline?"linear-gradient(135deg,#00E5A0,#29ABE2)":"transparent"}}>
                <div style={{width:"100%",height:"100%",borderRadius:"50%",padding:isOnline?2:0,background:t.bg}}>
                  {liveAvatar
                    ?<img src={liveAvatar} alt={displayName} style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover",display:"block"}}/>
                    :<div style={{width:"100%",height:"100%",borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:"#fff"}}>{displayName.slice(0,2).toUpperCase()}</div>
                  }
                </div>
              </div>
            </div>

            {/* Text info */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:hasUnread?800:600,fontSize:16,color:"#fff",marginBottom:4,letterSpacing:-0.2}}>{displayName}</div>
              <div style={{fontSize:14,color:hasUnread?"#aaa":"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:hasUnread?600:400}}>
                {lastMsg
                  ? (isMyLast?`Sent ${relTime}`:`${lastMsg.slice(0,30)}${lastMsg.length>30?"...":""} · ${relTime}`)
                  : <span style={{color:t.muted}}>No messages yet</span>
                }
              </div>
            </div>

            {/* Unread dot — blue or purple */}
            <div style={{flexShrink:0,width:24,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {hasUnread&&(
                <div style={{width:12,height:12,borderRadius:"50%",background:unreadColor,boxShadow:`0 0 8px ${unreadColor}88`}}/>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── PARENT DASHBOARD ──
function ParentDash({ user, t }) {
  const [sessions,setSessions]=useState([]);
  useEffect(()=>{return onSnapshot(collection(db,"sessions"),snap=>setSessions(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));},[]);
  const confirmOuting=async id=>{await updateDoc(doc(db,"sessions",id),{parentConfirmed:true,parentConfirmedAt:new Date().toISOString(),confirmedBy:user.name});};
  const pending=sessions.filter(s=>!s.parentConfirmed);
  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#BF360C,#FF7043)",padding:24}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:700,letterSpacing:2}}>PARENT DASHBOARD</div>
        <div style={{fontSize:28,fontWeight:900,color:"#fff",margin:"4px 0 10px"}}>Hello, <span style={{color:"#fff59d"}}>{user.nickname||user.name?.split(" ")[0]}</span></div>
        {pending.length>0&&<div style={{background:"rgba(255,255,255,0.2)",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
          <PulseDot color="#fff59d"/><span style={{fontSize:13,color:"#fff",fontWeight:700}}>{pending.length} outing{pending.length>1?"s":""} need your confirmation</span>
        </div>}
      </div>
      <div style={{padding:16}}>
        {pending.length>0&&<>
          <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"8px 0"}}>NEEDS CONFIRMATION</div>
          {pending.map(session=>(
            <Card key={session.id} t={t} style={{border:"1.5px solid #FFB30044"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div><div style={{fontWeight:800,fontSize:16,color:t.text}}>{session.date}</div><div style={{fontSize:12,color:t.muted}}>With {session.mentorName} · {session.outingType}</div></div>
                {session.selMood&&<div style={{fontSize:16}}>{MOOD_MAP[Math.min(session.selMood-1,9)].emoji}</div>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>{session.goalTags?.map(code=><TagChip key={code} code={code} small/>)}</div>
              {session.parentNote&&<div style={{background:"#FFB30015",borderRadius:10,padding:10,marginBottom:10,fontSize:13,color:t.textMid,fontStyle:"italic"}}>Note: "{session.parentNote}"</div>}
              <Btn onClick={()=>confirmOuting(session.id)} color="#FF7043" size="lg" style={{borderRadius:14,fontWeight:900}}>Confirm — My child arrived home safely</Btn>
            </Card>
          ))}
        </>}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 8px"}}>RECENT SESSIONS</div>
        {sessions.slice(0,5).map(session=>(
          <Card key={session.id} t={t} style={{borderLeft:`4px solid ${session.parentConfirmed?"#00E5A0":"#FFB300"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontWeight:800,color:t.text}}>{session.date}</div>
              {session.selMood&&<span style={{fontSize:16}}>{MOOD_MAP[Math.min(session.selMood-1,9)].emoji}</span>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>{session.goalTags?.map(code=><TagChip key={code} code={code} small/>)}</div>
            <div style={{fontSize:12,color:session.parentConfirmed?"#00E5A0":"#FFB300",fontWeight:600}}>{session.parentConfirmed?"You confirmed arrival home safely":"Awaiting your confirmation"}</div>
          </Card>
        ))}
        {sessions.length===0&&<div style={{textAlign:"center",color:t.muted,padding:"2rem"}}>No sessions yet.</div>}
      </div>
    </div>
  );
}

// ── SUPERVISOR DASHBOARD ──
function SupervisorDash({ user, t }) {
  const [sessions,setSessions]=useState([]);
  const [users,setUsers]=useState([]);
  const [generating,setGenerating]=useState(false);
  const [announcements,setAnnouncements]=useState([]);
  const [newTitle,setNewTitle]=useState("");
  const [newBody,setNewBody]=useState("");
  const [posting,setPosting]=useState(false);
  const [showForm,setShowForm]=useState(false);

  useEffect(()=>{
    onSnapshot(collection(db,"sessions"),snap=>setSessions(snap.docs.map(d=>({id:d.id,...d.data()}))));
    onSnapshot(collection(db,"users"),snap=>setUsers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const q=query(collection(db,"announcements"));
    return onSnapshot(q,snap=>setAnnouncements(
      snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
    ));
  },[]);

  const postAnnouncement = async () => {
    if (!newTitle.trim()||!newBody.trim()) return;
    setPosting(true);
    await addDoc(collection(db,"announcements"),{
      title: newTitle.trim(),
      body: newBody.trim(),
      authorName: user.name||user.nickname||"Supervisor",
      authorId: user.uid,
      targetRole: "mentor",
      createdAt: new Date().toISOString(),
    });
    setNewTitle(""); setNewBody(""); setShowForm(false); setPosting(false);
  };

  const deleteAnnouncement = async (id) => {
    await deleteDoc(doc(db,"announcements",id));
  };

  const generateReport=async()=>{setGenerating(true);await new Promise(r=>setTimeout(r,2000));setGenerating(false);alert(`Quarterly Report\n\n${sessions.length} total sessions\n${sessions.filter(s=>s.parentConfirmed).length} parent confirmed\n${users.length} registered users`);};
  const tagCounts={};FOTC_TAGS.forEach(tg=>{tagCounts[tg.code]=sessions.filter(s=>s.goalTags?.includes(tg.code)).length;});
  const confirmRate=sessions.length>0?Math.round((sessions.filter(s=>s.parentConfirmed).length/sessions.length)*100):0;
  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#1A365D,#2C5282)",padding:24,borderBottom:"3px solid #FFD700"}}>
        <div style={{fontSize:11,color:"#FFD700",fontWeight:700,letterSpacing:2}}>SUPERVISOR COMMAND CENTER</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff",margin:"4px 0"}}>FOTC NY Overview</div>
      </div>
      <div style={{padding:16}}>

        {/* Announcements section */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:14}}>📢</span> MENTOR ANNOUNCEMENTS
            </div>
            <button onClick={()=>setShowForm(p=>!p)}
              style={{background:showForm?"#FF5C7A15":"#FFD70022",border:`1.5px solid ${showForm?"#FF5C7A44":"#FFD70044"}`,borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:800,color:showForm?"#FF5C7A":"#FFD700",cursor:"pointer",fontFamily:"inherit"}}>
              {showForm?"✕ Cancel":"+ New Announcement"}
            </button>
          </div>

          {/* Create form */}
          {showForm&&(
            <div style={{background:"#FFD70010",borderRadius:16,border:"1.5px solid #FFD70044",padding:"16px",marginBottom:14}}>
              <input value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                placeholder="Announcement title..."
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid #FFD70033`,background:t.inputBg,color:t.text,fontSize:14,fontFamily:"inherit",outline:"none",marginBottom:10,boxSizing:"border-box"}}
                onFocus={e=>e.target.style.border="1.5px solid #FFD700"}
                onBlur={e=>e.target.style.border="1.5px solid #FFD70033"}/>
              <textarea value={newBody} onChange={e=>setNewBody(e.target.value)}
                placeholder="Write your announcement for all mentors..."
                rows={3}
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:`1.5px solid #FFD70033`,background:t.inputBg,color:t.text,fontSize:13,fontFamily:"inherit",outline:"none",resize:"vertical",marginBottom:12,boxSizing:"border-box"}}
                onFocus={e=>e.target.style.border="1.5px solid #FFD700"}
                onBlur={e=>e.target.style.border="1.5px solid #FFD70033"}/>
              <button onClick={postAnnouncement} disabled={posting||!newTitle.trim()||!newBody.trim()}
                style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:posting||!newTitle.trim()||!newBody.trim()?"#718096":"#FFD700",color:"#000",fontSize:14,fontWeight:900,cursor:posting||!newTitle.trim()||!newBody.trim()?"not-allowed":"pointer",fontFamily:"inherit"}}>
                {posting?"Posting...":"📢 Post Announcement to All Mentors"}
              </button>
            </div>
          )}

          {/* Existing announcements */}
          {announcements.length===0&&!showForm&&(
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,padding:"16px",textAlign:"center",color:t.muted,fontSize:13}}>
              No announcements yet. Post one above.
            </div>
          )}
          {announcements.map(ann=>(
            <div key={ann.id} style={{background:"#FFD70010",borderRadius:14,border:"1px solid #FFD70033",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"flex-start",gap:10}}>
              <div style={{fontSize:20,flexShrink:0}}>📢</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:14,color:t.text,marginBottom:3}}>{ann.title}</div>
                <div style={{fontSize:12,color:t.textMid,lineHeight:1.5,marginBottom:4}}>{ann.body}</div>
                <div style={{fontSize:10,color:t.muted}}>{timeAgo(ann.createdAt)}</div>
              </div>
              <button onClick={()=>deleteAnnouncement(ann.id)}
                style={{background:"#FF5C7A15",border:"1px solid #FF5C7A33",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#FF5C7A",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                Delete
              </button>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[{val:users.length,label:"Registered Users",color:"#00E5A0"},{val:sessions.length,label:"Total Sessions",color:"#4F7FFF"},{val:`${confirmRate}%`,label:"Parent Confirmed",color:"#FF7043"},{val:"72%",label:"Goal Completion",color:"#C6FF00"}].map(st=>(
            <Card key={st.label} t={t} style={{borderLeft:`4px solid ${st.color}`}}>
              <div style={{fontSize:24,fontWeight:900,color:st.color}}>{st.val}</div>
              <div style={{fontSize:11,color:t.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{st.label}</div>
            </Card>
          ))}
        </div>
        {FOTC_TAGS.map(tag=>(
          <div key={tag.code} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:700,color:tag.color}}>{tag.code} — {tag.label}</span>
              <span style={{fontSize:11,fontWeight:900,color:tag.color}}>{tagCounts[tag.code]} sessions</span>
            </div>
            <PBar pct={sessions.length>0?(tagCounts[tag.code]/sessions.length)*100:0} color={tag.color}/>
          </div>
        ))}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 8px"}}>RISK ALERTS</div>
        {[{title:"Low Activity Match",sub:"No sessions logged in 18 days.",color:"#FF5C7A"},{title:"Unconfirmed Outings",sub:`${sessions.filter(s=>!s.parentConfirmed).length} awaiting parent confirmation.`,color:"#FFB300"},{title:"Report Due",sub:"Q2 2026 report due June 30.",color:"#4F7FFF"}].map((a,i)=>(
          <Card key={i} t={t} style={{borderLeft:`4px solid ${a.color}`}}>
            <div style={{fontWeight:800,fontSize:14,color:t.text}}>{a.title}</div>
            <div style={{fontSize:12,color:t.textMid,marginTop:3}}>{a.sub}</div>
          </Card>
        ))}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 8px"}}>REGISTERED USERS</div>
        {users.map(u=>(
          <Card key={u.id} t={t} style={{display:"flex",alignItems:"center",gap:12}}>
            <Avatar name={u.name||"?"} size={38} color={{mentor:"#4F7FFF",mentee:"#2E7D32",parent:"#FF7043",supervisor:"#FFD700"}[u.role]||"#718096"}/>
            <div style={{flex:1}}><div style={{fontWeight:700,color:t.text}}>{u.name}</div><div style={{fontSize:12,color:t.muted}}>{u.email}</div></div>
            <span style={{fontSize:12,fontWeight:700,color:t.muted,textTransform:"capitalize",background:t.inputBg,borderRadius:20,padding:"3px 10px"}}>{u.role==="mentee"?"achiever":u.role}</span>
          </Card>
        ))}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",margin:"16px 0 8px"}}>QUARTERLY REPORTING</div>
        <Btn size="lg" onClick={generateReport} color="#FFD700" disabled={generating} style={{borderRadius:14,fontWeight:900}} textColor="#000">{generating?"Generating...":"Generate Quarterly Report"}</Btn>
      </div>
    </div>
  );
}

// ── CIRCULAR PROGRESS RING ──
function CircleRing({ pct, color, size=44, stroke=4, label }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          {/* Track */}
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
          {/* Progress */}
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{transition:"stroke-dashoffset 0.6s ease"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:10,fontWeight:900,color:pct>0?color:"rgba(255,255,255,0.2)"}}>{pct}%</span>
        </div>
      </div>
      <span style={{fontSize:9,fontWeight:800,color:pct>0?color:"rgba(255,255,255,0.3)",letterSpacing:0.5}}>{label}</span>
    </div>
  );
}

// ── ACHIEVER REPORT PREVIEW CARD ──
function AchieverReportPreview({ achiever, displayName, t, onClick }) {
  const [sessionList, setSessionList] = useState([]);
  const [goalList, setGoalList] = useState([]);
  const [seasonGoals, setSeasonGoals] = useState([]);

  useEffect(() => {
    if (!achiever.uid) return;
    const q1 = query(collection(db,"sessions"), where("achieverId","==",achiever.uid));
    const q2 = query(collection(db,"goals"), where("achieverId","==",achiever.uid));
    const q3 = query(collection(db,"seasonGoals"), where("achieverId","==",achiever.uid));
    const u1 = onSnapshot(q1, snap => setSessionList(snap.docs.map(d=>d.data())));
    const u2 = onSnapshot(q2, snap => setGoalList(snap.docs.map(d=>d.data())));
    const u3 = onSnapshot(q3, snap => setSeasonGoals(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); u3(); };
  }, [achiever.uid]);

  // Count tags from sessions + goals
  const tagCounts = { LE:0, HWB:0, CIB:0, SEL:0 };
  sessionList.forEach(s => (s.goalTags||[]).forEach(tag => { if(tagCounts[tag]!==undefined) tagCounts[tag]++; }));
  goalList.forEach(g => { if(g.fotcTag && tagCounts[g.fotcTag]!==undefined) tagCounts[g.fotcTag]++; });

  const getTagPct = (code) => {
    const sg = seasonGoals.find(s => (s.targets?.[code]||0) > 0);
    const target = sg?.targets?.[code] || 0;
    const actual = tagCounts[code] || 0;
    if (target === 0) return { pct: actual > 0 ? 100 : 0, hasTarget: false, actual, target };
    return { pct: Math.min(Math.round((actual / target) * 100), 100), hasTarget: true, actual, target };
  };

  return (
    <button onClick={onClick}
      style={{width:"100%",background:t.card,border:`1.5px solid ${t.border}`,borderRadius:18,padding:"16px",marginBottom:12,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"block"}}>
      {/* Top row: avatar + name + arrow */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        {achiever.avatar
          ?<img src={achiever.avatar} alt={displayName} style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
          :<div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#29ABE2,#4F7FFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:"#fff",flexShrink:0}}>{displayName.slice(0,2).toUpperCase()}</div>
        }
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:15,color:t.text}}>{displayName}</div>
          <div style={{fontSize:11,color:t.muted,marginTop:2}}>{sessionList.length} sessions · {goalList.length} goals</div>
        </div>
        <span style={{color:t.muted,fontSize:18}}>›</span>
      </div>
      {/* 4 circular progress rings - one per FOTC area */}
      <div style={{display:"flex",justifyContent:"space-around",padding:"4px 0"}}>
        {FOTC_TAGS.map(tag=>{
          const { pct, hasTarget, actual, target } = getTagPct(tag.code);
          return (
            <div key={tag.code} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{position:"relative",width:52,height:52}}>
                <svg width={52} height={52} style={{transform:"rotate(-90deg)"}}>
                  <circle cx={26} cy={26} r={22} fill="none" stroke={tag.color+"22"} strokeWidth={5}/>
                  <circle cx={26} cy={26} r={22} fill="none" stroke={tag.color} strokeWidth={5}
                    strokeDasharray={2*Math.PI*22}
                    strokeDashoffset={2*Math.PI*22 - (pct/100)*2*Math.PI*22}
                    strokeLinecap="round"
                    style={{transition:"stroke-dashoffset 0.6s ease"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:11,fontWeight:900,color:actual>0?tag.color:t.muted}}>{hasTarget?`${pct}%`:actual}</span>
                </div>
              </div>
              <span style={{fontSize:9,fontWeight:800,color:tag.color,letterSpacing:0.5}}>{tag.code}</span>
              {hasTarget&&<span style={{fontSize:8,color:t.muted}}>{actual}/{target}</span>}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ── PROGRESS REPORT ──
function ProgressReport({ user, t }) {
  const isMentor = user.role === "mentor";
  const [achievers, setAchievers] = useState([]);
  const [selectedAchiever, setSelectedAchiever] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [detailView, setDetailView] = useState(null); // {type: "tag"|"goals_assigned"|"goals_completed", code?}

  // Load achievers for mentor
  useEffect(() => {
    if (!isMentor) return;
    const q = query(collection(db,"users"), where("role","==","mentee"));
    return onSnapshot(q, snap => setAchievers(snap.docs.map(d=>({uid:d.id,...d.data()}))));
  }, [isMentor]);

  // Load sessions
  useEffect(() => {
    const uid = isMentor ? (selectedAchiever?.uid||null) : user.uid;
    if (isMentor && !selectedAchiever) { setSessions([]); return; }
    const q = isMentor
      ? query(collection(db,"sessions"), where("mentorId","==",user.uid), where("achieverId","==",uid))
      : query(collection(db,"sessions"), where("achieverId","==",user.uid));
    return onSnapshot(q, snap => setSessions(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
  }, [isMentor, selectedAchiever, user.uid]);

  // Load goals
  useEffect(() => {
    const uid = isMentor ? (selectedAchiever?.uid||null) : user.uid;
    if (isMentor && !selectedAchiever) { setGoals([]); return; }
    const q = query(collection(db,"goals"), where("achieverId","==",uid));
    return onSnapshot(q, snap => setGoals(snap.docs.map(d=>({id:d.id,...d.data()}))));
  }, [isMentor, selectedAchiever, user.uid]);

  const doneGoals = goals.filter(g=>g.done);
  const activeGoals = goals.filter(g=>!g.done);

  // Count sessions + goals per FOTC tag
  const tagData = FOTC_TAGS.map(tag => {
    const tagSessions = sessions.filter(s=>(s.goalTags||[]).includes(tag.code));
    const tagGoals = goals.filter(g=>g.fotcTag===tag.code);
    return { ...tag, sessionCount: tagSessions.length, goalCount: tagGoals.length, sessions: tagSessions, goals: tagGoals };
  });

  // ── DETAIL VIEW ──
  if (detailView) {
    let title = "", items = [], renderItem;
    if (detailView.type === "goals_assigned") {
      title = "All Assigned Goals";
      items = goals;
      renderItem = (g) => {
        const tag = FOTC_TAGS.find(tg=>tg.code===g.fotcTag);
        const color = tag?.color||"#29ABE2";
        return (
          <Card key={g.id} t={t} style={{borderLeft:`4px solid ${color}`,opacity:g.done?0.7:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{flex:1}}><TagChip code={g.fotcTag} small/><div style={{fontWeight:800,fontSize:14,color:t.text,marginTop:4,textDecoration:g.done?"line-through":"none"}}>{g.title}</div></div>
              {g.done&&<span style={{fontSize:18,marginLeft:8}}>🏆</span>}
            </div>
            <PBar pct={g.progress||0} color={color}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{fontSize:11,color,fontWeight:700}}>{g.progress||0}% · {(g.subgoals||[]).filter(s=>s.done).length}/{(g.subgoals||[]).length} checkpoints</span>
              {g.targetDate&&<span style={{fontSize:11,color:t.muted}}>Due {new Date(g.targetDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>}
            </div>
          </Card>
        );
      };
    } else if (detailView.type === "goals_completed") {
      title = "Completed Goals";
      items = doneGoals;
      renderItem = (g) => {
        const tag = FOTC_TAGS.find(tg=>tg.code===g.fotcTag);
        const color = tag?.color||"#29ABE2";
        return (
          <Card key={g.id} t={t} style={{borderLeft:`4px solid #00E5A0`}}>
            <TagChip code={g.fotcTag} small/>
            <div style={{fontWeight:800,fontSize:14,color:t.text,marginTop:4,marginBottom:4}}>{g.title}</div>
            <div style={{fontSize:12,color:"#00E5A0",fontWeight:700}}>✓ Completed</div>
          </Card>
        );
      };
    } else if (detailView.type === "tag") {
      const td = tagData.find(x=>x.code===detailView.code);
      title = `${td?.code} — ${td?.label}`;
      renderItem = null;
      return (
        <div style={{paddingBottom:80}}>
          <div style={{background:`linear-gradient(135deg,${td?.color}33,${td?.color}11)`,padding:24,borderBottom:`4px solid ${td?.color}`}}>
            <button onClick={()=>setDetailView(null)} style={{background:"rgba(0,0,0,0.1)",border:"none",color:t.text,fontWeight:700,cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:16,fontFamily:"inherit"}}>&#8592; Back</button>
            <div style={{fontSize:11,fontWeight:700,color:td?.color,letterSpacing:2,marginBottom:4}}>{td?.code}</div>
            <div style={{fontSize:24,fontWeight:900,color:t.text}}>{td?.label}</div>
            <div style={{display:"flex",gap:16,marginTop:12}}>
              <div style={{background:td?.color+"22",borderRadius:12,padding:"8px 16px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:900,color:td?.color}}>{td?.sessionCount}</div>
                <div style={{fontSize:10,color:t.muted,fontWeight:700}}>SESSIONS</div>
              </div>
              <div style={{background:td?.color+"22",borderRadius:12,padding:"8px 16px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:900,color:td?.color}}>{td?.goalCount}</div>
                <div style={{fontSize:10,color:t.muted,fontWeight:700}}>GOALS</div>
              </div>
            </div>
          </div>
          <div style={{padding:16}}>
            {td?.sessions.length>0&&<>
              <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>SESSIONS</div>
              {td.sessions.map(s=>(
                <Card key={s.id} t={t} style={{borderLeft:`4px solid ${td.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{fontWeight:700,color:t.text}}>{s.date}</div>
                    {s.selMood&&<span style={{fontSize:16}}>{MOOD_MAP[Math.min(s.selMood-1,9)].emoji}</span>}
                  </div>
                  <div style={{fontSize:12,color:t.muted}}>{s.outingType} · {s.mentorName||"Mentor"}</div>
                  {s.summary&&<div style={{fontSize:12,color:t.textMid,marginTop:4}}>{s.summary.slice(0,100)}{s.summary.length>100?"...":""}</div>}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{(s.goalTags||[]).map(c=><TagChip key={c} code={c} small/>)}</div>
                </Card>
              ))}
            </>}
            {td?.goals.length>0&&<>
              <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10,marginTop:8}}>GOALS</div>
              {td.goals.map(g=>(
                <Card key={g.id} t={t} style={{borderLeft:`4px solid ${td.color}`,opacity:g.done?0.75:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:700,fontSize:14,color:t.text,textDecoration:g.done?"line-through":"none"}}>{g.title}</div>
                    {g.done&&<span>🏆</span>}
                  </div>
                  <PBar pct={g.progress||0} color={td.color}/>
                  <div style={{fontSize:11,color:td.color,fontWeight:700,marginTop:4}}>{g.progress||0}% complete</div>
                </Card>
              ))}
            </>}
            {!td?.sessions.length&&!td?.goals.length&&(
              <div style={{textAlign:"center",padding:"3rem 2rem",background:t.card,borderRadius:20,border:`1px solid ${t.border}`}}>
                <div style={{fontSize:40,marginBottom:8}}>📭</div>
                <div style={{fontWeight:700,color:t.text}}>No data for {td?.code} yet</div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={{paddingBottom:80}}>
        <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",padding:24}}>
          <button onClick={()=>setDetailView(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:16,fontFamily:"inherit"}}>&#8592; Back</button>
          <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>REPORT</div>
          <div style={{fontSize:24,fontWeight:900,color:"#fff"}}>{title}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>{items.length} {detailView.type==="goals_assigned"?"total":"completed"}</div>
        </div>
        <div style={{padding:16}}>
          {items.length===0?(
            <div style={{textAlign:"center",padding:"3rem 2rem",background:t.card,borderRadius:20,border:`1px solid ${t.border}`}}>
              <div style={{fontSize:40,marginBottom:8}}>📭</div>
              <div style={{fontWeight:700,color:t.text}}>Nothing here yet</div>
            </div>
          ):items.map(renderItem)}
        </div>
      </div>
    );
  }

  // ── ACHIEVER SELECTOR (mentor only) ──
  if (isMentor && !selectedAchiever) return (
    <div style={{paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",padding:24}}>
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>REPORT</div>
        <div style={{fontSize:26,fontWeight:900,color:"#fff"}}>Select Achiever</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>View progress for each achiever</div>
      </div>
      <div style={{padding:16}}>
        {achievers.length===0&&<div style={{textAlign:"center",color:t.muted,padding:"3rem"}}>No achievers yet.</div>}
        {achievers.map(a=>{
          const displayName = a.nickname||a.name||"Achiever";
          return(
            <AchieverReportPreview key={a.uid} achiever={a} displayName={displayName} t={t} onClick={()=>setSelectedAchiever(a)}/>
          );
        })}
      </div>
    </div>
  );

  // ── MAIN REPORT DASHBOARD ──
  const displayName = isMentor?(selectedAchiever?.nickname||selectedAchiever?.name):(user.nickname||user.name);
  const totalSessions = sessions.length;
  const confirmedSessions = sessions.filter(s=>s.parentConfirmed).length;
  const goalPct = goals.length>0?Math.round((doneGoals.length/goals.length)*100):0;

  return (
    <div style={{paddingBottom:80}}>
      <div style={{background:"linear-gradient(135deg,#0B1437,#1a2456)",padding:24}}>
        {isMentor&&<button onClick={()=>{setSelectedAchiever(null);setDetailView(null);}} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",fontWeight:700,cursor:"pointer",marginBottom:14,fontSize:13,display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:16,fontFamily:"inherit"}}>&#8592; All Achievers</button>}
        <div style={{fontSize:11,color:"#29ABE2",fontWeight:700,letterSpacing:2,marginBottom:4}}>PROGRESS REPORT</div>
        <div style={{fontSize:24,fontWeight:900,color:"#fff"}}>{displayName}</div>
        <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
          {[{val:totalSessions,label:"Sessions",color:"#29ABE2"},{val:confirmedSessions,label:"Confirmed",color:"#00E5A0"},{val:goals.length,label:"Goals",color:"#9B5CFF"},{val:doneGoals.length,label:"Completed",color:"#C6FF00"}].map(s=>(
            <div key={s.label} style={{background:"rgba(255,255,255,0.08)",borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:s.color}}>{s.val}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1}}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:16}}>
        {/* Goals section — split into assigned + completed */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>GOALS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          <button onClick={()=>setDetailView({type:"goals_assigned"})}
            style={{background:t.card,border:`1.5px solid #9B5CFF44`,borderRadius:16,padding:"16px 14px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
            <div style={{fontSize:28,fontWeight:900,color:"#9B5CFF"}}>{goals.length}</div>
            <div style={{fontSize:12,fontWeight:700,color:t.muted,marginTop:4}}>Goals Assigned</div>
            <div style={{fontSize:11,color:"#9B5CFF",marginTop:6,fontWeight:600}}>Tap to view all →</div>
          </button>
          <button onClick={()=>setDetailView({type:"goals_completed"})}
            style={{background:t.card,border:`1.5px solid #00E5A044`,borderRadius:16,padding:"16px 14px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
            <div style={{fontSize:28,fontWeight:900,color:"#00E5A0"}}>{doneGoals.length}</div>
            <div style={{fontSize:12,fontWeight:700,color:t.muted,marginTop:4}}>Goals Completed</div>
            <div style={{fontSize:11,color:"#00E5A0",marginTop:6,fontWeight:600}}>{goalPct}% completion</div>
          </button>
        </div>

        {/* FOTC Tag breakdown — each bar is tappable */}
        <div style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>FOCUS AREAS — TAP TO EXPLORE</div>
        {tagData.map(td=>{
          const total = td.sessionCount + td.goalCount;
          const maxTotal = Math.max(...tagData.map(x=>x.sessionCount+x.goalCount),1);
          const pct = Math.round((total/maxTotal)*100);
          return(
            <button key={td.code} onClick={()=>setDetailView({type:"tag",code:td.code})}
              style={{width:"100%",background:t.card,border:`1.5px solid ${td.color}33`,borderRadius:16,padding:"14px 16px",marginBottom:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",display:"block"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <span style={{fontWeight:900,fontSize:15,color:td.color}}>{td.code}</span>
                  <span style={{fontSize:12,color:t.muted,marginLeft:8}}>{td.label}</span>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:11,color:t.muted}}>{td.sessionCount} sessions · {td.goalCount} goals</span>
                  <span style={{color:td.color,fontSize:16}}>›</span>
                </div>
              </div>
              {/* Stacked bar — sessions + goals */}
              <div style={{height:10,borderRadius:10,background:t.border,overflow:"hidden",display:"flex"}}>
                <div style={{height:"100%",width:`${(td.sessionCount/(maxTotal))*100}%`,background:td.color,borderRadius:"10px 0 0 10px",transition:"width 0.4s ease"}}/>
                <div style={{height:"100%",width:`${(td.goalCount/(maxTotal))*100}%`,background:td.color+"88",transition:"width 0.4s ease"}}/>
              </div>
              <div style={{display:"flex",gap:12,marginTop:6}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:td.color}}/><span style={{fontSize:10,color:t.muted}}>Sessions</span></div>
                <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:8,height:8,borderRadius:"50%",background:td.color+"88"}}/><span style={{fontSize:10,color:t.muted}}>Goals</span></div>
              </div>
            </button>
          );
        })}

        {totalSessions===0&&goals.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 2rem",background:t.card,borderRadius:20,border:`1px solid ${t.border}`,marginTop:8}}>
            <div style={{fontSize:48,marginBottom:12}}>📊</div>
            <div style={{fontWeight:800,fontSize:16,color:t.text,marginBottom:6}}>No data yet</div>
            <div style={{fontSize:13,color:t.muted}}>{isMentor?"Log sessions and assign goals to see progress.":"Your progress will appear here."}</div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── MAIN APP ──
export default function App() {
  const [user,setUser]=useState(null);
  usePresence(user?.uid);
  const [tab,setTab]=useState("home");
  const [loading,setLoading]=useState(true);
  const [darkMode,setDarkMode]=useState(false);
  const [showProfile,setShowProfile]=useState(false);
  const [selectedAchieverId,setSelectedAchieverId]=useState(null);
  const [selectedAchieverName,setSelectedAchieverName]=useState(null);
  const [selectedAchiever,setSelectedAchiever]=useState(null);
  const [startSessionWrite,setStartSessionWrite]=useState(false);
  const [navKey,setNavKey]=useState(0);

  useEffect(()=>{
    return onAuthStateChanged(auth,async u=>{
      if (u){
        const snap=await getDoc(doc(db,"users",u.uid));
        if (snap.exists()){ const ud={uid:u.uid,...snap.data()}; setUser(ud); setDarkMode(!LIGHT_ROLES.includes(ud.role)); setTab("home"); setNavKey(k=>k+1); }
      } else setUser(null);
      setLoading(false);
    });
  },[]);

  const handleLogin=ud=>{setUser(ud);setDarkMode(!LIGHT_ROLES.includes(ud.role));setTab("home");setNavKey(k=>k+1);};
  const handleLogout=async()=>{
    try { if (user?.uid) await set(ref(rtdb,`presence/${user.uid}`),{online:false,lastSeen:serverTimestamp()}); } catch(e){ console.warn("presence update failed",e); }
    try { await signOut(auth); } catch(e){ console.warn("signOut failed",e); }
    setUser(null);setDarkMode(false);setTab("home");setShowProfile(false);setSelectedAchiever(null);setSelectedAchieverId(null);setSelectedAchieverName(null);setNavKey(k=>k+1);
  };
  const t={...getTheme(darkMode),textMid:darkMode?"#A0A0C0":"#4A5568"};

  // Always fully resets the current page when tapping a tab
  const handleTabChange=(id)=>{
    // Always clear everything regardless of which tab is tapped
    setShowProfile(false);
    setStartSessionWrite(false);
    setSelectedAchieverId(null);
    setSelectedAchieverName(null);
    // Only clear selectedAchiever when leaving home entirely
    if (id!=="home") setSelectedAchiever(null);
    // When going home, also clear achiever so dashboard grid shows
    if (id==="home") setSelectedAchiever(null);
    setTab(id);
    setNavKey(k=>k+1);
  };

  if (loading) return(
    <div style={{minHeight:"100vh",background:"#F0F7FF",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Inter',system-ui,sans-serif;}`}</style>
      <AppIcon size={72}/>
      <div style={{fontSize:22,fontWeight:900,color:"#0D1B2A"}}>FOTC <span style={{color:"#29ABE2"}}>NY</span></div>
      <div style={{fontSize:14,color:"#718096",fontWeight:600}}>Loading...</div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin}/>;

  const roleColor={mentor:"#4F7FFF",mentee:"#2E7D32",parent:"#FF7043",supervisor:"#FFD700"}[user.role]||"#29ABE2";
  const tabsByRole={
    mentor:[{id:"home",label:"Home"},{id:"notes",label:"Journal"},{id:"goals",label:"Goals"},{id:"messages",label:"Chat"},{id:"report",label:"Report"}],
    mentee:[{id:"home",label:"Home"},{id:"goals",label:"Goals"},{id:"messages",label:"Chat"},{id:"report",label:"Report"}],
    parent:[{id:"home",label:"Home"},{id:"messages",label:"Marcus"},{id:"report",label:"Report"}],
    supervisor:[{id:"home",label:"Overview"},{id:"report",label:"Reports"}],
  };
  const tabs=tabsByRole[user.role]||tabsByRole.mentor;

  const renderContent=()=>{
    if (showProfile) return <ProfileScreen user={user} setUser={setUser} t={t} onBack={()=>setShowProfile(false)}/>;
    switch(tab){
      case "home": return user.role==="mentor"?<MentorDash user={user} setTab={setTab} t={t} selectedAchiever={selectedAchiever} setSelectedAchiever={setSelectedAchiever} setSelectedAchieverId={setSelectedAchieverId} setSelectedAchieverName={setSelectedAchieverName} setStartSessionWrite={setStartSessionWrite}/>:user.role==="mentee"?<AchieverDash user={user} t={t}/>:user.role==="parent"?<ParentDash user={user} t={t}/>:<SupervisorDash user={user} t={t}/>;
      case "notes": return <SessionLog user={user} setTab={setTab} t={t} selectedAchieverId={selectedAchieverId} selectedAchieverName={selectedAchieverName} onBack={selectedAchiever?()=>{setStartSessionWrite(false);setTab("home");}:null} startWriting={startSessionWrite}/>;
      case "goals": return <Goals user={user} t={t}/>;
      case "messages": return <div style={{background:t.bg,flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><Messages user={user} t={t}/></div>;
      case "report": return <ProgressReport user={user} t={t}/>;
      default: return null;
    }
  };

  const tabIcons={
    home:(active)=><svg width="22" height="22" viewBox="0 0 24 24" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
    notes:(active)=><svg width="22" height="22" viewBox="0 0 24 24" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    goals:(active)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r={active?3:2} fill={active?"currentColor":"none"}/></svg>,
    messages:(active)=><svg width="22" height="22" viewBox="0 0 24 24" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    report:(active)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>{active&&<><rect x="16" y="10" width="4" height="10" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="4" y="14" width="4" height="6" rx="1" fill="currentColor" stroke="none"/></>}</svg>,
  };

  return(
    <UserCacheProvider>
    <div style={{display:"flex",flexDirection:"column",height:"calc(var(--vh, 1vh) * 100)",background:t.bg,color:t.text,fontFamily:"'Inter',system-ui,sans-serif",overflow:"hidden"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{overflow:hidden;overscroll-behavior:none;}
        body{background:${t.bg};font-family:'Inter',system-ui,sans-serif;}
        .tab-btn{position:relative;flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;padding:0;transition:transform 0.15s;}
        .tab-btn:active{transform:scale(0.9);}
      `}</style>

      {/* Header — not fixed, part of flex column */}
      <div style={{background:t.headerBg,padding:"10px 16px",paddingTop:"max(10px, env(safe-area-inset-top))",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${t.border}`,flexShrink:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <AppIcon size={32}/>
          <div>
            <div style={{fontSize:15,fontWeight:900,color:"#fff",letterSpacing:0.5}}>FOTC <span style={{color:"#29ABE2"}}>NY</span></div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{user.role==="mentee"?"achiever":user.role} · {user.nickname||user.name}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <ThemeToggle darkMode={darkMode} setDarkMode={setDarkMode} t={t}/>
          <button onClick={()=>{setShowProfile(true);setTab("home");}} style={{background:"none",border:"none",cursor:"pointer",padding:0,borderRadius:"50%"}}>
            {user.avatar
              ?<img src={user.avatar} alt="avatar" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover",border:`2px solid ${roleColor}`}}/>
              :<Avatar name={user.nickname||user.name||"?"} size={30} color={roleColor}/>
            }
          </button>
          <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.12)",border:"none",borderRadius:8,padding:"5px 10px",color:"rgba(255,255,255,0.8)",fontSize:11,fontWeight:700,cursor:"pointer"}}>Logout</button>
        </div>
      </div>

      {/* Scrollable content — fills all remaining space between header and tab bar */}
      <div key={navKey} style={{flex:1,overflow:tab==="messages"?"hidden":"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",display:"flex",flexDirection:"column"}}>
        {renderContent()}
      </div>

      {/* Tab bar — flex item, sits flush at bottom */}
      <div style={{flexShrink:0,zIndex:100}}>
        <div style={{background:darkMode?"rgba(9,9,15,0.98)":"rgba(238,242,247,0.98)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:`2px solid ${t.border}`,boxShadow:"0 -2px 16px rgba(0,0,0,0.1)",padding:"8px 8px 8px"}}>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-around"}}>
            {tabs.map(tb=>{
              const active = tab===tb.id && !showProfile;
              const icon = tabIcons[tb.id]||tabIcons.home;
              return (
                <button key={tb.id} className="tab-btn" onClick={()=>handleTabChange(tb.id)}>
                  {/* Active pill background */}
                  <div style={{
                    position:"relative",
                    width: active?56:44,
                    height: active?56:44,
                    borderRadius: active?18:14,
                    background: active?`linear-gradient(135deg,${roleColor},${roleColor}CC)`:"transparent",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
                    boxShadow: active?`0 6px 20px ${roleColor}55`:"none",
                    marginBottom: active?2:0,
                  }}>
                    {/* Glow ring for active */}
                    {active&&<div style={{position:"absolute",inset:-3,borderRadius:21,border:`1.5px solid ${roleColor}44`,animation:"none"}}/>}
                    <div style={{color: active?"#fff":t.muted, transition:"color 0.2s", display:"flex"}}>
                      {icon(active)}
                    </div>
                  </div>
                  {/* Label */}
                  <span style={{
                    fontSize: active?10:9,
                    fontWeight: active?900:600,
                    color: active?roleColor:t.muted,
                    letterSpacing: active?0.5:0.3,
                    textTransform:"uppercase",
                    transition:"all 0.2s",
                  }}>{tb.label}</span>
                  {/* Active dot */}
                  {active&&<div style={{width:4,height:4,borderRadius:"50%",background:roleColor,marginTop:2,boxShadow:`0 0 6px ${roleColor}`}}/>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </UserCacheProvider>
  );
}