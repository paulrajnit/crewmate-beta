import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Design tokens ────────────────────────────────────────────────
const C = {
  bg:"#090B0F", card:"#111418", card2:"#181C23", border:"#1F2530",
  accent:"#FF6B35", blue:"#00C8FF", green:"#2ECC71", amber:"#F59E0B",
  purple:"#A78BFA", pink:"#F472B6", red:"#FF4D6D",
  muted:"#3D4655", soft:"#7A8599", text:"#EDF2FF",
};

const ROLE_MAP = { CM:"CM", SM:"CM", CSM:"CM", CEA:"CC", FA:"CC", CC:"CC" };
// Full duty code registry — sourced from roster PDF info section + crew-provided list.
// Parser auto-detects any of these codes from imported rosters.
// paidHours: set for codes that generate pay (RGD=7.5h, PHO=7.5h per CWP agreement)
// icon: emoji shown on duty day card
// dim: true = faded display (rest/off days)
const DUTY_META = {
  // ── Off / Leave ──────────────────────────────────────────────────────────
  OFF:{ label:"Day Off",                 color:"#3D4655", dim:true,  icon:"😴" },
  STR:{ label:"Star Day",                color:"#F59E0B",            icon:"⭐" },
  LVE:{ label:"Annual Leave",            color:"#34D399",            icon:"🌴" },
  AOF:{ label:"Annual Leave Off Day",    color:"#6B7280", dim:true,  icon:"🌴" },
  HLV:{ label:"Ad-hoc Leave",            color:"#34D399",            icon:"🌿" },
  MAT:{ label:"Maternity Leave",         color:"#F472B6",            icon:"👶" },
  XAV:{ label:"Ex-Available Day",        color:"#6B7280", dim:true,  icon:"💤" },
  // ── Ground Duties (paid) ─────────────────────────────────────────────────
  RGD:{ label:"Restricted Ground Duties",color:"#00C8FF", paidHours:7.5, icon:"🏢" },
  PHO:{ label:"Public Holiday Off",      color:"#A78BFA", paidHours:7.5, icon:"🎉" },
  WVL:{ label:"Worked on AVL",           color:"#2ECC71", paidHours:7.5, icon:"✅" },
  WDO:{ label:"Worked Day Off",          color:"#2ECC71",            icon:"✅" },
  ADM:{ label:"Admin Duties",            color:"#00C8FF",            icon:"📋" },
  DBF:{ label:"Debriefing / Training Check", color:"#A78BFA",        icon:"📝" },
  // ── Standby / Reserve ────────────────────────────────────────────────────
  AVL:{ label:"Home Available Reserve",  color:"#34D399",            icon:"📲" },
  SBY:{ label:"Standby",                 color:"#F59E0B",            icon:"⏳" },
  STB:{ label:"Flight Deck Standby",     color:"#F59E0B",            icon:"✈️" },
  ESB:{ label:"Standby Extended Callout",color:"#F59E0B",            icon:"🔔" },
  RAS:{ label:"Reassignable Day",        color:"#F59E0B",            icon:"🔄" },
  // ── Training ─────────────────────────────────────────────────────────────
  SIM:{ label:"Simulator",               color:"#F472B6",            icon:"🎮" },
  TRN:{ label:"Training",                color:"#F472B6",            icon:"📚" },
  TVL:{ label:"Available for Training",  color:"#A78BFA",            icon:"🎓" },
  TCH:{ label:"Training Centre to Hotel",color:"#00C8FF",            icon:"🏨" },
  HTC:{ label:"Hotel to Training Centre",color:"#00C8FF",            icon:"🏨" },
  // ── Medical / Welfare ────────────────────────────────────────────────────
  UFD:{ label:"Unfit for Duties",        color:"#FF4D6D",            icon:"🤒" },
  FTG:{ label:"Fatigue Claim",           color:"#FF4D6D",            icon:"😴" },
  PAS:{ label:"Pre-Assigned Sickness",   color:"#FF4D6D",            icon:"🏥" },
  // ── Hotel / Transit ──────────────────────────────────────────────────────
  HTL:{ label:"Hotel",                   color:"#00C8FF",            icon:"🏨" },
  PCK:{ label:"Hotel Pickup",            color:"#F59E0B",            icon:"🚐" },
  // ── Transfer / Ground ops ───────────────────────────────────────────────
  BLN:{ label:"Blank Day",               color:"#3D4655", dim:true,  icon:"⬜" },
  OOB:{ label:"Car Transfer",            color:"#F59E0B",            icon:"🚐" },
  BNO:{ label:"Car Transfer",            color:"#F59E0B",            icon:"🚐" },
  OSB:{ label:"Airport Standby",         color:"#F59E0B",            icon:"🛫" },
  LEP:{ label:"Leave Pass",              color:"#6B7280",            icon:"📋" },
  EPA:{ label:"Extended Period Available",color:"#34D399",            icon:"📲" },
  // ── Flight (generic fallback) ─────────────────────────────────────────────
  FLT:{ label:"Flight",                  color:"#2ECC71",            icon:"✈️" },
};

const _D=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const _M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate=d=>`${_D[d.getDay()]} ${d.getDate()} ${_M[d.getMonth()]}`;
const TODAY    = fmtDate(new Date());
const TOMORROW = fmtDate(new Date(Date.now()+86400000));

// ─── Swipe hook ───────────────────────────────────────────────────
function useSwipe(onLeft,onRight){
  const ref=useRef(null),sx=useRef(null);
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const s=e=>{sx.current=(e.touches?.[0]??e).clientX;};
    const e2=e=>{
      if(sx.current===null)return;
      const dx=(e.changedTouches?.[0]??e).clientX-sx.current;
      if(Math.abs(dx)>48)dx<0?onLeft():onRight();
      sx.current=null;
    };
    el.addEventListener("touchstart",s,{passive:true});
    el.addEventListener("touchend",e2,{passive:true});
    el.addEventListener("mousedown",s);el.addEventListener("mouseup",e2);
    return()=>{
      el.removeEventListener("touchstart",s);el.removeEventListener("touchend",e2);
      el.removeEventListener("mousedown",s);el.removeEventListener("mouseup",e2);
    };
  },[onLeft,onRight]);
  return ref;
}

// ─── PDF extractor ────────────────────────────────────────────────
async function extractPDFText(file,onProgress){
  if(!window.pdfjsLib){
    onProgress("Loading PDF reader…");
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload=res;s.onerror=()=>rej(new Error("Could not load PDF reader."));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  let full="";
  for(let i=1;i<=pdf.numPages;i++){
    onProgress(`Reading page ${i} of ${pdf.numPages}…`);
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    const items=content.items.sort((a,b)=>{
      const dy=Math.round(b.transform[5])-Math.round(a.transform[5]);
      return dy!==0?dy:a.transform[4]-b.transform[4];
    });
    let lastY=null;
    for(const item of items){
      const y=Math.round(item.transform[5]);
      if(lastY!==null&&Math.abs(y-lastY)>3)full+="\n";
      full+=item.str+" ";lastY=y;
    }
    full+="\n";
  }
  return full;
}

// ─── CWP Roster Parser ────────────────────────────────────────────
function parseCWPRoster(rawText){
  const MA={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  const MS=["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DL={MON:"Mon",TUE:"Tue",WED:"Wed",THU:"Thu",FRI:"Fri",SAT:"Sat",SUN:"Sun"};
  const nameM=rawText.match(/([A-Z]{2,}(?:\s+[A-Z]{2,})+)\s+(\d{5,7})\s+[AE]-/);
  const crewName=nameM?nameM[1].split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" "):"";
  const empId=nameM?nameM[2]:"";
  const roleM=rawText.match(/[A-Z]{3}-([A-Z]{2,4})(?:\s+\d{2}[A-Z]{3}|\s+\d{2}[A-Z]{3}\d{2}|-)/);
  const crewRole=ROLE_MAP[roleM?roleM[1]:""]||"CC";
  const perM=rawText.match(/\d{2}([A-Z]{3})\d{2}\s*-\s*\d{2}([A-Z]{3})(\d{2})/);
  let rosterMonth=perM?MA[perM[2]]||4:4,rosterYear=perM?2000+parseInt(perM[3]):2026;
  const blhM=rawText.match(/BLH:\s*(\d+):(\d+)/);
  const flightBLH=blhM?parseInt(blhM[1])+parseInt(blhM[2])/60:0;
  const t2m=t=>{if(!t)return -1;const[h,m]=t.split(":").map(Number);return h*60+m;};
  const isBLH=(t,dep)=>t&&dep&&t2m(t)<t2m(dep)&&t2m(t)<15*60;
  const NOT_IATA=new Set(["JQ","NEO","BLH","RGD","PHO","OFF","STR","ATA","ATD","REQ","RQD","PL",
    "SBY","AVL","SIM","TRN","LVE","XAV","UFD","ADM","WVL","AOF","FTG","DBF","ESB","RAS","WDO",
    "STB","MAT","TVL","TCH","HTC","PAS","HLV","320","321","787","32N","32Q","32A","321","CM","CM2","DD","CI","CO","AC","TF","TJD"]);
  const DUTY_SET=new Set(["OFF","RGD","PHO","STR","AVL","SBY","SIM","TRN","LVE","XAV","UFD",
    "ADM","WVL","AOF","FTG","DBF","ESB","RAS","WDO","STB","MAT","TVL","TCH","HTC","PAS","HLV",
    "BLN","OOB","BNO","OSB","LEP","EPA","WVL","OSB","TF"]);
  // KEY FIX: match date token ANYWHERE in line (PDF.js sometimes puts it at end)
  const DATE_ANY=/(\d{2})(MON|TUE|WED|THU|FRI|SAT|SUN)/;
  const FLT_RE=/\b(JQ\d{2,4})\b/;
  const skipLine=l=>{
    if(/^\d{6}\s+\d{2}:\d{2}/.test(l))return true;
    for(const s of["Individual Roster","Crew Web Portal","Page ","Date DD","AKL-CM","E-CEA","E-CM"])
      if(l.includes(s))return true;
    return false;
  };
  const getIatas=txt=>{const r=[];const re2=/\b([A-Z]{3})\b/g;let m2;
    while((m2=re2.exec(txt)))if(!NOT_IATA.has(m2[1]))r.push(m2[1]);return r;};
  const getTimes=txt=>{const r=[];const re2=/\b(\d{2}:\d{2})\b/g;let m2;
    while((m2=re2.exec(txt)))if(m2[1]!=="00:00"&&m2[1]!=="24:00")r.push(m2[1]);return r;};
  const lines=rawText.split("\n").map(l=>l.trim()).filter(Boolean);
  const days=[];let cur=null;let rgdCount=0,phoCount=0;
  for(let line of lines){
    if(skipLine(line))continue;
    if(line.startsWith("BLH:")||line.startsWith("CDUTY:"))continue;
    if(line.startsWith("Crew onboard")||line.startsWith("Hotels")||line.startsWith("Info"))break;
    // Extract date from ANYWHERE in line
    const dm=DATE_ANY.exec(line);
    if(dm){
      if(cur)days.push(cur);
      const dstr=`${DL[dm[2]]} ${parseInt(dm[1])} ${MS[rosterMonth]}`;
      const rest=(line.slice(0,dm.index)+' '+line.slice(dm.index+dm[0].length)).trim();
      cur={dateStr:dstr,type:null,flights:{},layover:false,signOn:null,signOff:null};
      if(rest)line=rest; else continue;
    }
    if(!cur)continue;
    const first=line.split(" ")[0]||"";
    if(first==="HTL"){cur.layover=true;continue;}
    if(first==="PCK"||first==="BLH:"||first==="CDUTY:")continue;
    const lineNorm=line.replace(/^P\s+(JQ)/,"$1");
    if(!FLT_RE.test(lineNorm)){
      let duty=null;
      for(const c of DUTY_SET)if(new RegExp(`\\b${c}\\b`).test(line)&&!FLT_RE.test(line)){duty=c;break;}
      if(duty){
        if(!cur.type)cur.type=duty;
        if(duty==="RGD")rgdCount++;
        if(duty==="PHO")phoCount++;
        const times=getTimes(line).filter(t=>t!=="00:00"&&t!=="24:00");
        if(times.length>=2&&!cur.signOn){cur.signOn=times[0];cur.signOff=times[times.length-1];}
        else if(times.length===1&&!cur.signOn)cur.signOn=times[0];
      }
      continue;
    }
    // Strip positioning prefix "P " from deadhead flights
    const cleanLine=line.replace(/^P\s+(JQ)/,"$1");
    const fm=FLT_RE.exec(cleanLine);const fno=fm[1];
    const rest2=line.slice(fm.index+fm[0].length).trim();
    const iatas=getIatas(rest2);const rawt=getTimes(rest2);
    if(!iatas.length&&rawt.length===1)continue;
    if(!cur.flights[fno]){
      const times=[...rawt];
      // Remove C/O (sign-off) time from end: it's before 15:00 and less than any dep
      // Column order: C/I(signOn), ATD(dep), ATA(arr), C/O(signOff)
      // Strip trailing BLH-like times first
      let signOn=null;
      // If 3+ times: first is C/I, second is dep, third is arr
      // If 2 times: first may be C/I or dep depending on context
      let dep=null,arr=null;
      if(times.length>=3){
        // 3-time format: C/I, ATD, ATA [,C/O stripped by BLH filter]
        signOn=times[0];dep=times[1];arr=times[2];
      } else if(times.length===2){
        dep=times[0];arr=times[1];
      } else if(times.length===1){
        dep=times[0];
      }
      if(dep)while(arr&&isBLH(arr,dep)){arr=null;}
      const frm=iatas[0]||null;const to=iatas.length>1?iatas[1]:null;
      cur.flights[fno]={no:fno,from:frm,to,dep,arr:arr||null,signOn:signOn||null,overnight:!arr};
      cur.type="FLIGHT";
    }else{
      const ex=cur.flights[fno];const dep2=ex.dep;
      if(iatas.length&&!ex.to)ex.to=iatas[0];
      const times=[...rawt];
      if(dep2)while(times.length&&isBLH(times[times.length-1],dep2))times.pop();
      // Merge row: first available time is arr if we don't have one yet
      if(times.length&&!ex.arr){
        ex.arr=times[0];ex.overnight=false;
      }
      // If merge row has 2 times, second might be C/O
      if(times.length>=2&&!ex.signOn)ex.signOn=times[0];
    }
  }
  if(cur)days.push(cur);
  // Pass 2: fill missing destinations & mark continuation rows
  const fltIdx={};
  for(let di=0;di<days.length;di++){
    for(const [fno2,f] of Object.entries(days[di].flights)){
      if(!fltIdx[fno2])fltIdx[fno2]=[];
      fltIdx[fno2].push({di,f});
    }
  }
  for(const entries of Object.values(fltIdx)){
    for(let i=0;i<entries.length-1;i++){
      const {f}=entries[i];const {f:nf}=entries[i+1];
      if(f._skip)continue;
      if(!f.to&&nf.from)f.to=nf.from;
      if(!f.arr&&nf.dep&&t2m(nf.dep)<8*60){f.arr=nf.arr||nf.dep;f.overnight=true;}
      if(nf.dep&&t2m(nf.dep)<8*60)nf._skip=true;
    }
  }
  // Build output
  const flights=[],agenda={};
  for(const day of days){
    agenda[day.dateStr]=agenda[day.dateStr]||[];
    if(day.type==="FLIGHT"){
      const flist=Object.values(day.flights).filter(f=>f.dep&&!f._skip);
      const signOn=flist[0]?.dep||null;
      const signOff=flist[flist.length-1]?.arr||null;
      for(const f of flist){
        const dm2=t2m(f.arr)-t2m(f.dep);const dh=f.arr&&dm2>0?+(dm2/60).toFixed(2):0;
        flights.push({date:day.dateStr,flightNo:f.no,from:f.from||"AKL",to:f.to||"???",
          dep:f.dep,arr:f.arr||"",signOff:signOff||"",aircraft:"A320",dutyHours:dh,
          role:crewRole,gate:"",rego:"",overnight:f.overnight||false});
        agenda[day.dateStr].push({type:"flight",flightNo:f.no,from:f.from||"AKL",
          to:f.to||"???",dep:f.dep,arr:f.arr||"",signOff:signOff||"",signOn:f.signOn||signOn||"",
          color:(f.overnight||false)?C.amber:C.green,overnight:f.overnight||false});
      }
    }else if(day.type){
      const meta=DUTY_META[day.type]||{};
      agenda[day.dateStr].push({type:"duty",code:day.type,
        color:meta.color||C.muted,paidHours:meta.paidHours||0,
        signOn:day.signOn,signOff:day.signOff});
    }
  }
  const groundPaidHours=(rgdCount+phoCount)*7.5;
  const totalBLH=flightBLH+groundPaidHours;

  // Parse crew onboard section
  const crewBriefing={};
  const crewLines=rawText.split("\n");
  let inCrewSection=false;
  for(let ci=0;ci<crewLines.length;ci++){
    const cl=crewLines[ci].trim();
    if(cl==="Crew onboard"){inCrewSection=true;continue;}
    if(cl==="Hotels"||cl==="Info"||cl.startsWith("BLH:")){inCrewSection=false;continue;}
    if(!inCrewSection||!cl)continue;
    const parts=cl.split(" ");
    if(parts.length<3)continue;
    // Format: "13APR26 JQ115 C. WESTALL J. MATTHEWS ..."
    const datePart=parts[0];
    const flightPart=parts[1];
    if(!datePart.match(/^\d{2}[A-Z]{3}\d{2}$/)||!flightPart.startsWith("JQ"))continue;
    const crewDay=datePart.slice(0,2);
    const crewMon=datePart.slice(2,5);
    const crewKey=flightPart+"_"+crewDay+crewMon;
    // Parse names from rest of line
    const nameTokens=parts.slice(2);
    const crewNames=[];
    let ni=0;
    while(ni<nameTokens.length){
      const tok=nameTokens[ni];
      // Skip qualification codes in brackets like (G,Q)
      if(tok.startsWith("(")&&tok.includes(")")){ni++;continue;}
      if(tok.startsWith("(")&&ni+1<nameTokens.length&&nameTokens[ni+1].includes(")")){ni+=2;continue;}
      // Initial pattern: single letter + dot e.g. "C."
      if(tok.length===2&&tok[1]==="."&&ni+1<nameTokens.length){
        const surname=nameTokens[ni+1];
        if(!surname.startsWith("(")){
          const formatted=tok+" "+surname[0]+surname.slice(1).toLowerCase();
          crewNames.push(formatted);
          ni+=2;continue;
        }
      }
      ni++;
    }
    if(crewNames.length>0)crewBriefing[crewKey]=crewNames;
  }

  return{flights,agenda,crewName,empId,crewRole,totalBLH,flightBLH,
    rgdCount,phoCount,groundPaidHours,rosterMonth,rosterYear,crewBriefing};
}

// ─── Crew manifest ────────────────────────────────────────────────
// Crew names come from the CREW BRIEFING SHEET (separate PDF, not the individual roster).
// The individual roster PDF only contains your own duties.
// Format when available: [Date][FlightNo] [CAP] [FO] [CC1] [CC2]...
// Position order is fixed: pos1=Captain, pos2=FO, remaining=CC
// If Captain is missing from source, we must NOT shift names — mark TBC to preserve order.

// Parse a crew briefing line like:
// "13APR26 JQ115 C. WESTALL J. MATTHEWS T. LIM W. PIENAAR T. STERLING"
function parseCrewLine(line) {
  const m = line.match(/^(\d{2}[A-Z]{3}\d{2})\s+(JQ\d{2,4})\s+(.+)/);
  if (!m) return null;
  const names = m[3].trim().split(/\s{2,}|	/).map(s => s.trim()).filter(Boolean);
  // If names are space-separated initials+surname like "C. WESTALL J. MATTHEWS"
  // join pairs: "C." + "WESTALL" → "C. Westall"
  const parsed = [];
  const tokens = m[3].trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    if (/^[A-Z]\.$/.test(tokens[i]) && i + 1 < tokens.length && /^[A-Z]+$/.test(tokens[i+1])) {
      // Initial + Surname pair
      const surname = tokens[i+1][0] + tokens[i+1].slice(1).toLowerCase();
      parsed.push(`${tokens[i]} ${surname}`);
      i += 2;
    } else {
      parsed.push(tokens[i][0] + tokens[i].slice(1).toLowerCase());
      i++;
    }
  }
  return { date: m[1], flightNo: m[2], names: parsed };
}

// Build crew manifest from parsed names
// Rule: names[0]=Captain, names[1]=FO, names[2+]=CC
// If a position is missing → show "TBC" so order never shifts
function buildManifest(flightNo, from, to, names, userRole, userName, empId) {
  const fmt = n => n || "TBC";
  const initials = n => n === "TBC" ? "?" :
    n.split(" ").map(w => w.replace(".","")[0]||"").join("").toUpperCase().slice(0,2);

  const cap = fmt(names[0]);
  const fo  = fmt(names[1]);
  const cc  = names.slice(2);

  return {
    flightNo, from, to,
    source: names.length > 0 ? "briefing" : "pending",
    flightdeck: [
      { role:"Captain",       name:cap, initials:initials(cap), known:cap!=="TBC" },
      { role:"First Officer", name:fo,  initials:initials(fo),  known:fo!=="TBC"  },
    ],
    cabin: [
      // Always show you first with your real name
      { role:userRole||"CM", name:userName||"You",
        initials:(userName||"Y").split(" ").map(w=>w[0]).join("").slice(0,2),
        base:"AKL", you:true, empId },
      // Then any other cabin crew from briefing
      ...cc.map(n => ({
        role:"CC", name:n, initials:initials(n), base:"AKL", you:false
      })),
    ],
  };
}

// App-level crew briefing store (keyed by flightNo)
// Populated from briefing PDF import or manual entry
// Real crew data parsed from rostertest.pdf "Crew onboard" section
// Rule: pos1=Captain, pos2=FO, pos3+=CC. Order never shifts even if names missing.
// Dates used as keys where same flightNo appears multiple times in month
const CREW_BRIEFING = {
  // 13 APR
  "JQ115_13APR": ["C. Westall","J. Matthews","T. Lim","W. Pienaar","T. Sterling"],
  "JQ114_12APR": ["C. Westall","J. Matthews","W. Pienaar","T. Sterling","T. Lim"],
  // 14 APR  (qualifications like G,Q stripped — not relevant to crew display)
  "JQ134_14APR": ["R. Olliff","M. Kenyon","T. Sterling","I. Taurua"],
  "JQ133_14APR": ["R. Olliff","M. Kenyon","T. Sterling","I. Taurua"],
  // 15 APR
  "JQ243_15APR": ["G. Macdonald","J. Denton","T. Sterling","E. Cave"],
  "JQ244_15APR": ["G. Macdonald","J. Denton","T. Sterling","E. Cave"],
  // 18 APR (different crew from 13 APR JQ115)
  "JQ115_18APR": ["A. Carson-Holloway","C. Phillips","K. Mabait","B. Kharnchanarom","W. Pienaar"],
  "JQ114_17APR": ["A. Carson-Holloway","C. Phillips","K. Mabait","W. Pienaar","B. Kharnchanarom"],
  // 19-20 APR BNE trip
  "JQ154_19APR": ["J. Smith","G. Nicholson","J. Madsen","H. Fifita","S. Fernando"],
  "JQ151_20APR": ["J. Thompson","A. Bagnall","J. Madsen","H. Fifita","S. Fernando"],
  // 27 APR ZQN
  "JQ293_27APR": ["K. Stacey","J. Stead","F. Meehan","C. Garrett","Y. Fang"],
  "JQ298_27APR": ["K. Stacey","J. Stead","F. Meehan","C. Garrett","Y. Fang"],
  // 28 APR CHC
  "JQ243_28APR": ["G. Lieshout","M. Can","M. Ballantine","E. Cave","S. Peverley"],
  "JQ244_28APR": ["G. Lieshout","M. Can","M. Ballantine","S. Peverley","E. Cave"],
  // Demo today flights
  "JQ216":       ["C. Westall","J. Matthews","T. Lim","W. Pienaar"],
  "JQ217":       ["C. Westall","J. Matthews","T. Lim","W. Pienaar"],
};

// Hotel data from PDF
const HOTEL_INFO = {
  "JQ154_19APR": {
    name: "Voco Brisbane",
    city: "BNE",
    phone: "+61 7 3237 2300",
    checkIn:  "20:15",  // HTL starts after PCK 19:45-20:15
    checkOut: "22:10",  // HTL ends, PCK pickup 22:10
    pickup:   "22:10",  // PCK time next morning
    pickupTo: "22:40",
    nights:   "1 night",
    dates:    "19–20 Apr",
  },
};

// Look up crew by flightNo + date string like "Mon 13 Apr"
function lookupCrew(flightNo, dateStr) {
  // Parse day+month from dateStr e.g. "Mon 13 Apr" → "13APR"
  const mths = {Jan:"JAN",Feb:"FEB",Mar:"MAR",Apr:"APR",May:"MAY",Jun:"JUN",
                Jul:"JUL",Aug:"AUG",Sep:"SEP",Oct:"OCT",Nov:"NOV",Dec:"DEC"};
  const m = dateStr.match(/\w+ (\d+) (\w+)/);
  if (m) {
    const day = m[1].padStart(2,"0");
    const mon = mths[m[2]]||m[2].toUpperCase();
    const key = `${flightNo}_${day}${mon}`;
    if (CREW_BRIEFING[key]) return CREW_BRIEFING[key];
  }
  // Fallback to flight-only key (for demo/today flights)
  return CREW_BRIEFING[flightNo] || null;
}

// Look up hotel for a flight+date
function lookupHotel(flightNo, dateStr) {
  const mths = {Jan:"JAN",Feb:"FEB",Mar:"MAR",Apr:"APR",May:"MAY",Jun:"JUN",
                Jul:"JUL",Aug:"AUG",Sep:"SEP",Oct:"OCT",Nov:"NOV",Dec:"DEC"};
  const m = dateStr.match(/\w+ (\d+) (\w+)/);
  if (m) {
    const day = m[1].padStart(2,"0");
    const mon = mths[m[2]]||m[2].toUpperCase();
    return HOTEL_INFO[`${flightNo}_${day}${mon}`] || null;
  }
  return null;
}

function getCrewForFlight(flightNo, from, to, userRole, userName, empId, dateStr) {
  const names = lookupCrew(flightNo, dateStr||"") || [];
  return buildManifest(flightNo, from, to, names, userRole, userName, empId);
}

function getCrewForFlightFromBriefing(flightNo, from, to, userRole, userName, empId, dateStr, briefing) {
  // Look up from provided briefing (imported PDF data takes priority)
  const mths = {Jan:"JAN",Feb:"FEB",Mar:"MAR",Apr:"APR",May:"MAY",Jun:"JUN",
                Jul:"JUL",Aug:"AUG",Sep:"SEP",Oct:"OCT",Nov:"NOV",Dec:"DEC"};
  let names = null;
  if(dateStr){
    const m = dateStr.match(/\w+ (\d+) (\w+)/);
    if(m){
      const day=m[1].padStart(2,"0");
      const mon=mths[m[2]]||m[2].toUpperCase();
      const key=flightNo+"_"+day+mon;
      if(briefing[key])names=briefing[key];
    }
  }
  // Fall back to flight-only key
  if(!names&&briefing[flightNo])names=briefing[flightNo];
  return buildManifest(flightNo, from, to, names||[], userRole, userName, empId);
}

// ─── REAL live aircraft data from PlaneMapper (fetched 5 Apr 2026) ─
// Source: planemapper.com/aircrafts/VH-VFH
const AIRCRAFT_PROFILE={
  rego:"VH-VFH", type:"Airbus A320-232", msn:"5211", built:"2012", age:"14 years",
  operator:"the airline", modeS:"7C6B0B",
  engines:"2 × CFM56-5B4 (120.1 kN each)",
  mtow:"77,000 kg",          // corrected from PlaneMapper live data
  length:"37.57 m", wingspan:"34.09 m", height:"11.76 m",
  maxSpeed:"904 km/h", range:"5,700 km",
  seats:"180",
  // REAL flights from PlaneMapper today (5 Apr 2026) — live data
  todayHistory:[
    {flight:"JQ472",from:"MEL",to:"NTL",dep:"07:30",arr:"09:00",status:"Landed",  progress:100},
    {flight:"JQ471",from:"NTL",to:"MEL",dep:"09:35",arr:"11:15",status:"Landed",  progress:100},
    {flight:"JQ534",from:"MEL",to:"SYD",dep:"12:05",arr:"13:30",status:"Landed",  progress:100},
    {flight:"JQ535",from:"SYD",to:"MEL",dep:"14:15",arr:"15:50",status:"Landed",  progress:100},
    {flight:"JQ476",from:"MEL",to:"NTL",dep:"16:40",arr:"18:15",status:"Landed",  progress:100},
  ],
  source:"planemapper.com · ADS-B live data · 5 Apr 2026",
};

// ─── Demo flight data ─────────────────────────────────────────────
const DEMO_FLIGHTS={
  JQ216:{flightNo:"JQ216",from:"AKL",to:"MEL",schedDep:"20:40",schedArr:"22:45",
    estDep:"20:40",estArr:"22:45",status:"On Time",statusColor:C.green,
    terminal_dep:"I",gate_dep:"1",terminal_arr:"2",gate_arr:"12",
    aircraft:"Airbus A320-232",rego:"VH-VFH",distance:"2,638 km",duration:"4h 05m",
    signOn:"19:40",signOff:"23:15",otpScore:"4.9",otpPct:"59%",avgDelay:"28 min"},
  JQ217:{flightNo:"JQ217",from:"MEL",to:"AKL",schedDep:"22:55",schedArr:"05:30",
    estDep:"22:55",estArr:"05:30",status:"On Time",statusColor:C.green,
    terminal_dep:"2",gate_dep:"12",terminal_arr:"I",gate_arr:"–",
    aircraft:"Airbus A320-232",rego:"VH-VFH",distance:"2,637 km",duration:"3h 35m",
    signOn:null,signOff:"06:05",otpScore:"4.7",otpPct:"50%",avgDelay:"40 min"},
};

// ─── Live flight data via adsb.lol (free, CORS-enabled, no API key) ──
// JQ IATA → JST ICAO callsign mapping
// IATA → ICAO callsign mapping for ADS-B tracking
// JQ (Jetstar) = JST, QF (Qantas) = QFA, VA (Virgin) = VOZ, NZ (Air NZ) = ANZ
const AIRLINE_ICAO = {
  "JQ":"JST", "QF":"QFA", "VA":"VOZ", "NZ":"ANZ", "ZL":"RXA",
  "TT":"TGW", "FD":"AIQ", "D7":"XAX", "3K":"JSA",
};
const toICAO = fno => {
  const m = fno.match(/^([A-Z0-9]{2})(\d+)/);
  if(!m) return fno;
  const icao = AIRLINE_ICAO[m[1]] || m[1];
  return icao + m[2];
};

async function fetchWithTimeout(url, ms=6000){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),ms);
  try{
    const r=await fetch(url,{signal:ctrl.signal,
      headers:{"Accept":"application/json"}});
    clearTimeout(id);
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){clearTimeout(id);throw e;}
}

// Parse one ADS-B aircraft record into a clean object
function parseADSBRecord(ac, rego){
  if(!ac)return null;
  const onGround=ac.alt_baro==="ground"||ac.on_ground===true||ac.ground===true;
  // Calculate ETA if airborne and we have speed/distance data
  const lat=ac.lat,lon=ac.lon;
  const altFt=onGround?0:Math.round((typeof ac.alt_baro==="number"?ac.alt_baro:0)*1);
  const speedKts=Math.round(ac.gs||0);
  return{
    rego:     rego||ac.r||"",
    hex:      ac.hex||"",
    callsign: (ac.flight||ac.callsign||"").trim(),
    lat:      ac.lat,
    lon:      ac.lon,
    altFt:    onGround?0:parseInt(ac.alt_baro)||0,
    speedKts: parseInt(ac.gs)||0,
    track:    parseInt(ac.track)||0,
    squawk:   ac.squawk||"",
    status:   onGround?"On Ground":"Airborne",
    fetchedAt:new Date().toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"})
  };
}

// Fetch live data for a flight by callsign (primary method)
async function fetchFlightData(flightNo){
  const icao=toICAO(flightNo);
  // Try multiple endpoints in order
  const endpoints=[
    `https://api.adsb.lol/v2/callsign/${icao}`,
    `https://opensky-network.org/api/states/all?callsign=${icao}%20`,
  ];
  for(const url of endpoints){
    try{
      const data=await fetchWithTimeout(url);
      // adsb.lol format
      if(data?.ac?.length>0){
        const ac=data.ac[0];
        const parsed=parseADSBRecord(ac,ac.r);
        // Merge with roster times for display
        const demo=DEMO_FLIGHTS[flightNo];
        return{
          ...(demo||{}),
          ...parsed,
          flightNo,
          status:parsed.status,
          statusColor:parsed.status==="Airborne"?C.green:C.amber,
          fetchedAt:parsed.fetchedAt,
          liveOk:true,
        };
      }
      // OpenSky format
      if(data?.states?.length>0){
        const s=data.states[0];
        const onGround=s[8];
        return{
          ...(DEMO_FLIGHTS[flightNo]||{}),
          flightNo,
          rego:s[0]?.trim()||"",
          lat:s[6],lon:s[5],
          altFt:onGround?0:Math.round((s[7]||0)*3.281),
          speedKts:Math.round((s[9]||0)*1.944),
          track:Math.round(s[10]||0),
          status:onGround?"On Ground":"Airborne",
          statusColor:onGround?C.amber:C.green,
          fetchedAt:new Date().toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}),
          liveOk:true,
        };
      }
    }catch(e){ /* try next */ }
  }
  // Graceful fallback — always return something so cards display roster info
  const demo=DEMO_FLIGHTS[flightNo];
  return{
    ...(demo||{}),
    flightNo,
    liveOk:false,
    status:"Scheduled",
    statusColor:C.soft,
    fetchedAt:null,
    rego:demo?.rego||null,
  };
}

// Fetch live aircraft data + today's history by registration
async function fetchAircraftByRego(rego){
  if(!rego)return null;
  const clean=rego.replace(/-/g,"").toUpperCase();
  try{
    const data=await fetchWithTimeout(`https://api.adsb.lol/v2/registration/${clean}`);
    if(data?.ac?.length>0){
      const ac=data.ac[0];
      const parsed=parseADSBRecord(ac,rego);
      // Also fetch today's history via hex
      let history=[];
      if(ac.hex){
        try{
          const hist=await fetchWithTimeout(`https://api.adsb.lol/v2/icao/${ac.hex}/recent`,5000);
          if(hist?.ac?.length>0){
            history=hist.ac.map(h=>({
              flight:(h.flight||"").trim(),
              from:h.orig||"",
              to:h.dest||"",
              dep:h.firstSeen?new Date(h.firstSeen*1000)
                .toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}):"",
              arr:h.lastSeen?new Date(h.lastSeen*1000)
                .toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}):"",
              status:"Landed",progress:100,
            })).filter(h=>h.flight).slice(-6);
          }
        }catch(e){}
      }
      return{...parsed,hex:ac.hex,history,historyDate:"Today · ADS-B live"};
    }
  }catch(e){}
  return null;
}

// ─── Pay calculation including RGD/PHO ────────────────────────────
// RGD = 7.5h paid, PHO = 7.5h paid, flight = actual block hours
// From PDF: 6 RGD + 2 PHO = 8 days × 7.5h = 60h ground pay
// BLH = 39:45 = 39.75h flight
// Total paid = 99.75h ≈ CDUTY 99:05 ✓
const GROUND_PAY_CODES=new Set(["RGD","PHO"]);
const GROUND_PAY_HOURS=7.5;

// Count paid duties from demo agenda
function calcPaidHours(flightBLH, agenda){
  let groundH=0;
  Object.values(agenda).forEach(items=>{
    items.forEach(item=>{
      if(item.type==="duty"&&GROUND_PAY_CODES.has(item.code))groundH+=GROUND_PAY_HOURS;
    });
  });
  return (flightBLH||0)+groundH;
}

// ─── Demo data ────────────────────────────────────────────────────
const DEMO_AGENDA={
  [TODAY]: [
    {type:"flight",flightNo:"JQ216",from:"AKL",to:"MEL",dep:"20:40",arr:"22:45",
     signOn:"19:40",signOff:"23:15",color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ217",from:"MEL",to:"AKL",dep:"22:55",arr:"05:30",
     signOn:null,signOff:"06:05",color:C.amber,overnight:true},
  ],
  [TOMORROW]:[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Wed 1 Apr":[{type:"duty",code:"RGD",color:C.blue,  paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Thu 2 Apr":[{type:"duty",code:"RGD",color:C.blue,  paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Fri 3 Apr":[{type:"duty",code:"PHO",color:C.purple,paidHours:7.5,signOn:null,  signOff:null}],
  "Sat 4 Apr":[{type:"duty",code:"STR",color:C.amber, paidHours:0,  signOn:null,  signOff:null}],
  "Mon 6 Apr":[{type:"duty",code:"PHO",color:C.purple,paidHours:7.5,signOn:null,  signOff:null}],
  "Tue 7 Apr":[{type:"duty",code:"RGD",color:C.blue,  paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Wed 8 Apr":[{type:"duty",code:"RGD",color:C.blue,  paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Thu 9 Apr":[{type:"duty",code:"RGD",color:C.blue,  paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Fri 10 Apr":[{type:"duty",code:"RGD",color:C.blue, paidHours:7.5,signOn:"10:00",signOff:"17:05"}],
  "Sat 11 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Sun 12 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Mon 13 Apr":[
    {type:"flight",flightNo:"JQ115",from:"AKL",to:"RAR",dep:"13:55",arr:"21:05",signOn:"13:25",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ114",from:"RAR",to:"AKL",dep:"22:05",arr:"01:10",signOn:null,  signOff:"01:40",color:C.amber,overnight:true},
  ],
  "Tue 14 Apr":[
    {type:"flight",flightNo:"JQ134",from:"AKL",to:"OOL",dep:"15:25",arr:"18:15",signOn:"14:55",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ133",from:"OOL",to:"AKL",dep:"19:20",arr:"00:50",signOn:null,  signOff:"01:20",color:C.amber,overnight:true},
  ],
  "Wed 15 Apr":[
    {type:"flight",flightNo:"JQ243",from:"AKL",to:"CHC",dep:"14:35",arr:"15:20",signOn:"14:05",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ244",from:"CHC",to:"AKL",dep:"17:20",arr:"18:45",signOn:null,  signOff:"19:15",color:C.green,overnight:false},
  ],
  "Thu 16 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Fri 17 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Sat 18 Apr":[
    {type:"flight",flightNo:"JQ115",from:"AKL",to:"RAR",dep:"13:55",arr:"21:05",signOn:"13:25",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ114",from:"RAR",to:"AKL",dep:"22:05",arr:"01:10",signOn:null,  signOff:"01:40",color:C.amber,overnight:true},
  ],
  "Sun 19 Apr":[
    {type:"flight",flightNo:"JQ154",from:"AKL",to:"BNE",dep:"16:10",arr:"19:15",signOn:"15:40",signOff:"19:45",color:C.green,overnight:false},
  ],
  "Mon 20 Apr":[
    {type:"flight",flightNo:"JQ151",from:"BNE",to:"AKL",dep:"22:40",arr:"05:05",signOn:"22:10",signOff:"05:35",color:C.amber,overnight:true},
  ],
  "Tue 21 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Wed 22 Apr":[{type:"duty",code:"AVL",color:"#34D399",paidHours:0,signOn:"03:00",signOff:"15:00"}],
  "Thu 23 Apr":[{type:"duty",code:"STR",color:C.amber, paidHours:0,signOn:null,signOff:null}],
  "Fri 24 Apr":[{type:"duty",code:"AVL",color:"#34D399",paidHours:0,signOn:"03:00",signOff:"15:00"}],
  "Sat 25 Apr":[{type:"duty",code:"AVL",color:"#34D399",paidHours:0,signOn:"17:00",signOff:"20:40"}],
  "Sun 26 Apr":[{type:"duty",code:"AVL",color:"#34D399",paidHours:0,signOn:"11:40",signOff:"21:40"}],
  "Mon 27 Apr":[
    {type:"flight",flightNo:"JQ293",from:"AKL",to:"ZQN",dep:"14:15",arr:"15:00",signOn:"13:45",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ298",from:"ZQN",to:"AKL",dep:"17:30",arr:"19:20",signOn:null,  signOff:"19:50",color:C.green,overnight:false},
  ],
  "Tue 28 Apr":[
    {type:"flight",flightNo:"JQ243",from:"AKL",to:"CHC",dep:"14:35",arr:"15:20",signOn:"14:05",signOff:null,  color:C.green,overnight:false},
    {type:"flight",flightNo:"JQ244",from:"CHC",to:"AKL",dep:"17:20",arr:"18:45",signOn:null,  signOff:"19:15",color:C.green,overnight:false},
  ],
  "Wed 29 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
  "Thu 30 Apr":[{type:"duty",code:"OFF",color:C.muted,paidHours:0,signOn:null,signOff:null}],
};

// RGD: 6 days, PHO: 2 days → 60h ground pay. Flight BLH: 39.75h. Total: 99.75h
const DEMO_FLIGHT_BLH = 39.75;
const DEMO_TOTAL_BLH  = calcPaidHours(DEMO_FLIGHT_BLH, DEMO_AGENDA);

const DEMO_ROSTER=[
  {id:0, date:TODAY,      flightNo:"JQ216",from:"AKL",to:"MEL",dep:"20:40",arr:"22:45",signOff:"23:15",aircraft:"A320",dutyHours:3.08,role:"CM",gate:"1", rego:"VH-VFH",overnight:false,statusColor:C.green,status:"On Time"},
  {id:1, date:TODAY,      flightNo:"JQ217",from:"MEL",to:"AKL",dep:"22:55",arr:"05:30",signOff:"06:05",aircraft:"A320",dutyHours:6.58,role:"CM",gate:"12",rego:"VH-VFH",overnight:true, statusColor:C.amber,status:"Multi-day"},
  {id:2, date:"Mon 13 Apr",flightNo:"JQ115",from:"AKL",to:"RAR",dep:"13:55",arr:"21:05",signOff:"21:35",aircraft:"A320",dutyHours:7.17,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:3, date:"Mon 13 Apr",flightNo:"JQ114",from:"RAR",to:"AKL",dep:"22:05",arr:"01:10",signOff:"01:40",aircraft:"A320",dutyHours:3.08,role:"CM",gate:"",rego:"",overnight:true, statusColor:C.amber,status:"Multi-day"},
  {id:4, date:"Tue 14 Apr",flightNo:"JQ134",from:"AKL",to:"OOL",dep:"15:25",arr:"18:15",signOff:null,   aircraft:"A320",dutyHours:2.83,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:5, date:"Tue 14 Apr",flightNo:"JQ133",from:"OOL",to:"AKL",dep:"19:20",arr:"00:50",signOff:"01:20",aircraft:"A320",dutyHours:5.50,role:"CM",gate:"",rego:"",overnight:true, statusColor:C.amber,status:"Multi-day"},
  {id:6, date:"Wed 15 Apr",flightNo:"JQ243",from:"AKL",to:"CHC",dep:"14:35",arr:"15:20",signOff:null,   aircraft:"A320",dutyHours:0.75,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:7, date:"Wed 15 Apr",flightNo:"JQ244",from:"CHC",to:"AKL",dep:"17:20",arr:"18:45",signOff:"19:15",aircraft:"A320",dutyHours:1.42,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:8, date:"Sat 18 Apr",flightNo:"JQ115",from:"AKL",to:"RAR",dep:"13:55",arr:"21:05",signOff:null,   aircraft:"A320",dutyHours:7.17,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:9, date:"Sat 18 Apr",flightNo:"JQ114",from:"RAR",to:"AKL",dep:"22:05",arr:"01:10",signOff:"01:40",aircraft:"A320",dutyHours:3.08,role:"CM",gate:"",rego:"",overnight:true, statusColor:C.amber,status:"Multi-day"},
  {id:10,date:"Sun 19 Apr",flightNo:"JQ154",from:"AKL",to:"BNE",dep:"16:10",arr:"19:15",signOff:"19:45",aircraft:"A320",dutyHours:3.08,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:11,date:"Mon 20 Apr",flightNo:"JQ151",from:"BNE",to:"AKL",dep:"22:40",arr:"05:05",signOff:"05:35",aircraft:"A320",dutyHours:6.42,role:"CM",gate:"",rego:"",overnight:true, statusColor:C.amber,status:"Multi-day"},
  {id:12,date:"Mon 27 Apr",flightNo:"JQ293",from:"AKL",to:"ZQN",dep:"14:15",arr:"15:00",signOff:null,   aircraft:"A320",dutyHours:0.75,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:13,date:"Mon 27 Apr",flightNo:"JQ298",from:"ZQN",to:"AKL",dep:"17:30",arr:"19:20",signOff:"19:50",aircraft:"A320",dutyHours:1.83,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:14,date:"Tue 28 Apr",flightNo:"JQ243",from:"AKL",to:"CHC",dep:"14:35",arr:"15:20",signOff:null,   aircraft:"A320",dutyHours:0.75,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
  {id:15,date:"Tue 28 Apr",flightNo:"JQ244",from:"CHC",to:"AKL",dep:"17:20",arr:"18:45",signOff:"19:15",aircraft:"A320",dutyHours:1.42,role:"CM",gate:"",rego:"",overnight:false,statusColor:C.green,status:"On Time"},
];

const DEFAULT_PAY  ={rate:68.50,sbRate:34.25,targetHours:80,targetPay:5000,airline:"",domestic:true,international:false};
const DEFAULT_BILLS=[
  {id:1,name:"Rent",    amount:1400,freq:"monthly"},
  {id:2,name:"Power",   amount:120, freq:"monthly"},
  {id:3,name:"Internet",amount:85,  freq:"monthly"},
  {id:4,name:"Phone",   amount:55,  freq:"monthly"},
];

const TABS=["ROSTER","TODAY","HOURS"];

// ═══════════════════════════════════════════════════════════════════
//  ONBOARDING
// ═══════════════════════════════════════════════════════════════════
function OnboardingScreen({onDone}){
  const [step,  setStep] = useState(0);   // 0=welcome 1=name 2=details
  const [nick,  setNick] = useState("");
  const [profile, setProfile] = useState({
    airline:"", rate:"", sbRate:"", domestic:true, international:false
  });
  const inputRef = useRef(null);
  useEffect(()=>{ if(step===1)setTimeout(()=>inputRef.current?.focus(),300); },[step]);

  const submitName = () => { if(nick.trim()) setStep(2); };
  const submitAll  = () => {
    const name = nick.trim()||"Crew";
    try{
      localStorage.setItem("crewmate_nick", name);
      localStorage.setItem("crewmate_pay", JSON.stringify({
        rate:      parseFloat(profile.rate)||68.50,
        sbRate:    parseFloat(profile.sbRate)||34.25,
        targetHours:80, targetPay:5000,
        airline:   profile.airline,
        domestic:  profile.domestic,
        international: profile.international,
      }));
    }catch(e){}
    onDone(name, {
      rate:      parseFloat(profile.rate)||68.50,
      sbRate:    parseFloat(profile.sbRate)||34.25,
      targetHours:80, targetPay:5000,
      airline:   profile.airline,
      domestic:  profile.domestic,
      international: profile.international,
    });
  };

  const glowStyle = (color,x,y,size=300) => ({
    position:"fixed", top:y, [x>0?"left":"right"]:Math.abs(x),
    width:size, height:size, pointerEvents:"none",
    background:`radial-gradient(circle,${color}22,transparent 70%)`,
  });

  return(
    <div style={{background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",
      fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      color:C.text,display:"flex",flexDirection:"column",
      justifyContent:"center",padding:"40px 32px",position:"relative",overflow:"hidden"}}>
      <style>{`@keyframes fadein{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}`}</style>
      <div style={glowStyle(C.accent,-80,-100)}/>
      <div style={glowStyle(C.blue,80,0,260)}/>

      {/* ── STEP 0: Welcome ── */}
      {step===0&&(
        <div style={{animation:"fadein .5s ease"}}>
          <div style={{fontSize:52,marginBottom:24}}>✈️</div>
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <span style={{
              fontFamily:"'Horizon','Arial Narrow',sans-serif",
              fontWeight:800,textTransform:"uppercase",letterSpacing:"1px",
              fontSize:"12px",transform:"scaleX(1.55)",transformOrigin:"center center",
              display:"inline-block",
              background:"linear-gradient(90deg,#FF6B35,#FFB347)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
            }}>CREWMATE</span>
          </div>
          <div style={{fontSize:32,fontWeight:900,letterSpacing:-1,lineHeight:1.2,marginBottom:16}}>
            Your crew life,<br/>simplified.
          </div>
          <div style={{fontSize:14,color:C.soft,lineHeight:1.7,marginBottom:40}}>
            Roster import · Live flight tracking<br/>Pay calculator · Crew manifest
          </div>
          <button onClick={()=>setStep(1)} style={{background:C.accent,border:"none",
            borderRadius:16,padding:"16px 0",width:"100%",color:"#fff",
            fontSize:16,fontWeight:700,cursor:"pointer",letterSpacing:.5}}>
            Get Started →
          </button>
          <div style={{marginTop:16,fontSize:11,color:C.muted,textAlign:"center"}}>For Cabin Crew</div>
        </div>
      )}

      {/* ── STEP 1: Name ── */}
      {step===1&&(
        <div style={{animation:"fadein .4s ease"}}>
          <div style={{fontSize:36,marginBottom:20}}>👋</div>
          <div style={{fontSize:26,fontWeight:800,letterSpacing:-.5,marginBottom:8}}>
            What should we<br/>call you?
          </div>
          <div style={{fontSize:14,color:C.soft,marginBottom:32}}>
            Enter your preferred name or nickname.<br/>You can change this later.
          </div>
          <input ref={inputRef} value={nick} onChange={e=>setNick(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&nick.trim()&&submitName()}
            placeholder="e.g. Raj, Mia, Danny…"
            style={{width:"100%",background:C.card,border:`2px solid ${nick.trim()?C.accent:C.border}`,
              borderRadius:14,padding:"16px 18px",color:C.text,fontSize:18,
              fontWeight:600,outline:"none",boxSizing:"border-box",
              transition:"border-color .2s",marginBottom:12}}/>
          <button onClick={submitName} disabled={!nick.trim()}
            style={{background:nick.trim()?C.accent:C.muted,border:"none",
              borderRadius:14,padding:"16px 0",width:"100%",color:"#fff",
              fontSize:15,fontWeight:700,cursor:nick.trim()?"pointer":"default",
              transition:"background .2s",letterSpacing:.5}}>
            Next →
          </button>
          <div style={{marginTop:20,display:"flex",justifyContent:"center",gap:8}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:i===1?20:6,height:6,borderRadius:3,
                background:i===1?C.accent:C.muted,transition:"all .2s"}}/>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Pay & Airline details ── */}
      {step===2&&(
        <div style={{animation:"fadein .4s ease"}}>
          {/* Horizon heading */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
            <span style={{
              fontFamily:"'Horizon','Arial Narrow',sans-serif",
              fontWeight:800,textTransform:"uppercase",letterSpacing:"1px",
              fontSize:"10px",transform:"scaleX(1.55)",transformOrigin:"center center",
              display:"inline-block",
              background:"linear-gradient(90deg,#FF6B35,#FFB347)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
            }}>SET UP YOUR PAY PROFILE</span>
          </div>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-.5,marginBottom:6}}>
            Almost there, {nick.trim()} ✈️
          </div>
          <div style={{fontSize:13,color:C.soft,marginBottom:28,lineHeight:1.6}}>
            This helps calculate your pay accurately.<br/>You can update these anytime in Settings.
          </div>

          {/* Airline */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:6}}>AIRLINE YOU WORK FOR</div>
            <input value={profile.airline}
              onChange={e=>setProfile(p=>({...p,airline:e.target.value}))}
              placeholder="e.g. Jetstar, Air New Zealand…"
              style={{width:"100%",background:C.card,border:`2px solid ${profile.airline?C.accent:C.border}`,
                borderRadius:12,padding:"13px 16px",color:C.text,fontSize:14,
                fontWeight:600,outline:"none",boxSizing:"border-box",transition:"border .2s"}}/>
          </div>

          {/* Rates */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[
              {k:"rate",    label:"Pay Rate / hr",          placeholder:"e.g. 68.50"},
              {k:"sbRate",  label:"Home Standby Rate / hr", placeholder:"e.g. 34.25"},
            ].map(({k,label,placeholder})=>(
              <div key={k}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:6}}>{label.toUpperCase()}</div>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:11,top:"50%",
                    transform:"translateY(-50%)",color:C.soft,fontSize:14,fontWeight:600}}>$</span>
                  <input type="number" step="0.01" value={profile[k]}
                    onChange={e=>setProfile(p=>({...p,[k]:e.target.value}))}
                    placeholder={placeholder}
                    style={{width:"100%",background:C.card,
                      border:`2px solid ${profile[k]?C.accent:C.border}`,
                      borderRadius:12,padding:"13px 12px 13px 24px",color:C.text,
                      fontSize:14,fontWeight:600,outline:"none",
                      boxSizing:"border-box",transition:"border .2s"}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Operations type */}
          <div style={{marginBottom:28}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:10}}>OPERATIONS TYPE</div>
            <div style={{display:"flex",gap:10}}>
              {[
                {k:"domestic",    label:"🛫 Domestic",     desc:"Within country"},
                {k:"international",label:"🌏 International",desc:"Cross-border"},
              ].map(({k,label,desc})=>{
                const active = profile[k];
                return(
                  <button key={k} onClick={()=>setProfile(p=>({...p,[k]:!p[k]}))}
                    style={{flex:1,background:active?`${C.accent}18`:C.card,
                      border:`2px solid ${active?C.accent:C.border}`,
                      borderRadius:14,padding:"14px 10px",cursor:"pointer",
                      textAlign:"center",transition:"all .15s"}}>
                    <div style={{fontSize:20,marginBottom:4}}>{label.split(" ")[0]}</div>
                    <div style={{fontSize:11,fontWeight:700,
                      color:active?C.accent:C.soft}}>{label.split(" ").slice(1).join(" ")}</div>
                    <div style={{fontSize:9,color:C.muted,marginTop:2}}>{desc}</div>
                    {active&&<div style={{fontSize:10,color:C.accent,marginTop:4,fontWeight:700}}>✓ Selected</div>}
                  </button>
                );
              })}
            </div>
            {!profile.domestic&&!profile.international&&(
              <div style={{fontSize:11,color:C.amber,marginTop:8,textAlign:"center"}}>
                Select at least one operation type
              </div>
            )}
          </div>

          <button onClick={submitAll}
            disabled={!profile.domestic&&!profile.international}
            style={{
              background:(profile.domestic||profile.international)?C.accent:C.muted,
              border:"none",borderRadius:14,padding:"16px 0",width:"100%",
              color:"#fff",fontSize:15,fontWeight:700,
              cursor:(profile.domestic||profile.international)?"pointer":"default",
              letterSpacing:.5,transition:"background .2s"}}>
            Let's fly, {nick.trim()} 🛫
          </button>
          <button onClick={()=>submitAll()}
            style={{background:"none",border:"none",width:"100%",marginTop:12,
              color:C.muted,fontSize:12,cursor:"pointer",padding:"8px 0"}}>
            Skip for now
          </button>
          <div style={{marginTop:16,display:"flex",justifyContent:"center",gap:8}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:i===2?20:6,height:6,borderRadius:3,
                background:i===2?C.accent:C.muted,transition:"all .2s"}}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  SETTINGS SHEET  (opens when name/header is tapped)
// ═══════════════════════════════════════════════════════════════════
const DESIGNATIONS = [
  { code:"CM", label:"Cabin Manager",     desc:"Lead cabin crew role" },
  { code:"CC", label:"Cabin Crew",        desc:"Customer Experience Advisor" },
  { code:"CP", label:"Captain",           desc:"Pilot in Command" },
  { code:"FO", label:"First Officer",     desc:"Co-pilot" },
];

// ═══════════════════════════════════════════════════════════════════
//  PROFILE PAGE  (used in both settings and onboarding step 2)
// ═══════════════════════════════════════════════════════════════════
function ProfilePage({crew, pay, roleEdit, setRoleEdit, roleColor, onSaveRole, onSavePay}){
  const [payDraft, setPayDraft] = useState({
    airline:      pay.airline||"",
    rate:         pay.rate||68.50,
    sbRate:       pay.sbRate||34.25,
    domestic:     pay.domestic!==undefined?pay.domestic:true,
    international:pay.international||false,
  });

  const saveAll = () => {
    onSaveRole(roleEdit);
    onSavePay(payDraft);
  };

  return(
    <div>
      <div style={{fontSize:13,color:C.soft,marginBottom:20,lineHeight:1.6}}>
        Update your designation and pay details. Changes reflect immediately across the app.
      </div>

      {/* Designation */}
      <div style={{
        fontFamily:"'Horizon','Arial Narrow',sans-serif",fontWeight:800,
        textTransform:"uppercase",letterSpacing:"1px",fontSize:"10px",
        transform:"scaleX(1.55)",transformOrigin:"center center",display:"inline-block",
        background:"linear-gradient(90deg,#FF6B35,#FFB347)",
        WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
        marginBottom:10,
      }}>Designation</div>
      <div style={{marginBottom:20}}>
        {DESIGNATIONS.map(d=>{
          const active=roleEdit===d.code;
          const dc={"CM":C.accent,"CC":C.blue,"CP":"#FFD700","FO":"#C0C0C0"}[d.code]||C.soft;
          return(
            <button key={d.code} onClick={()=>setRoleEdit(d.code)}
              style={{width:"100%",background:active?`${dc}18`:C.card2,
                border:`2px solid ${active?dc:C.border}`,
                borderRadius:14,padding:"12px 16px",marginBottom:8,cursor:"pointer",
                display:"flex",alignItems:"center",gap:14,textAlign:"left",transition:"all .15s"}}>
              <div style={{width:36,height:36,borderRadius:9,background:`${dc}22`,
                border:`1px solid ${dc}55`,display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:13,fontWeight:900,color:dc,flexShrink:0}}>
                {d.code}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:active?dc:C.text}}>{d.label}</div>
                <div style={{fontSize:10,color:C.soft,marginTop:1}}>{d.desc}</div>
              </div>
              {active&&<div style={{fontSize:14,color:dc}}>✓</div>}
            </button>
          );
        })}
      </div>

      {/* Airline */}
      <div style={{
        fontFamily:"'Horizon','Arial Narrow',sans-serif",fontWeight:800,
        textTransform:"uppercase",letterSpacing:"1px",fontSize:"10px",
        transform:"scaleX(1.55)",transformOrigin:"center center",display:"inline-block",
        background:"linear-gradient(90deg,#FF6B35,#FFB347)",
        WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
        marginBottom:10,
      }}>Airline</div>
      <div style={{marginBottom:20}}>
        <input value={payDraft.airline}
          onChange={e=>setPayDraft(p=>({...p,airline:e.target.value}))}
          placeholder="e.g. Jetstar, Air New Zealand…"
          style={{width:"100%",background:C.card2,
            border:`2px solid ${payDraft.airline?C.accent:C.border}`,
            borderRadius:12,padding:"13px 16px",color:C.text,fontSize:14,
            fontWeight:600,outline:"none",boxSizing:"border-box",transition:"border .2s"}}/>
      </div>

      {/* Pay rates */}
      <div style={{
        fontFamily:"'Horizon','Arial Narrow',sans-serif",fontWeight:800,
        textTransform:"uppercase",letterSpacing:"1px",fontSize:"10px",
        transform:"scaleX(1.55)",transformOrigin:"center center",display:"inline-block",
        background:"linear-gradient(90deg,#FF6B35,#FFB347)",
        WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
        marginBottom:10,
      }}>Pay Rates</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        {[
          {k:"rate",   label:"Pay Rate / hr",          icon:"💼"},
          {k:"sbRate", label:"Home Standby Rate / hr",  icon:"📲"},
        ].map(({k,label,icon})=>(
          <div key={k} style={{background:C.card2,borderRadius:12,padding:"12px 14px",
            border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1,marginBottom:6}}>
              {icon} {label.toUpperCase()}
            </div>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",
                transform:"translateY(-50%)",color:C.soft,fontSize:13}}>$</span>
              <input type="number" step="0.01" value={payDraft[k]}
                onChange={e=>setPayDraft(p=>({...p,[k]:parseFloat(e.target.value)||0}))}
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:9,padding:"9px 9px 9px 22px",color:C.text,
                  fontSize:15,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Operations type */}
      <div style={{
        fontFamily:"'Horizon','Arial Narrow',sans-serif",fontWeight:800,
        textTransform:"uppercase",letterSpacing:"1px",fontSize:"10px",
        transform:"scaleX(1.55)",transformOrigin:"center center",display:"inline-block",
        background:"linear-gradient(90deg,#FF6B35,#FFB347)",
        WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",
        marginBottom:10,
      }}>Operations</div>
      <div style={{display:"flex",gap:10,marginBottom:28}}>
        {[
          {k:"domestic",     label:"Domestic",     emoji:"🛫"},
          {k:"international",label:"International",emoji:"🌏"},
        ].map(({k,label,emoji})=>{
          const active=payDraft[k];
          return(
            <button key={k} onClick={()=>setPayDraft(p=>({...p,[k]:!p[k]}))}
              style={{flex:1,background:active?`${C.accent}18`:C.card2,
                border:`2px solid ${active?C.accent:C.border}`,
                borderRadius:14,padding:"14px 10px",cursor:"pointer",
                textAlign:"center",transition:"all .15s"}}>
              <div style={{fontSize:22,marginBottom:4}}>{emoji}</div>
              <div style={{fontSize:11,fontWeight:700,color:active?C.accent:C.soft}}>{label}</div>
              {active&&<div style={{fontSize:10,color:C.accent,marginTop:3,fontWeight:700}}>✓</div>}
            </button>
          );
        })}
      </div>

      <button onClick={saveAll}
        style={{width:"100%",background:roleColor||C.accent,border:"none",
          borderRadius:14,padding:"15px 0",color:"#fff",
          fontSize:14,fontWeight:700,cursor:"pointer"}}>
        Save Profile
      </button>
    </div>
  );
}


function SettingsSheet({crew, nick, pay, onClose, onSaveNick, onSaveRole, onSavePay}){
  const [page,     setPage]   = useState("menu");  // menu | nickname | profile | codes
  const [nickEdit, setNickEdit]= useState(nick||"");
  const [roleEdit, setRoleEdit]= useState(crew.role||"CM");
  const inputRef = useRef(null);
  useEffect(()=>{ if(page==="nickname")setTimeout(()=>inputRef.current?.focus(),300); },[page]);

  const roleColor = {"CM":C.accent,"CC":C.blue,"CP":"#FFD700","FO":"#C0C0C0"}[roleEdit]||C.soft;

  return(
    <div style={{position:"fixed",inset:0,background:"#000000E8",
      backdropFilter:"blur(16px)",zIndex:300,display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div className="cm-sheet" style={{background:C.card,borderRadius:"24px 24px 0 0",
        maxHeight:"88vh",overflowY:"auto",paddingBottom:48}}>
        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 4px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.muted}}/>
        </div>

        {/* Header */}
        <div style={{padding:"8px 24px 16px",borderBottom:`1px solid ${C.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {page!=="menu"&&(
              <button onClick={()=>setPage("menu")} style={{background:"none",border:"none",
                color:C.accent,fontSize:13,fontWeight:600,cursor:"pointer",padding:0}}>←</button>
            )}
            <div>
              <div style={{fontSize:10,color:C.soft,letterSpacing:2,marginBottom:2}}>CREWMATE</div>
              <div style={{fontSize:18,fontWeight:800}}>
                {page==="menu"?"Settings":page==="nickname"?"Edit Nickname":
                 page==="profile"?"My Profile":"Duty Codes"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,
            borderRadius:12,color:"#FF3B30",fontSize:18,width:40,height:40,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"20px 24px 0"}}>

          {/* ── MENU ── */}
          {page==="menu"&&(
            <div>
              {/* Profile preview */}
              <div style={{background:`linear-gradient(135deg,${C.accent}18,${C.blue}12)`,
                borderRadius:18,padding:"16px 20px",marginBottom:20,
                border:`1px solid ${C.accent}30`,
                display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:52,height:52,borderRadius:"50%",
                  background:`linear-gradient(135deg,${C.accent},${C.blue})`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:20,fontWeight:900,color:"#fff",flexShrink:0}}>
                  {(nick||"R")[0].toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:18,fontWeight:800}}>{nick}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                    <div style={{background:`${roleColor}20`,border:`1px solid ${roleColor}50`,
                      borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700,color:roleColor}}>
                      {crew.role}
                    </div>
                    <div style={{fontSize:11,color:C.soft}}>{crew.empId} · JQ</div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              {[
                {icon:"✏️", label:"Edit Nickname",  sub:"Change how the app addresses you",  page:"nickname"},
                {icon:"👤", label:"My Profile",      sub:"Update your designation and details",page:"profile"},
                {icon:"📋", label:"Duty Codes",      sub:"View all supported roster codes",   page:"codes"},
              {icon:"🔗", label:"Siri Shortcut",   sub:"Add one-tap roster update to iPhone",page:"siri"},
              {icon:"🔒", label:"Privacy & Security",sub:"How your data is stored and protected",page:"privacy"},
              ].map(item=>(
                <button key={item.page} onClick={()=>setPage(item.page)}
                  style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,
                    borderRadius:14,padding:"15px 16px",marginBottom:10,cursor:"pointer",
                    display:"flex",alignItems:"center",gap:14,textAlign:"left"}}>
                  <div style={{fontSize:22,width:36,height:36,borderRadius:10,
                    background:C.card,display:"flex",alignItems:"center",justifyContent:"center",
                    flexShrink:0}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>{item.label}</div>
                    <div style={{fontSize:11,color:C.soft,marginTop:2}}>{item.sub}</div>
                  </div>
                  <div style={{fontSize:16,color:C.muted}}>›</div>
                </button>
              ))}

              <div style={{marginTop:10,padding:"12px 0",textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted}}>CrewMate · NZ Cabin Crew</div>
                <div style={{fontSize:9,color:C.muted,marginTop:2}}>v0.5 · rostertest.pdf loaded</div>
              </div>
            </div>
          )}

          {/* ── EDIT NICKNAME ── */}
          {page==="nickname"&&(
            <div>
              <div style={{fontSize:13,color:C.soft,marginBottom:24,lineHeight:1.6}}>
                This is how the app greets you. It's stored locally on your device.
              </div>
              <input ref={inputRef} value={nickEdit}
                onChange={e=>setNickEdit(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&nickEdit.trim()&&onSaveNick(nickEdit.trim())}
                placeholder="Your nickname…"
                style={{width:"100%",background:C.card2,border:`2px solid ${nickEdit.trim()?C.accent:C.border}`,
                  borderRadius:14,padding:"16px 18px",color:C.text,fontSize:18,
                  fontWeight:600,outline:"none",boxSizing:"border-box",
                  transition:"border-color .2s",marginBottom:14}}/>
              <button onClick={()=>nickEdit.trim()&&onSaveNick(nickEdit.trim())}
                disabled={!nickEdit.trim()}
                style={{width:"100%",background:nickEdit.trim()?C.accent:C.muted,
                  border:"none",borderRadius:14,padding:"15px 0",
                  color:"#fff",fontSize:14,fontWeight:700,cursor:nickEdit.trim()?"pointer":"default",
                  transition:"background .2s"}}>
                Save Nickname
              </button>
            </div>
          )}

          {/* ── MY PROFILE ── */}
          {page==="profile"&&(
            <ProfilePage crew={crew} pay={pay} roleEdit={roleEdit} setRoleEdit={setRoleEdit}
              roleColor={roleColor} onSaveRole={onSaveRole} onSavePay={onSavePay}/>
          )}

          {/* ── SIRI SHORTCUT ── */}
          {page==="siri"&&(
            <div>
              <div style={{background:`${C.blue}12`,border:`1px solid ${C.blue}30`,
                borderRadius:14,padding:16,marginBottom:18}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>📱 How Siri Roster Update Works</div>
                <div style={{fontSize:12,color:C.soft,lineHeight:1.8}}>
                  The shortcut opens CWP in Safari, where you log in normally.
                  You then download your roster PDF and share it to CrewMate.
                  Your password is never stored by this app.
                </div>
              </div>

              <div style={{fontSize:10,color:C.muted,letterSpacing:2,marginBottom:12}}>SETUP STEPS</div>
              {[
                {n:"1",icon:"📲",title:"Install Shortcuts App",body:"Built into iOS. Open App Store and search 'Shortcuts' if missing."},
                {n:"2",icon:"🔗",title:"Create New Shortcut",body:'Tap + in Shortcuts app. Add action: "Open URL". Enter your CWP portal URL.'},
                {n:"3",icon:"🎤",title:"Add Siri Phrase",body:'Tap the shortcut name, choose "Add to Siri". Say something like "Update my roster".'},
                {n:"4",icon:"📄",title:"Download & Share",body:'In CWP, export your roster PDF. Tap Share → CrewMate. The app imports it instantly.'},
                {n:"5",icon:"✅",title:"Done",body:"Say 'Hey Siri, update my roster' anytime. Takes about 30 seconds."},
              ].map(s=>(
                <div key={s.n} style={{background:C.card2,borderRadius:13,padding:"13px 14px",
                  marginBottom:8,display:"flex",gap:12,border:`1px solid ${C.border}`}}>
                  <div style={{width:28,height:28,borderRadius:8,background:C.blue+"22",
                    border:`1px solid ${C.blue}40`,display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:13,flexShrink:0}}>{s.icon}</div>
                  <div>
                    <div style={{fontSize:9,color:C.blue,fontWeight:700,letterSpacing:1,marginBottom:2}}>STEP {s.n}</div>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{s.title}</div>
                    <div style={{fontSize:11,color:C.soft,lineHeight:1.5}}>{s.body}</div>
                  </div>
                </div>
              ))}

              <div style={{marginTop:12,background:`${C.amber}12`,border:`1px solid ${C.amber}30`,
                borderRadius:13,padding:14}}>
                <div style={{fontSize:12,fontWeight:700,color:C.amber,marginBottom:4}}>
                  ⚠️ Why no auto-login?
                </div>
                <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>
                  Auto-login requires storing your CWP password. Your CWP account
                  contains payslips, medical records, and employment data — not just
                  your roster. CrewMate never stores your password for your protection.
                  This mirrors how RosterBuster and Roster Buddy work.
                </div>
              </div>

              <div style={{marginTop:10,background:`${C.accent}12`,border:`1px solid ${C.accent}30`,
                borderRadius:13,padding:14}}>
                <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:4}}>
                  🚀 Native App Roadmap
                </div>
                <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>
                  The next version of CrewMate will be a native iOS app. It will
                  use an in-app browser (WebView) — you log in once, and the app
                  captures your session to auto-download rosters, just like RosterBuster.
                  Your password is never stored.
                </div>
              </div>
            </div>
          )}

          {/* ── PRIVACY ── */}
          {page==="privacy"&&(
            <div>
              <div style={{background:`${C.green}12`,border:`1px solid ${C.green}30`,
                borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:C.green}}>✅ What CrewMate stores</div>
                <div style={{fontSize:12,color:C.soft,lineHeight:1.8}}>
                  • Your nickname · device only
                  • Your role/designation · device only
                  • Last roster sync timestamp · device only
                  • Pay settings and bills · device only
                </div>
              </div>

              <div style={{background:`${C.red}10`,border:`1px solid ${C.red}30`,
                borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:C.red}}>🚫 What CrewMate never stores</div>
                <div style={{fontSize:12,color:C.soft,lineHeight:1.8}}>
                  • Your CWP username or password
                  • Your employee ID beyond display use
                  • Your roster data on any server
                  • Any data transmitted to third parties
                </div>
              </div>

              <div style={{background:C.card2,border:`1px solid ${C.border}`,
                borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📋 Data Use Agreement</div>
                {[
                  "All data entered into CrewMate remains on your personal device only.",
                  "Roster PDFs are processed locally in your browser — no data leaves your device.",
                  "CrewMate does not transmit, sell, or share any personal or operational data.",
                  "Live flight data is fetched from public ADS-B sources (PlaneMapper, FlightStats) and contains no personal information.",
                  "You may clear all stored data at any time by clearing your browser/app storage.",
                  "CrewMate is an independent tool and is not affiliated with, endorsed by, or connected to the airline or Qantas Group.",
                ].map((t,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
                    <div style={{color:C.green,fontWeight:700,flexShrink:0}}>✓</div>
                    <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>{t}</div>
                  </div>
                ))}
              </div>

              <div style={{background:`${C.amber}10`,border:`1px solid ${C.amber}30`,
                borderRadius:14,padding:14}}>
                <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>
                  <strong style={{color:C.amber}}>Security note:</strong> Always download
                  your roster PDF directly from the official CWP portal
                  (your CWP portal). Never share your roster PDF with
                  unknown apps or services — it contains your personal
                  employment schedule.
                </div>
              </div>
            </div>
          )}

          {/* ── DUTY CODES ── */}
          {page==="codes"&&(
            <div>
              <div style={{fontSize:12,color:C.soft,marginBottom:16,lineHeight:1.5}}>
                All codes the app recognises from imported roster PDFs. Unknown codes display as-is.
              </div>
              {Object.entries(DUTY_META).filter(([k])=>k!=="FLT").map(([code,meta])=>(
                <div key={code} style={{display:"flex",alignItems:"center",gap:12,
                  padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                  <div style={{width:8,height:8,borderRadius:"50%",
                    background:meta.color,flexShrink:0}}/>
                  <div style={{minWidth:40}}>
                    <span style={{fontSize:12,fontWeight:800,color:meta.color}}>{code}</span>
                  </div>
                  <div style={{flex:1}}>
                    <span style={{fontSize:12,color:C.soft}}>{meta.label}</span>
                    {meta.paidHours&&<span style={{fontSize:10,color:C.muted}}> · {meta.paidHours}h paid</span>}
                  </div>
                  <div style={{fontSize:14}}>{meta.icon}</div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  iCAL CALENDAR EXPORT  — exports roster as .ics for iCloud/Apple Calendar
//  Creates a "Roster✈️" calendar with emoji-rich event titles
// ═══════════════════════════════════════════════════════════════════
function generateICS(roster, agenda, crewName, rosterMonth, rosterYear){
  const pad=n=>String(n).padStart(2,"0");
  const MONTH_NUM={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};

  // Convert "Mon 13 Apr" + "HH:MM" to iCal datetime string
  function toICalDT(dateStr, timeStr, offsetDays=0){
    const m=dateStr.match(/\w+ (\d+) (\w+)/);
    if(!m) return null;
    let day=parseInt(m[1])+offsetDays;
    let month=MONTH_NUM[m[2]]||4;
    let year=rosterYear||2026;
    // Handle month overflow
    if(day>31){day-=31;month+=1;}
    if(day>30&&[4,6,9,11].includes(month)){day-=30;month+=1;}
    if(month>12){month=1;year+=1;}
    const [h,mi]=(timeStr||"00:00").split(":").map(Number);
    return `${year}${pad(month)}${pad(day)}T${pad(h)}${pad(mi)}00`;
  }

  // Duty code emoji map
  const DUTY_EMOJI={
    RGD:"🏢",PHO:"🎉",OFF:"😴",STR:"⭐",AVL:"📲",LVE:"🌴",
    SBY:"⏳",STB:"✈️",UFD:"🤒",FTG:"😴",MAT:"👶",SIM:"🎮",TRN:"📚"
  };

  const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
  const now=new Date();
  const stamp=`${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const events=[];

  // ── Flight events ────────────────────────────────────────────
  // Group flights by date to create one duty-period event per day
  const byDate={};
  for(const f of roster){
    if(!byDate[f.date])byDate[f.date]=[];
    byDate[f.date].push(f);
  }

  for(const [dateStr, flights] of Object.entries(byDate)){
    const first=flights[0];
    const last=flights[flights.length-1];
    const signOn=first.dep;
    const signOff=last.signOff||last.arr;
    const isOvernight=flights.some(f=>f.overnight);

    // Build sector string: ✈️ AKL→RAR → AKL
    const route=flights.map((f,i)=>
      i===0?`${f.from}→${f.to}`:f.to
    ).join("→");

    const flightNums=flights.map(f=>f.flightNo).join(" + ");
    const title=`✈️ ${flightNums} ${route}`;

    const dtStart=toICalDT(dateStr,signOn);
    const endDay=isOvernight?dateStr:dateStr;
    const endOffset=isOvernight?1:0;
    const dtEnd=toICalDT(dateStr,signOff,endOffset);

    if(!dtStart||!dtEnd)continue;

    const desc=`Duty: ${signOn} → ${signOff}${isOvernight?" +1":""}\nSectors: ${flights.map(f=>`${f.flightNo} ${f.from}→${f.to} dep:${f.dep} arr:${f.arr||"cont."}`).join("\n")}\n\nCrewMate ✈️`;

    events.push([
      "BEGIN:VEVENT",
      `UID:crewmate-${uid()}@crewmate`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Pacific/Auckland:${dtStart}`,
      `DTEND;TZID=Pacific/Auckland:${dtEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc.replace(/\n/g,"\\n")}`,
      `CATEGORIES:CrewMate✈️`,
      `COLOR:ORANGE`,
      "END:VEVENT"
    ].join("\r\n"));
  }

  // ── Duty day events (RGD, PHO, AVL etc) ─────────────────────
  if(agenda){
    for(const [dateStr, items] of Object.entries(agenda)){
      for(const item of items){
        if(item.type!=="duty")continue;
        const code=item.code;
        const emoji=DUTY_EMOJI[code]||"📋";
        const meta={
          RGD:"Restricted Ground Duties",PHO:"Public Holiday Off",
          OFF:"Day Off",STR:"Star Day",AVL:"Home Available Reserve",
          LVE:"Annual Leave",SBY:"Standby",STB:"Flight Deck Standby",
          UFD:"Unfit for Duties",FTG:"Fatigue Claim",MAT:"Maternity Leave",
          SIM:"Simulator",TRN:"Training"
        }[code]||code;

        const title=`${emoji} ${meta}`;
        const isAllDay=code==="OFF"||code==="STR"||code==="LVE"||
                        code==="PHO"||code==="MAT"||code==="UFD"||code==="FTG";

        let eventLines;
        if(isAllDay){
          const m=dateStr.match(/\w+ (\d+) (\w+)/);
          if(!m)continue;
          const day=m[1].padStart(2,"0");
          const month=String(MONTH_NUM[m[2]]||4).padStart(2,"0");
          const yr=rosterYear||2026;
          // iCal all-day: DTSTART;VALUE=DATE and DTEND is next day
          let nextDay=parseInt(m[1])+1;
          eventLines=[
            "BEGIN:VEVENT",
            `UID:crewmate-${uid()}@crewmate`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${yr}${month}${day}`,
            `DTEND;VALUE=DATE:${yr}${month}${String(nextDay).padStart(2,"0")}`,
            `SUMMARY:${title}`,
            `CATEGORIES:CrewMate✈️`,
            "END:VEVENT"
          ];
        } else {
          const dtS=toICalDT(dateStr,item.signOn||"00:00");
          const dtE=toICalDT(dateStr,item.signOff||"23:59");
          if(!dtS||!dtE)continue;
          eventLines=[
            "BEGIN:VEVENT",
            `UID:crewmate-${uid()}@crewmate`,
            `DTSTAMP:${stamp}`,
            `DTSTART;TZID=Pacific/Auckland:${dtS}`,
            `DTEND;TZID=Pacific/Auckland:${dtE}`,
            `SUMMARY:${title}`,
            `CATEGORIES:CrewMate✈️`,
            "END:VEVENT"
          ];
        }
        events.push(eventLines.join("\r\n"));
      }
    }
  }

  if(events.length===0)return null;

  const calName=`Roster✈️`;
  const ics=[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrewMate//NZ Cabin Crew Roster//EN",
    `X-WR-CALNAME:${calName}`,
    "X-WR-TIMEZONE:Pacific/Auckland",
    "X-APPLE-CALENDAR-COLOR:#FF6B35",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");

  return ics;
}

function downloadICS(roster, agenda, crewName, rosterMonth, rosterYear){
  const ics=generateICS(roster,agenda,crewName,rosterMonth,rosterYear);
  if(!ics){alert("No roster data to export. Please import your roster first.");return;}
  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`crewmate-roster-${rosterMonth||"apr"}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// Inject global iOS-style animation keyframes
function useGlobalStyles(){
  useEffect(()=>{
    if(document.getElementById('crewmate-styles'))return;
    const s=document.createElement('style');
    s.id='crewmate-styles';
    s.textContent=`
      @keyframes cm-slide-left{from{opacity:0;transform:translateX(44px)}to{opacity:1;transform:translateX(0)}}
      @keyframes cm-slide-right{from{opacity:0;transform:translateX(-44px)}to{opacity:1;transform:translateX(0)}}
      @keyframes cm-slide-up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
      @keyframes cm-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
      .cm-tab-left{animation:cm-slide-left .22s cubic-bezier(.25,.46,.45,.94) both}
      .cm-tab-right{animation:cm-slide-right .22s cubic-bezier(.25,.46,.45,.94) both}
      .cm-slide-up{animation:cm-slide-up .25s cubic-bezier(.25,.46,.45,.94) both}
      .cm-sheet{animation:cm-sheet-up .3s cubic-bezier(.25,.46,.45,.94) both}
      .cm-btn{transition:transform .12s ease,opacity .12s ease;-webkit-tap-highlight-color:transparent;cursor:pointer}
      .cm-btn:active{transform:scale(.93);opacity:.75}
      .cm-card{transition:transform .12s ease,box-shadow .12s ease}
      .cm-card:active{transform:scale(.98)}
      @keyframes cm-blink{0%,100%{opacity:1}50%{opacity:.4}}
      .cm-current-sector{animation:cm-blink 2s ease-in-out infinite}
      @import url('https://fonts.cdnfonts.com/css/horizon');
      .horizon-date{
        font-family:'Horizon','Barlow Condensed','Arial Narrow',sans-serif;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:1px;
        font-size:10px;
        line-height:1;
        background:linear-gradient(90deg,#FF6B35 0%,#FFB347 55%,#FF8C35 100%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
        display:block;
        padding:6px 0 10px 0;
        user-select:none;
        transform:scaleX(1.55);
        transform-origin:left center;
      }
    `;
    document.head.appendChild(s);
  },[]);
}

export default function CrewMate(){
  useGlobalStyles();
  // Check localStorage for nickname
  const getSavedNick=()=>{
    try{return localStorage.getItem("crewmate_nick")||null;}catch(e){return null;}
  };

  const [nick,     setNick]   =useState(()=>getSavedNick());
  const [tab,      setTab]    =useState(0);
  const prevTabRef=useRef(0);
  const tabDirRef =useRef('left');
  const handleTabChange=useCallback((i)=>{
    tabDirRef.current=i>prevTabRef.current?'left':'right';
    prevTabRef.current=i;
    setTab(i);
  },[]);
  const [roster,   setRoster] =useState(()=>{
    try{const s=localStorage.getItem("crewmate_roster");return s?JSON.parse(s):[];}catch(e){return [];}
  });
  const [agenda,   setAgenda] =useState(()=>{
    try{const s=localStorage.getItem("crewmate_agenda");return s?JSON.parse(s):{};}catch(e){return {};}
  });
  const [crew,     setCrew]   =useState(()=>{
    try{
      const s=localStorage.getItem("crewmate_crew_extra");
      if(s){
        const x=JSON.parse(s);
        return{crewName:x.crewName||"",empId:x.empId||"",
          totalBLH:x.totalBLH||0,flightBLH:x.flightBLH||0,role:"CM",
          rgdCount:x.rgdCount||0,phoCount:x.phoCount||0,
          groundPaidHours:x.groundPaidHours||0,
          rosterMonth:x.rosterMonth||4,rosterYear:x.rosterYear||2026};
      }
    }catch(e){}
    return{crewName:"",empId:"",totalBLH:0,flightBLH:0,role:"CM",
      rgdCount:0,phoCount:0,groundPaidHours:0};
  });
  const [pay,      setPay]    =useState(()=>{
    try{const s=localStorage.getItem("crewmate_pay");return s?{...DEFAULT_PAY,...JSON.parse(s)}:DEFAULT_PAY;}catch(e){return DEFAULT_PAY;}
  });
  const [bills,    setBills]  =useState(DEFAULT_BILLS);
  const [modal,    setModal]  =useState(false);
  const [sel,      setSel]    =useState(null);
  const [crewSheet,setCrewSheet]=useState(null);
  const [importedCrew,setImportedCrew]=useState(()=>{
    try{const s=localStorage.getItem("crewmate_crew_briefing");return s?JSON.parse(s):{};}catch(e){return {};}
  });
  const [settings,setSettings]=useState(false);
  const [lastSync, setLastSync]=useState(()=>{
    try{return localStorage.getItem("crewmate_last_sync")||null;}catch(e){return null;}
  });

  const swipeRef=useSwipe(
    ()=>{if(!modal&&!sel&&!crewSheet)setTab(t=>Math.min(t+1,TABS.length-1));},
    ()=>{if(!modal&&!sel&&!crewSheet)setTab(t=>Math.max(t-1,0));}
  );

  const handleImport=({flights,agenda:ag,crewName,empId,crewRole,totalBLH,flightBLH,rgdCount,phoCount,groundPaidHours,crewBriefing,rosterMonth,rosterYear})=>{
    setRoster(flights.map((f,i)=>({...f,id:Date.now()+i,
      statusColor:f.overnight?C.amber:C.green,status:f.overnight?"Multi-day":"On Time"})));
    setAgenda(ag||{});
    if(crewName)setCrew({crewName,empId,totalBLH,flightBLH,role:crewRole||"CC",rgdCount:rgdCount||0,phoCount:phoCount||0,groundPaidHours:groundPaidHours||0,rosterMonth:rosterMonth||4,rosterYear:rosterYear||2026});
    if(crewBriefing&&Object.keys(crewBriefing).length>0)setImportedCrew(crewBriefing);
    setModal(false);
    const ts = new Date().toLocaleString("en-NZ",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    setLastSync(ts);
    try{
      localStorage.setItem("crewmate_last_sync",ts);
      // Persist roster and agenda so user doesn't re-upload each session
      localStorage.setItem("crewmate_roster",JSON.stringify(flights));
      localStorage.setItem("crewmate_agenda",JSON.stringify(ag||{}));
      if(crewBriefing&&Object.keys(crewBriefing).length>0)
        localStorage.setItem("crewmate_crew_briefing",JSON.stringify(crewBriefing));
      localStorage.setItem("crewmate_crew_extra",JSON.stringify({
        crewName,empId,crewRole,totalBLH,flightBLH,rgdCount,phoCount,
        groundPaidHours,rosterMonth,rosterYear
      }));
    }catch(e){}
  };

  const saveNick=(n)=>{
    try{localStorage.setItem("crewmate_nick",n);}catch(e){}
    setNick(n); setSettings(false);
  };
  const saveRole=(r)=>{
    setCrew(c=>({...c,role:r})); setSettings(false);
  };

  // Show onboarding if no nickname set
  if(!nick) return <OnboardingScreen onDone={(name,payProfile)=>{setNick(name);if(payProfile)setPay(p=>({...p,...payProfile}));}}/>;

  const totalDuty=roster.reduce((s,f)=>s+(f.dutyHours||0),0);
  const roleColor={"CM":C.accent,"CC":C.blue}[crew.role]||C.soft;
  const displayName=nick;

  // Build crew manifest for any roster flight
  const getManifest=(flightNo,from,to,dateStr)=>{
    // Try imported crew first, fall back to hardcoded briefing
    const merged={...CREW_BRIEFING,...importedCrew};
    return getCrewForFlightFromBriefing(flightNo,from,to,crew.role,crew.crewName,crew.empId,dateStr,merged);
  };

  return(
    <div style={{background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",
      fontFamily:"'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      color:C.text,position:"relative",overflow:"hidden"}}>
      <div style={{position:"fixed",top:-120,right:-80,width:320,height:320,
        background:`radial-gradient(circle,${C.accent}15,transparent 70%)`,pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"fixed",bottom:40,left:-80,width:260,height:260,
        background:`radial-gradient(circle,${C.blue}10,transparent 70%)`,pointerEvents:"none",zIndex:0}}/>

      {modal&&<ImportFlow onClose={()=>setModal(false)} onImport={handleImport}/>}
      {settings&&<SettingsSheet crew={crew} nick={nick} pay={pay}
        onClose={()=>setSettings(false)}
        onSaveNick={saveNick}
        onSaveRole={saveRole}
        onSavePay={p=>{
          const updated={...pay,...p};
          setPay(updated);
          try{localStorage.setItem("crewmate_pay",JSON.stringify(updated));}catch(e){}
          setSettings(false);
        }}/>}
      {crewSheet&&<CrewSheet manifest={crewSheet} onClose={()=>setCrewSheet(null)}/>}

      <div style={{padding:"52px 24px 0",position:"relative",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <button onClick={()=>setSettings(true)} style={{background:"none",border:"none",
            cursor:"pointer",textAlign:"left",padding:0}}>
            <div style={{fontSize:10,letterSpacing:3,color:C.muted,fontWeight:700,marginBottom:4}}>CREWMATE</div>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:-.5,color:C.text}}>Hey, {displayName} 👋</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
              <div style={{background:`${roleColor}20`,border:`1px solid ${roleColor}50`,
                borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:roleColor}}>
                {crew.role}
              </div>
              <div style={{fontSize:12,color:C.soft}}>{crew.empId} · JQ</div>
              <div style={{fontSize:10,color:C.muted}}>⚙️</div>
            </div>
          </button>
          <div style={{textAlign:"right",display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>downloadICS(roster,agenda,crew.crewName,crew.rosterMonth,crew.rosterYear)} className="cm-btn" style={{background:`${C.blue}22`,
                border:`1px solid ${C.blue}55`,borderRadius:14,padding:"10px 14px",
                color:C.blue,fontSize:11,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
                📅 iCloud
              </button>
              <button onClick={()=>setModal(true)} style={{background:`${C.accent}22`,
                border:`1px solid ${C.accent}55`,borderRadius:14,padding:"10px 16px",
                color:C.accent,fontSize:11,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
                ↓ ROSTER
              </button>
            </div>
            {lastSync&&<div style={{fontSize:9,color:C.muted,textAlign:"right"}}>
              Updated {lastSync}
            </div>}
          </div>
        </div>
      </div>

      <div style={{display:"flex",margin:"18px 24px 0",background:C.card,borderRadius:14,
        padding:4,position:"relative",zIndex:1}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>handleTabChange(i)} className="cm-btn" style={{flex:1,padding:"10px 0",borderRadius:10,
            border:"none",background:tab===i?C.accent:"transparent",
            color:tab===i?"#fff":C.muted,fontSize:10,fontWeight:700,
            letterSpacing:2,cursor:"pointer",transition:"background .2s,color .2s"}}>{t}</button>
        ))}
      </div>

      <div ref={swipeRef} key={tab} className={tabDirRef.current==="left"?"cm-tab-left":"cm-tab-right"} style={{padding:"18px 24px 100px",position:"relative",zIndex:1}}>
        {tab===0&&(sel
          ?<FlightDetail flight={sel} onBack={()=>setSel(null)}
              onCrewTap={()=>setCrewSheet(getManifest(sel.flightNo,sel.from,sel.to,sel.date))}/>
          :<RosterTab roster={roster} onSelect={setSel} onImport={()=>setModal(true)} agenda={agenda}/>
        )}
        {tab===1&&<TodayErrorBoundary><TodayTab
          todayItems={agenda[TODAY]||[]}
          tomorrowItems={agenda[TOMORROW]||[]}
          crewInfo={crew}
          onCrewTap={(fno,fr,to,dt)=>setCrewSheet(getManifest(fno,fr,to,dt))}/></TodayErrorBoundary>}
        {tab===2&&<HoursTab roster={roster} totalDuty={totalDuty} crew={crew}
          pay={pay} setPay={setPay} bills={bills} setBills={setBills} agenda={agenda}/>}
      </div>

      <div style={{position:"fixed",bottom:22,left:0,right:0,
        display:"flex",justifyContent:"center",gap:6,zIndex:10}}>
        {TABS.map((_,i)=>(
          <div key={i} style={{width:tab===i?22:6,height:6,borderRadius:3,
            background:tab===i?C.accent:C.muted,transition:"all .3s"}}/>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TODAY TAB
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  TRACK SHEET — Flight tracking via external apps
// ═══════════════════════════════════════════════════════════════════
function TrackSheet({flight,onClose}){
  const fno=flight?.flightNo||"";
  const rego=flight?.rego||null;
  const icao=toICAO(fno);
  const dep=flight?.from||"";
  const arr=flight?.to||"";
  const faUrl=rego
    ?`https://www.flightaware.com/live/flight/${rego}`
    :`https://www.flightaware.com/live/flight/${icao}`;

  // FlightAware blocks iframes (X-Frame-Options: SAMEORIGIN)
  // Best UX: rich card with direct open button

  return(
    <div style={{position:"fixed",inset:0,zIndex:200,
      background:"rgba(0,0,0,0.72)",backdropFilter:"blur(10px)"}}>
      {/* Sheet positioned from bottom, leaving ~88px top gap for notch + glow */}
      <div className="cm-sheet" style={{
        position:"absolute",bottom:0,left:0,right:0,
        top:88,
        padding:"2px 2px 0",
        borderRadius:"22px 22px 0 0",
        background:"linear-gradient(135deg,#0D4F6B 0%,#0A3D52 25%,#083A2E 50%,#0A4D3A 75%,#0D5C4A 100%)",
        boxShadow:"0 -4px 40px rgba(13,92,74,0.5),0 -2px 80px rgba(13,79,107,0.3)",
      }}>
        <div style={{height:"100%",background:C.card,borderRadius:"20px 20px 0 0",
          display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Handle */}
          <div style={{display:"flex",justifyContent:"center",padding:"12px 0 6px"}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.muted}}/>
          </div>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"4px 20px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:42,height:42,borderRadius:12,
                background:"linear-gradient(135deg,#1A3A5C,#0D2A40)",
                border:"1px solid #2A5A8C",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🛰</div>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:C.text}}>{fno}</div>
                <div style={{fontSize:11,color:C.soft,marginTop:1}}>
                  {dep&&arr?`${dep} → ${arr} · `:""}
                  {rego||icao}
                </div>
              </div>
            </div>
            <button onClick={onClose}
              style={{background:C.card2,border:`1px solid ${C.border}`,
                borderRadius:10,color:"#FF3B30",fontSize:16,
                width:36,height:36,cursor:"pointer",flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>

          {/* Body */}
          <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
            {/* Main CTA */}
            <button
              onClick={()=>window.open(faUrl,"_blank","noopener,noreferrer")}
              style={{
                width:"100%",padding:"20px",marginBottom:16,cursor:"pointer",
                background:"linear-gradient(135deg,#1A3A5C 0%,#0D2A40 100%)",
                border:"1px solid #2A5A8C",borderRadius:20,
                display:"flex",alignItems:"center",justifyContent:"space-between",
              }}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:32}}>🛰</div>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:15,fontWeight:800,color:C.text}}>FlightAware</div>
                  <div style={{fontSize:11,color:"#4A9EFF",marginTop:2}}>
                    {rego?`Track ${rego} live`:"Live flight tracking"}
                  </div>
                </div>
              </div>
              <div style={{
                background:"#4A9EFF",borderRadius:12,
                padding:"10px 16px",
                fontSize:13,fontWeight:700,color:"#fff",
              }}>Open ↗</div>
            </button>

            {/* Info tile */}
            <div style={{background:C.card2,borderRadius:16,padding:"16px",
              border:`1px solid ${C.border}`,marginBottom:16}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:12}}>TRACKING INFO</div>
              <div style={{display:"flex",gap:8}}>
                {[
                  {l:"FLIGHT",v:fno},
                  {l:"REGO",v:rego||"–"},
                  {l:"CALLSIGN",v:icao||"–"},
                ].map(({l,v})=>(
                  <div key={l} style={{flex:1,background:C.card,borderRadius:10,
                    padding:"10px 0",textAlign:"center",border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:8,color:C.muted,letterSpacing:1.5}}>{l}</div>
                    <div style={{fontSize:12,fontWeight:700,marginTop:3}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Note */}
            <div style={{background:`${C.blue}10`,border:`1px solid ${C.blue}25`,
              borderRadius:14,padding:"12px 16px",display:"flex",gap:10}}>
              <span style={{fontSize:16}}>💡</span>
              <div style={{fontSize:12,color:C.soft,lineHeight:1.6}}>
                FlightAware opens in your browser for the best tracking experience.
                <strong style={{color:C.text,display:"block",marginTop:4}}>
                  In-app live map coming in a future update.
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function LandingETA({live, item}){
  // Estimate landing time from scheduled arrival or ADS-B destination
  const arrTime = item.arr || live?.schedArr || null;
  const [eta, setEta] = useState(null);
  
  useEffect(()=>{
    if(!arrTime) return;
    const calc = () => {
      const now = new Date();
      const [h,m] = arrTime.split(":").map(Number);
      const then = new Date(now); then.setHours(h,m,0,0);
      if(then < now) then.setDate(then.getDate()+1);
      const diff = Math.round((then - now) / 60000);
      setEta(diff);
    };
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [arrTime]);
  
  if(eta === null) return <span style={{fontSize:13,color:C.soft}}>–</span>;
  if(eta <= 0) return <span style={{fontSize:13,fontWeight:700,color:C.green}}>Landing now</span>;
  const hrs = Math.floor(eta/60), mins = eta%60;
  return(
    <span style={{fontSize:16,fontWeight:800,color:C.green}}>
      {hrs>0?`${hrs}h `:""}{mins}m
    </span>
  );
}


class TodayErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false,errorMsg:''}; }
  static getDerivedStateFromError(){ return {hasError:true}; }
  componentDidCatch(e,info){ 
    console.error("TodayTab crashed:",e,info);
    this.setState({errorMsg:e?.message||String(e)});
  }
  render(){
    if(this.state.hasError)return(
      <div style={{padding:40,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8,color:"#EDF2FF"}}>Today tab error</div>
        <div style={{fontSize:11,color:"#FF6B35",marginBottom:8,padding:"8px 12px",
          background:"#FF6B3520",borderRadius:8,maxWidth:320,wordBreak:"break-all",textAlign:"left"}}>
          {this.state.errorMsg||"Unknown error"}
        </div>
        <div style={{fontSize:12,color:"#7A8599",marginBottom:20}}>Screenshot this and share with developer</div>
        <button onClick={()=>this.setState({hasError:false})}
          style={{background:"#FF6B35",border:"none",borderRadius:12,padding:"12px 24px",
            color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}

function TodayTab({todayItems,tomorrowItems,crewInfo,onCrewTap}){
  const [liveData,  setLiveData] =useState({});
  const [loading,   setLoading]  =useState(true);
  const [lastRefresh,setLast]    =useState(null);
  const [regoSheet, setRegoSheet]=useState(false);
  const [trackSheet,setTrackSheet]=useState(null);
  const [regoMap,setRegoMap]=useState({}); // flightNo→rego
  const [now,       setNow]      =useState(new Date());
  const autoRef=useRef(null);

  // Derived values - defined before useEffects that need them
  const todayFlights=todayItems.filter(i=>i.type==="flight");
  const firstSignOn=todayFlights[0]?.signOn||null;
  const lastSignOff=todayFlights.length>0?(todayFlights[todayFlights.length-1].signOff||null):null;

  // Fetch regos for today's flights - tries multiple strategies
  useEffect(()=>{
    if(!todayFlights.length) return;
    let cancelled=false;
    (async()=>{
      try{
        const regos={};
        for(const item of todayFlights){
          if(cancelled) break;
          const icao=toICAO(item.flightNo);
          const strategies=[
            `https://api.adsb.lol/v2/callsign/${icao}`,
            `https://api.adsb.lol/v2/callsign/${item.flightNo}`,
          ];
          for(const url of strategies){
            try{
              const d=await fetchWithTimeout(url,6000);
              const ac=Array.isArray(d?.ac)&&d.ac.length>0?d.ac[0]:null;
              if(ac&&typeof ac.r==="string"&&ac.r.length>2){regos[item.flightNo]=ac.r;break;}
            }catch(e){}
          }
        }
        if(!cancelled&&Object.keys(regos).length>0)
          setRegoMap(rm=>({...rm,...regos}));
      }catch(e){}
    })();
    return()=>{cancelled=true;};
  },[todayFlights.length]);

  // Update clock every 30s for current sector detection
  useEffect(()=>{
    const t=setInterval(()=>setNow(new Date()),30000);
    return()=>clearInterval(t);
  },[]);

  // Determine current sector based on time
  const t2m=t=>{if(!t)return-1;const[h,m]=t.split(":").map(Number);return h*60+m;};
  const nowMins=now.getHours()*60+now.getMinutes();
  const hasSignedOn=firstSignOn&&nowMins>=t2m(firstSignOn);

  // Detect aircraft swaps between consecutive flights
  const hasAircraftSwap=(itemA,itemB)=>{
    const regoA=liveData[itemA?.flightNo]?.rego||itemA?.rego||"";
    const regoB=liveData[itemB?.flightNo]?.rego||itemB?.rego||"";
    if(regoA&&regoB&&regoA!==regoB)return true;
    // Different aircraft type
    if(itemA?.aircraft&&itemB?.aircraft&&itemA.aircraft!==itemB.aircraft)return true;
    return false;
  };

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const results={};
      for(const item of todayFlights){
        const d=await fetchFlightData(item.flightNo);if(d)results[item.flightNo]=d;
      }
      setLiveData(results);
      setLast(new Date().toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}));
      // Extract regos from live data
      const regos={};
      for(const [fno,d] of Object.entries(results)){
        if(d?.rego)regos[fno]=d.rego;
      }
      // Also try adsb lookup by callsign for any flight missing rego
      for(const item of todayFlights){
        if(!regos[item.flightNo]){
          try{
            const icao=toICAO(item.flightNo);
            const d=await fetchWithTimeout(`https://api.adsb.lol/v2/callsign/${icao}`,4000);
            if(d?.ac?.length>0&&d.ac[0].r)regos[item.flightNo]=d.ac[0].r;
          }catch(e){}
        }
      }
      setRegoMap(rm=>({...rm,...regos}));
    }finally{setLoading(false);}
  },[todayFlights.length]);

  useEffect(()=>{
    refresh();autoRef.current=setInterval(refresh,10*60*1000);
    return()=>clearInterval(autoRef.current);
  },[]);

  return(
    <div>
      {regoSheet&&<RegoSheet liveRego={typeof regoSheet==="string"?regoSheet:null} onClose={()=>setRegoSheet(false)}/>}
      {trackSheet&&<TrackSheet flight={trackSheet} onClose={()=>setTrackSheet(null)}/>}
      <style>{`@keyframes cwspin{to{transform:rotate(360deg)}} @keyframes cwfade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.accent}}>TODAY</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{TODAY}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {lastRefresh&&<div style={{fontSize:10,color:C.muted}}>Updated {lastRefresh}</div>}
          <button onClick={refresh} disabled={loading} style={{
            background:`${C.blue}18`,border:`1px solid ${C.blue}40`,
            borderRadius:10,padding:"7px 12px",color:C.blue,
            fontSize:11,fontWeight:700,cursor:"pointer",opacity:loading?.5:1,
            display:"flex",alignItems:"center",gap:4}}>
            <span style={{display:"inline-block",animation:loading?"cwspin 1s linear infinite":"none",fontSize:13}}>↻</span>
            {loading?"…":"Refresh"}
          </button>
        </div>
      </div>

      {firstSignOn&&(
        <div style={{background:`${C.accent}15`,border:`1px solid ${C.accent}40`,
          borderRadius:16,padding:"14px 18px",marginBottom:10,
          display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:22}}>🛂</div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:1.5,marginBottom:2}}>SIGN ON</div>
            <div style={{fontSize:24,fontWeight:900,letterSpacing:-1}}>{firstSignOn}</div>
            <div style={{fontSize:11,color:C.soft}}>AKL International · Terminal I</div>
          </div>
          {firstSignOn&&<TimeUntil target={firstSignOn}/>}
        </div>
      )}

      {todayItems.length===0&&(
        <div style={{background:C.card,borderRadius:14,padding:"24px",
          border:`1px solid ${C.border}`,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>😴</div>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Day off</div>
          <div style={{fontSize:12,color:C.muted}}>Nothing scheduled today</div>
        </div>
      )}

      {todayItems.map((item,i)=>{
        if(item.type==="duty")return <DutyRow key={i} item={item}/>;
        const live=liveData[item.flightNo];
        const isLast=i===todayItems.length-1;
        return(
          <div key={i}>
            <FlightLiveCard
              item={item} live={live}
              itemRego={regoMap[item.flightNo]||item.rego||null}
              onRegoTap={(rego)=>setRegoSheet(rego||true)}
              onCrewTap={()=>onCrewTap(item.flightNo,item.from,item.to,item.date||TODAY)}
              onTrackTap={(fno,fr,to)=>setTrackSheet({flightNo:fno,from:fr,to,rego:regoMap[fno]||item.rego||null})}
              loading={loading&&!live}
              isCurrent={(()=>{
                const dep=t2m(item.dep);const arr=t2m(item.arr||item.signOff||"23:59");
                const adjArr=arr<dep?arr+24*60:arr;
                return nowMins>=dep&&nowMins<=adjArr;
              })()}/>
            {!isLast&&todayFlights.length>1&&
              hasAircraftSwap(item,todayItems[i+1])&&(
              <div style={{background:`${C.amber}12`,border:`1px solid ${C.amber}35`,
                borderRadius:10,padding:"9px 14px",marginBottom:8,
                display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>🔄</span>
                <span style={{fontSize:11,color:C.amber,fontWeight:600}}>
                  Aircraft swap at {item.to}
                </span>
              </div>
            )}
          </div>
        );
      })}


      {/* Sign-off countdown — only shows after sign-on time */}
      {lastSignOff&&hasSignedOn&&(
        <div style={{background:`${C.blue}15`,border:`1px solid ${C.blue}40`,
          borderRadius:16,padding:"14px 18px",marginTop:10,
          display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:22}}>🏁</div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.blue,fontWeight:700,letterSpacing:1.5,marginBottom:2}}>SIGN OFF</div>
            <div style={{fontSize:24,fontWeight:900,letterSpacing:-1}}>{lastSignOff}</div>
            <div style={{fontSize:11,color:C.soft}}>End of duty</div>
          </div>
          {lastSignOff&&<SignOffTimer target={lastSignOff} hasSignedOn={hasSignedOn}/>}
        </div>
      )}
    </div>
  );
}

function SignOffTimer({target,hasSignedOn}){
  const [diff,setDiff]=useState(null);
  useEffect(()=>{
    if(!hasSignedOn||!target||typeof target!=="string"||!target.includes(":")){setDiff(null);return;}
    const calc=()=>{
      const now=new Date();
      const[h,m]=target.split(":").map(Number);
      const then=new Date(now);then.setHours(h,m,0,0);
      const rawMins=Math.round((then-now)/60000);
      setDiff(rawMins>16*60?rawMins-24*60:rawMins);
    };
    calc();const t=setInterval(calc,30000);return()=>clearInterval(t);
  },[target,hasSignedOn]);
  if(diff===null)return null;
  if(diff<=0)return(
    <div style={{textAlign:"right"}}>
      <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:2}}>SIGNED OFF</div>
      <div style={{fontSize:16,fontWeight:700,color:C.green}}>{target}</div>
    </div>
  );
  const hrs=Math.floor(diff/60),rem=diff%60;
  const col=diff<30?C.red:diff<90?C.amber:C.blue;
  return(
    <div style={{textAlign:"right"}}>
      <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:2}}>SIGN OFF IN</div>
      <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.5,color:col}}>
        {hrs>0?`${hrs}h `:""}{rem}m
      </div>
    </div>
  );
}

function TimeUntil({target}){
  const [diff,setDiff]=useState(null);
  useEffect(()=>{
    if(!target||typeof target!=="string"||!target.includes(":"))return;
    const calc=()=>{
      const now=new Date();
      const[h,m]=target.split(":").map(Number);
      const then=new Date(now);then.setHours(h,m,0,0);
      // If more than 8 hours in future, it's probably yesterday's time — show as past
      const rawMins=Math.round((then-now)/60000);
      // If in the future by more than 16hrs, don't advance to next day — show as past
      setDiff(rawMins>16*60?rawMins-24*60:rawMins);
    };
    calc();const t=setInterval(calc,30000);return()=>clearInterval(t);
  },[target]);
  if(diff===null)return null;
  // Past: show "Signed on at HH:MM"
  if(diff<=0){
    return(
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:2}}>SIGNED ON AT</div>
        <div style={{fontSize:16,fontWeight:700,color:C.green}}>{target}</div>
      </div>
    );
  }
  const hrs=Math.floor(diff/60),rem=diff%60;
  const col=diff<60?C.red:diff<180?C.amber:C.accent;
  return(
    <div style={{textAlign:"right"}}>
      <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:2}}>SIGN ON IN</div>
      <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.5,color:col}}>
        {hrs>0?`${hrs}h `:""}{rem}m
      </div>
    </div>
  );
}

function FlightLiveCard({item,live,itemRego,onRegoTap,onTrackTap,onCrewTap,loading,isCurrent}){
  // Completed = arr time has passed (and it's not an overnight that hasn't landed yet)
  const nowM=(()=>{const n=new Date();return n.getHours()*60+n.getMinutes();})();
  const arrM=item.arr?(()=>{const[h,m]=item.arr.split(":").map(Number);return h*60+m;})():-1;
  const depM=item.dep?(()=>{const[h,m]=item.dep.split(":").map(Number);return h*60+m;})():-1;
  const isCompleted=arrM>0&&nowM>arrM&&!isCurrent&&depM>0&&nowM>depM;
  const col=isCompleted?C.muted:item.overnight?C.amber:C.green;
  const status=live?.status||"Scheduled";
  const statusCol=live?.statusColor||C.soft;
  const signOff=item.signOff||live?.signOff||null;
  return(
    <div style={{marginBottom:10}}>
      <div style={{background:C.card,
        borderRadius:"16px",
        padding:"16px 18px",border:`1px solid ${C.border}`,
        position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col}}/>
        <div style={{marginLeft:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{background:`${col}22`,border:`1px solid ${col}55`,
                borderRadius:8,padding:"4px 10px",fontSize:13,fontWeight:800,color:col}}>
                {item.flightNo}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>{item.from} → {item.to}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                  {{"JQ":"Jetstar","QF":"Qantas","VA":"Virgin Australia","NZ":"Air New Zealand","ZL":"Rex"}[item.flightNo?.slice(0,2)]||""}
                </div>
              </div>
              {isCurrent&&(
                <div className="cm-current-sector" style={{background:`${C.green}20`,
                  border:`1px solid ${C.green}55`,borderRadius:8,padding:"3px 8px",
                  fontSize:10,fontWeight:700,color:C.green}}>● NOW</div>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              {live?.liveOk&&<div style={{fontSize:11,fontWeight:700,color:statusCol}}>{status}</div>}
              <button onPointerDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();e.preventDefault();onCrewTap&&onCrewTap();}}
                style={{background:`${C.purple}22`,border:`1px solid ${C.purple}55`,
                  borderRadius:8,padding:"5px 9px",cursor:"pointer",
                  display:"flex",alignItems:"center",
                  WebkitTapHighlightColor:"transparent",touchAction:"manipulation"}}>
                <span style={{fontSize:13}}>👥</span>
              </button>

            </div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
            <div>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5}}>DEP</div>
              <div style={{fontSize:20,fontWeight:800}}>{live?.estDep||item.dep}</div>
            </div>
            <div style={{flex:1,height:2,background:C.card2,borderRadius:2,position:"relative",margin:"8px 0"}}>
              <div style={{position:"absolute",left:"50%",top:-9,fontSize:13,transform:"translateX(-50%)",color:C.muted}}>✈</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5}}>ARR{item.overnight?" +1":""}</div>
              <div style={{fontSize:20,fontWeight:800,color:item.overnight?C.amber:C.text}}>{live?.estArr||item.arr}</div>
            </div>
            {signOff&&(
              <div style={{textAlign:"right",paddingLeft:10,borderLeft:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1.5}}>SIGN OFF</div>
                <div style={{fontSize:16,fontWeight:700,color:C.soft}}>{signOff}{item.overnight?" +1":""}</div>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
            {(()=>{
              const rego=itemRego||live?.rego||item.rego||null;
              return(<button onPointerDown={e=>e.stopPropagation()}
                onClick={e=>{e.stopPropagation();e.preventDefault();onRegoTap&&onRegoTap(rego||item.flightNo);}}
                style={{display:"inline-flex",alignItems:"center",gap:6,
                  background:rego?`${C.blue}15`:`${C.card2}`,
                  border:rego?`1px solid ${C.blue}40`:`1px solid ${C.border}`,
                  borderRadius:8,padding:"5px 11px",cursor:"pointer",
                  WebkitTapHighlightColor:"transparent",touchAction:"manipulation",outline:"none"}}>
                <span style={{fontSize:12,fontWeight:700,color:rego?"#FFFFFF":C.soft,letterSpacing:.5}}>
                  {rego||"– –"}
                </span>
                {rego&&<span style={{fontSize:11,color:C.blue}}>ⓘ</span>}
              </button>);
            })()}
            <button onPointerDown={e=>e.stopPropagation()}
              onClick={e=>{e.stopPropagation();e.preventDefault();onTrackTap&&onTrackTap(item.flightNo,item.from,item.to);}}
              style={{display:"inline-flex",alignItems:"center",gap:5,
                background:`${C.green}12`,border:`1px solid ${C.green}40`,
                borderRadius:8,padding:"5px 11px",cursor:"pointer",
                WebkitTapHighlightColor:"transparent",touchAction:"manipulation",outline:"none"}}>
              <span style={{fontSize:11,color:C.green}}>🗺 Track</span>
            </button>
          </div>
        </div>
      </div>

      
    </div>
  );
}

// ─── Aircraft rego sheet ──────────────────────────────────────────
function RegoSheet({onClose,liveRego}){
  const [liveData,setLiveData]=useState(null);
  const [liveLoading,setLiveLoading]=useState(true);
  const [searchedRego,setSearchedRego]=useState(null);

  useEffect(()=>{
    if(!liveRego){setLiveLoading(false);return;}
    setLiveLoading(true);
    setLiveData(null);
    // Detect if it's a rego (VH-xxx, ZK-xxx) or flight number (JQ134)
    const isRego=/^[A-Z]{1,3}-[A-Z0-9]{2,5}$/.test(liveRego);
    const fetchFn = isRego
      ? fetchAircraftByRego(liveRego)
      : fetchWithTimeout(`https://api.adsb.lol/v2/callsign/${toICAO(liveRego)}`,6000)
          .then(d=>{
            const ac=d?.ac?.[0];
            if(!ac)return null;
            return fetchAircraftByRego(ac.r||liveRego);
          }).catch(()=>null);
    fetchFn.then(d=>{
      setSearchedRego(isRego?liveRego:null);
      setLiveData(d);
      setLiveLoading(false);
    }).catch(()=>setLiveLoading(false));
  },[liveRego]);

  return(
    <div style={{position:"fixed",inset:0,background:"#000000E0",
      backdropFilter:"blur(14px)",zIndex:200,display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.card,borderRadius:"24px 24px 0 0",padding:"0 0 40px",maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 4px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.muted}}/>
        </div>
        <div style={{padding:"10px 24px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:C.blue,fontWeight:700,letterSpacing:2,marginBottom:4}}>AIRCRAFT PROFILE</div>
              <div style={{fontSize:28,fontWeight:900,letterSpacing:-1,color:"#FFFFFF"}}>
                {liveData?.rego||searchedRego||liveRego||"–"}
              </div>
              <div style={{fontSize:13,color:C.soft,marginTop:2}}>
                {liveData?.type||""}
                {liveData?.operator?" · "+liveData.operator:""}
              </div>
            {liveLoading&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>⟳ Checking live position…</div>}
            {!liveLoading&&liveData&&(
              <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                <div style={{background:`${liveData.status==="Airborne"?C.green:C.amber}20`,
                  border:`1px solid ${liveData.status==="Airborne"?C.green:C.amber}50`,
                  borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,
                  color:liveData.status==="Airborne"?C.green:C.amber}}>
                  {liveData.status==="Airborne"?"✈️ Airborne":"🛬 On Ground"}
                </div>
                {liveData.flight&&<div style={{background:`${C.blue}15`,border:`1px solid ${C.blue}40`,
                  borderRadius:8,padding:"4px 10px",fontSize:11,color:C.blue}}>
                  {liveData.flight.trim()}
                </div>}
                {liveData.alt&&liveData.alt!=="ground"&&<div style={{fontSize:11,color:C.soft}}>
                  FL{Math.round(liveData.alt/100)}
                </div>}
                <div style={{fontSize:9,color:C.muted}}>via ADS-B · {liveData.fetchedAt}</div>
              </div>
            )}
            {!liveLoading&&!liveData&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Live position unavailable</div>}
            </div>
            <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,
              borderRadius:12,color:"#FF3B30",fontSize:18,width:40,height:40,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
        <div style={{padding:"20px 24px 0"}}>
          {liveData?.history?.length>0?(
            <>
              <div style={{fontSize:10,color:C.muted,letterSpacing:2,marginBottom:12}}>
                TODAY'S HISTORY · ADS-B Live
              </div>
              <div style={{background:`${C.blue}08`,border:`1px solid ${C.blue}25`,borderRadius:14,padding:"4px 0",marginBottom:16}}>
                {liveData.history.map((h,i)=>{
                  const isLast=i===liveData.history.length-1;
                  const isActive=h.status==="En Route";
                  return(
                    <div key={i} style={{padding:"12px 16px",
                      borderBottom:isLast?"none":`1px solid ${C.border}`,
                      display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                        background:isActive?C.amber:C.green,
                        boxShadow:isActive?`0 0 6px ${C.amber}`:`0 0 4px ${C.green}55`}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:13,fontWeight:800}}>{h.flight}</span>
                          <span style={{fontSize:12,color:C.soft}}>{h.from} → {h.to}</span>
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                          {h.dep} → {h.arr}
                        </div>
                      </div>
                      <div style={{fontSize:11,color:isActive?C.amber:C.green,fontWeight:600}}>
                        {h.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ):(
            <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:13}}>
              {liveLoading?"Fetching aircraft history…":"No flight history available · Aircraft may be on ground"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Crew manifest sheet ──────────────────────────────────────────
function CrewSheet({manifest,onClose}){
  if(!manifest)return null;
  const roleCol={"CM":C.accent,"CC":C.blue,"Captain":"#FFD700","First Officer":"#C0C0C0"};
  return(
    <div style={{position:"fixed",inset:0,background:"#000000E0",
      backdropFilter:"blur(14px)",zIndex:200,display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:C.card,borderRadius:"24px 24px 0 0",padding:"0 0 48px",maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 4px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.muted}}/>
        </div>
        <div style={{padding:"10px 24px 18px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:C.purple,fontWeight:700,letterSpacing:2,marginBottom:4}}>CREW MANIFEST</div>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:-.5}}>{manifest.flightNo}</div>
              <div style={{fontSize:12,color:C.soft,marginTop:2}}>{manifest.from} → {manifest.to}</div>
            </div>
            <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,
              borderRadius:12,color:"#FF3B30",fontSize:18,width:40,height:40,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
        <div style={{padding:"20px 24px 0"}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:2,marginBottom:12}}>FLIGHT DECK</div>
          {manifest.flightdeck.map((m,i)=>{
            const col=roleCol[m.role]||"#FFD700";
            return(
              <div key={i} style={{background:C.card2,borderRadius:14,padding:"14px 16px",marginBottom:8,
                display:"flex",alignItems:"center",gap:14,border:`1px solid ${C.border}`}}>
                <div style={{width:42,height:42,borderRadius:"50%",flexShrink:0,
                  background:m.known===false?`${C.muted}20`:`${col}20`,
                  border:`1px solid ${m.known===false?C.muted:col}55`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,fontWeight:800,color:m.known===false?C.muted:col}}>
                  {m.known===false?"?":m.initials}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,
                    color:m.known===false?C.muted:C.text}}>{m.name}</div>
                  <div style={{fontSize:11,color:C.soft,marginTop:2}}>
                    {m.known===false?"Awaiting briefing":""}
                  </div>
                </div>
                <div style={{background:`${col}18`,border:`1px solid ${col}45`,
                  borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,color:col}}>{m.role}</div>
              </div>
            );
          })}
          <div style={{fontSize:10,color:C.muted,letterSpacing:2,marginBottom:12,marginTop:20}}>CABIN CREW</div>
          {manifest.cabin.map((m,i)=>{
            const col=roleCol[m.role]||C.green;
            return(
              <div key={i} style={{background:m.you?`${C.accent}12`:C.card2,
                borderRadius:14,padding:"14px 16px",marginBottom:8,
                display:"flex",alignItems:"center",gap:14,
                border:`1px solid ${m.you?C.accent+"44":C.border}`}}>
                <div style={{width:42,height:42,borderRadius:"50%",flexShrink:0,
                  background:`${col}20`,border:`1px solid ${col}50`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,fontWeight:800,color:col}}>{m.initials}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:15,fontWeight:700}}>{m.name}</span>
                    {m.you&&<span style={{fontSize:9,background:`${C.accent}25`,
                      border:`1px solid ${C.accent}50`,borderRadius:5,
                      padding:"2px 6px",color:C.accent,fontWeight:700}}>YOU</span>}
                  </div>
                  <div style={{fontSize:11,color:C.soft,marginTop:2}}>
                    {m.empId?`${m.empId} · `:""}Base {m.base}
                  </div>
                </div>
                <div style={{background:`${col}18`,border:`1px solid ${col}45`,
                  borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,color:col}}>{m.role}</div>
              </div>
            );
          })}
          <div style={{marginTop:16,background:C.card2,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:4}}>
                {manifest.source==="briefing"?"DATA SOURCE":"CREW DATA"}
              </div>
            <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>
              {manifest.source==="briefing"
                ? "Crew names from the flight briefing sheet. Import updated briefing PDFs as they become available."
                : "Crew briefing not yet loaded for this flight. Names will appear once the briefing sheet is imported."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Duty row ─────────────────────────────────────────────────────
function DutyRow({item}){
  const col=item.color||C.green;
  const isOff=item.code==="OFF";
  if(item.type==="duty")return(
    <div style={{background:C.card,borderRadius:14,padding:"14px 18px",marginBottom:8,
      border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col}}/>
      <div style={{marginLeft:8,flex:1,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:`${col}22`,border:`1px solid ${col}55`,borderRadius:8,
            padding:"6px 12px",fontSize:15,fontWeight:800,color:col}}>{item.code}</div>
          <div>
            <div style={{fontSize:12,color:C.soft}}>{(DUTY_META[item.code]||DUTY_META.FLT).label}</div>
            {item.paidHours>0&&<div style={{fontSize:10,color:C.muted}}>{item.paidHours}h paid</div>}
          </div>
        </div>
        {!isOff&&(item.signOn||item.signOff)&&(
          <div style={{textAlign:"right"}}>
            {item.signOn&&<div style={{fontSize:15,fontWeight:700}}>{item.signOn}</div>}
            {item.signOff&&<div style={{fontSize:12,color:C.soft}}>{item.signOff}</div>}
          </div>
        )}
      </div>
    </div>
  );
  return(
    <div style={{background:C.card,borderRadius:14,padding:"14px 18px",marginBottom:8,
      border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col}}/>
      <div style={{marginLeft:8,flex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <div style={{background:`${col}22`,border:`1px solid ${col}55`,
            borderRadius:8,padding:"4px 10px",fontSize:13,fontWeight:800,color:col}}>{item.flightNo}</div>
          <div style={{fontSize:13,fontWeight:700}}>{item.from} → {item.to}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {item.dep&&<span style={{fontSize:13,fontWeight:700}}>{item.dep}</span>}
          {item.dep&&item.arr&&<span style={{fontSize:10,color:C.muted}}>–</span>}
          {item.arr&&<span style={{fontSize:13,fontWeight:600,color:item.overnight?C.amber:C.soft}}>{item.arr}</span>}
          {item.signOff&&<span style={{fontSize:11,color:C.muted}}>· off {item.signOff}{item.overnight?" +1":""}</span>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ROSTER TAB
// ═══════════════════════════════════════════════════════════════════
function RosterTab({roster,onSelect,onImport,agenda}){
  // Build full calendar: all days from agenda (duties+flights), sorted by date
  const groups=roster.reduce((a,f)=>{ (a[f.date]=a[f.date]||[]).push(f); return a; },{});
  const totalH=roster.reduce((s,f)=>s+(f.dutyHours||0),0);

  // Merge duties from agenda with flights from roster into a single sorted day map
  const allDaysMap={};
  // Add flight days from roster
  Object.entries(groups).forEach(([date,flights])=>{
    allDaysMap[date]={type:"flights",flights};
  });
  // Add duty days from agenda (only non-flight ones not already covered)
  if(agenda){
    Object.entries(agenda).forEach(([date,items])=>{
      if(allDaysMap[date])return; // flight day already added
      const duties=items.filter(i=>i.type==="duty");
      if(duties.length>0){
        const d=duties[0];
        allDaysMap[date]={type:"duty",code:d.code,signOn:d.signOn,signOff:d.signOff,paidHours:d.paidHours||0};
      }
    });
  }
  // Sort by calendar date
  const MONTHS={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const parseDate=s=>{
    const m=s.match(/\w+ (\d+) (\w+)/);
    return m?parseInt(m[2]?MONTHS[m[2]]:0)*100+parseInt(m[1]):0;
  };
  const allDays=Object.fromEntries(
    Object.entries(allDaysMap).sort((a,b)=>parseDate(a[0])-parseDate(b[0]))
  );
  if(!roster.length)return(
    <div style={{textAlign:"center",paddingTop:60}}>
      <div style={{fontSize:48,marginBottom:16}}>📋</div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>No roster loaded</div>
      <div style={{fontSize:13,color:C.soft,marginBottom:28}}>Import your CWP PDF to get started</div>
      <button onClick={onImport} style={{background:C.accent,border:"none",borderRadius:14,
        padding:"14px 28px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>↓ Import Roster</button>
    </div>
  );
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontSize:10,color:C.soft,letterSpacing:2}}>
            {roster.length} SECTORS · {Object.keys(groups).length} DUTY DAYS
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:3}}>{totalH.toFixed(1)}h total flight duty</div>
        </div>
        <button onClick={onImport} style={{background:"none",border:`1px solid ${C.border}`,
          borderRadius:10,padding:"6px 12px",color:C.soft,fontSize:10,fontWeight:600,cursor:"pointer"}}>
          ↻ UPDATE</button>
      </div>
      {Object.keys(allDays).length===0?(
        <div style={{textAlign:"center",padding:"60px 24px"}}>
          <div style={{fontSize:48,marginBottom:16}}>✈️</div>
          <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>No Roster Yet</div>
          <div style={{fontSize:13,color:C.soft,marginBottom:24,lineHeight:1.6}}>
            Import your CWP roster PDF to get started. All your flights, duties and crew will appear here.
          </div>
          <button onClick={onImport} style={{background:C.accent,border:"none",
            borderRadius:16,padding:"14px 32px",color:"#fff",
            fontSize:14,fontWeight:700,cursor:"pointer"}}>
            ↓ Import Roster PDF
          </button>
        </div>
      ):Object.entries(allDays).map(([date,entry],gi)=>(
        <div key={date} style={{marginBottom:14}}>
          <span className="horizon-date">{date.toUpperCase()}</span>
          {entry.type==="duty"
            ?<DutyDayCard code={entry.code} signOn={entry.signOn} signOff={entry.signOff} paidHours={entry.paidHours}/>
            :entry.flights.map((f,i)=>(
              <RosterCard key={f.id} flight={f} delay={(gi*3+i)*40} onSelect={()=>onSelect(f)}/>
            ))
          }
        </div>
      ))}
    </div>
  );
}


// Compact duty day card for non-flight days in roster
function DutyDayCard({code, signOn, signOff, paidHours}){
  const meta=DUTY_META[code]||{label:code,color:C.muted};
  const isOff=code==="OFF"||code==="STR";
  return(
    <div style={{background:C.card,borderRadius:12,padding:"11px 16px",
      marginBottom:8,border:`1px solid ${C.border}`,
      display:"flex",alignItems:"center",gap:12,
      position:"relative",overflow:"hidden",opacity:isOff?0.6:1}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:meta.color}}/>
      <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:4}}>
        <span style={{fontSize:14}}>{meta.icon||"📅"}</span>
        <div style={{background:`${meta.color}18`,border:`1px solid ${meta.color}40`,
          borderRadius:7,padding:"4px 10px",
          fontSize:12,fontWeight:800,color:meta.color,minWidth:36,textAlign:"center"}}>
          {code}
        </div>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,color:C.soft}}>{meta.label}</div>
        {paidHours>0&&<div style={{fontSize:10,color:C.muted}}>{paidHours}h paid</div>}
      </div>
      {!isOff&&(signOn||signOff)&&(
        <div style={{textAlign:"right"}}>
          {signOn&&<div style={{fontSize:12,fontWeight:600,color:C.text}}>{signOn}</div>}
          {signOff&&<div style={{fontSize:10,color:C.muted}}>{signOff}</div>}
        </div>
      )}
    </div>
  );
}
function RosterCard({flight:f,delay,onSelect}){
  const [vis,setVis]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setVis(true),delay);return()=>clearTimeout(t);},[delay]);
  const signOffDisplay=f.signOff?(f.signOff+(f.overnight?" +1":"")):(f.arr||(f.overnight?"next day":"–"));
  return(
    <div onClick={onSelect} style={{background:C.card,borderRadius:16,padding:"15px 18px",
      marginBottom:10,border:`1px solid ${C.border}`,cursor:"pointer",
      opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(10px)",
      transition:"opacity .35s, transform .35s",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:10,bottom:10,width:3,
        borderRadius:"0 3px 3px 0",background:f.statusColor}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginLeft:10}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:20,fontWeight:800,letterSpacing:-.5}}>{f.from}</span>
            <span style={{fontSize:12,color:C.muted}}>——✈——</span>
            <span style={{fontSize:20,fontWeight:800,letterSpacing:-.5}}>{f.to}</span>
          </div>
          <div style={{fontSize:12,color:C.soft}}>
            {f.dep} → <span style={{color:f.overnight?C.amber:C.soft}}>{signOffDisplay}</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:13,fontWeight:700}}>{f.flightNo}</div>
          {f.rego
            ?<div style={{fontSize:11,fontWeight:600,color:"#FFFFFF"}}>{f.rego}</div>
            :<div style={{fontSize:10,color:C.muted}}>{f.aircraft}</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginTop:12,marginLeft:10}}>
        {[{l:"DUTY",v:`${f.dutyHours}h`},{l:"ROLE",v:f.role},
          {l:"GATE",v:f.gate||"TBC"},{l:"TYPE",v:f.aircraft}].map(({l,v})=>(
          <div key={l} style={{flex:1,background:C.card2,borderRadius:8,padding:"7px 0",textAlign:"center"}}>
            <div style={{fontSize:8,color:C.muted,letterSpacing:1.5}}>{l}</div>
            <div style={{fontSize:11,fontWeight:700,marginTop:2}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlightDetail({flight:f,onBack,onCrewTap}){
  const signOff=f.signOff?(f.signOff+(f.overnight?" (+1)":"")):f.arr||"–";
  return(
    <div className="cm-tab-left">      <button onClick={onBack} className="cm-btn" style={{background:"none",border:"none",color:C.accent,
        fontSize:13,fontWeight:600,cursor:"pointer",padding:"0 0 18px",
        display:"flex",alignItems:"center",gap:6}}>← Roster</button>
      <div style={{background:C.card,borderRadius:20,padding:24,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:C.soft,letterSpacing:2,marginBottom:4}}>{f.date}</div>
            <div style={{fontSize:34,fontWeight:900,letterSpacing:-1.5}}>{f.flightNo}</div>
            <div style={{fontSize:12,color:C.soft}}>{f.aircraft}
              {f.rego&&<span style={{color:"#FFFFFF",fontWeight:600}}> · {f.rego}</span>}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
            <div style={{padding:"8px 14px",borderRadius:10,background:`${f.statusColor}22`,
              color:f.statusColor,fontSize:11,fontWeight:700}}>{f.status}</div>
            {/* Crew manifest button */}
            <button onClick={onCrewTap} style={{display:"flex",alignItems:"center",gap:6,
              background:`${C.purple}22`,border:`1px solid ${C.purple}55`,
              borderRadius:10,padding:"8px 12px",cursor:"pointer",color:C.purple,
              fontSize:11,fontWeight:700}}>
              <span style={{fontSize:15}}>👥</span> Crew
            </button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
          <div><div style={{fontSize:44,fontWeight:900,letterSpacing:-2}}>{f.from}</div>
            <div style={{fontSize:13,color:C.soft}}>{f.dep}</div></div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:20,color:C.muted}}>✈</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4}}>{f.dutyHours}h</div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontSize:44,fontWeight:900,letterSpacing:-2}}>{f.to}</div>
            <div style={{fontSize:13,color:C.soft}}>{f.arr||"–"}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{l:"GATE",v:f.gate||"TBC"},{l:"ROLE",v:f.role},
            {l:"DUTY HRS",v:`${f.dutyHours}h`},
            {l:"SIGN OFF",v:signOff,col:f.overnight?C.amber:C.text}].map(({l,v,col})=>(
            <div key={l} style={{background:C.card2,borderRadius:12,padding:14}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:4}}>{l}</div>
              <div style={{fontSize:14,fontWeight:700,color:col||C.text}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Hotel info if applicable */}
        {(()=>{const h=lookupHotel(f.flightNo,f.date);if(!h)return null;return(
          <div style={{marginTop:14,background:`${C.blue}12`,border:`1px solid ${C.blue}35`,
            borderRadius:16,padding:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:18}}>🏨</span>
              <div>
                <div style={{fontSize:12,color:C.blue,fontWeight:700,letterSpacing:1}}>LAYOVER HOTEL</div>
                <div style={{fontSize:15,fontWeight:800}}>{h.name}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {[{l:"CHECK IN",v:h.checkIn,sub:h.dates},{l:"CHECK OUT",v:h.checkOut,sub:h.nights},
                {l:"PICKUP",v:h.pickup,sub:"Next day"},{l:"PICKUP TO",v:h.pickupTo,sub:"Transport"}].map(({l,v,sub})=>(
                <div key={l} style={{background:C.card,borderRadius:10,padding:10}}>
                  <div style={{fontSize:8,color:C.muted,letterSpacing:1.5,marginBottom:2}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700}}>{v}</div>
                  <div style={{fontSize:9,color:C.soft,marginTop:2}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,
              background:C.card,borderRadius:10,padding:"10px 12px"}}>
              <span style={{fontSize:13}}>📞</span>
              <div>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>HOTEL PHONE</div>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{h.phone}</div>
              </div>
              <div style={{fontSize:10,color:C.soft,marginLeft:"auto"}}>{h.city}</div>
            </div>
          </div>
        );})()}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  IMPORT FLOW
// ═══════════════════════════════════════════════════════════════════
function ImportFlow({onClose,onImport}){
  const [step,  setStep]  =useState("guide");
  const [result,setResult]=useState(null);
  const [err,   setErr]   =useState("");
  const [status,setStatus]=useState("");
  const fileRef=useRef(null);
  const run=useCallback(async file=>{
    setStep("parsing");setErr("");
    try{
      const text=await extractPDFText(file,setStatus);
      setStatus("Parsing roster…");
      const parsed=parseCWPRoster(text);
      if(!parsed.flights.length)throw new Error("No flights found. Is this a CWP PDF?");
      setResult(parsed);setStep("confirm");
    }catch(e){setErr(e.message||String(e));setStep("error");}
  },[]);
  const STEPS=[
    {n:"1",icon:"🌐",col:C.blue,title:"Open Crew Web Portal",
     body:"Tap the button to open CWP in your browser. Log in with your employee credentials. If the portal keeps refreshing, clear your browser cookies and try again.",
     action:{label:"Open Crew Portal →",fn:()=>window.open("https://roc.jetstar.com/CWP_WA/","_blank")}},
    {n:"2",icon:"📅",col:C.accent,title:"Go to Your Roster",body:"Navigate to the roster section. Correct month must be visible."},
    {n:"3",icon:"📥",col:C.green, title:"Save as PDF",body:"Use the portal's PDF export to download your roster."},
    {n:"4",icon:"📂",col:C.purple,title:"Save to Files App",body:'Choose "Save to Files" so it\'s accessible from your iPhone Files app.'},
    {n:"5",icon:"⬆️",col:C.accent,title:"Upload Here",body:"Come back, tap Upload PDF, and select from Files. Reads instantly.",
     action:{label:"Upload PDF →",fn:()=>setStep("upload")}},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"#000000ED",backdropFilter:"blur(16px)",
      zIndex:100,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"54px 24px 18px",display:"flex",alignItems:"center",
        justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div>
          <div style={{fontSize:10,color:C.soft,letterSpacing:3,marginBottom:4}}>CREWMATE</div>
          <div style={{fontSize:22,fontWeight:800}}>
            {{guide:"Import Roster",upload:"Upload PDF",parsing:"Reading…",confirm:"Confirm Import",error:"Import Failed"}[step]}
          </div>
        </div>
        <button onClick={onClose} style={{background:C.card2,border:`1px solid ${C.border}`,
          borderRadius:12,color:"#FF3B30",fontSize:18,width:40,height:40,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"24px 24px 48px"}}>
        {step==="guide"&&(
          <div>
            {STEPS.map(gs=>(
              <div key={gs.n} style={{background:C.card,border:`1px solid ${C.border}`,
                borderRadius:16,padding:"15px 15px 15px 13px",marginBottom:10,
                position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:gs.col}}/>
                <div style={{display:"flex",gap:12}}>
                  <div style={{minWidth:32,height:32,borderRadius:9,background:`${gs.col}20`,
                    border:`1px solid ${gs.col}40`,display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:15,flexShrink:0}}>{gs.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,fontWeight:700,color:gs.col,letterSpacing:1,marginBottom:2}}>STEP {gs.n}</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>{gs.title}</div>
                    <div style={{fontSize:12,color:C.soft,lineHeight:1.6}}>{gs.body}</div>
                    {gs.action&&<button onClick={gs.action.fn} style={{marginTop:10,
                      background:`${gs.col}20`,border:`1px solid ${gs.col}50`,borderRadius:10,
                      padding:"8px 14px",color:gs.col,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                      {gs.action.label}</button>}
                  </div>
                </div>
              </div>
            ))}
            <div style={{marginTop:8,background:`${C.blue}10`,border:`1px solid ${C.blue}30`,
              borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}>
              <span>💡</span>
              <span style={{fontSize:12,color:C.soft}}>Already have your PDF?{" "}
                <button onClick={()=>setStep("upload")} style={{background:"none",border:"none",
                  color:C.blue,fontWeight:700,cursor:"pointer",fontSize:12,padding:0}}>
                  Skip to upload →</button></span>
            </div>
          </div>
        )}
        {step==="upload"&&(
          <div>
            <button onClick={()=>setStep("guide")} style={{background:"none",border:"none",
              color:C.accent,fontSize:13,fontWeight:600,cursor:"pointer",
              padding:"0 0 20px",display:"flex",alignItems:"center",gap:6}}>← Back</button>
            <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${C.accent}55`,
              borderRadius:22,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:`${C.accent}07`}}>
              <div style={{fontSize:52,marginBottom:12}}>📄</div>
              <div style={{fontSize:17,fontWeight:700,marginBottom:8}}>Tap to choose roster PDF</div>
              <div style={{fontSize:12,color:C.soft,lineHeight:1.6,marginBottom:18}}>
                Select the PDF from Crew Web Portal
              </div>
              <div style={{display:"inline-block",background:C.accent,borderRadius:12,
                padding:"11px 26px",color:"#fff",fontSize:13,fontWeight:700}}>Choose from Files</div>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf"
              style={{display:"none"}}
              onChange={e=>{const f=e.target.files?.[0];if(f)run(f);e.target.value="";}}/>
          </div>
        )}
        {step==="parsing"&&(
          <div style={{textAlign:"center",paddingTop:60}}>
            <style>{`@keyframes sp{to{transform:rotate(360deg)}} @keyframes bl{0%,100%{opacity:.15}50%{opacity:1}}`}</style>
            <div style={{fontSize:52,display:"inline-block",animation:"sp 1.5s linear infinite"}}>✈</div>
            <div style={{fontSize:18,fontWeight:800,marginTop:18,marginBottom:8}}>Reading your roster</div>
            <div style={{fontSize:13,color:C.soft}}>{status}</div>
            <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:28}}>
              {[0,1,2,3].map(i=>(
                <div key={i} style={{width:9,height:9,borderRadius:"50%",background:C.accent,
                  animation:`bl 1.4s ease-in-out ${i*0.2}s infinite`}}/>
              ))}
            </div>
          </div>
        )}
        {step==="confirm"&&result&&(
          <div>
            <div style={{background:`linear-gradient(135deg,${C.accent}22,${C.blue}18)`,
              border:`1px solid ${C.accent}40`,borderRadius:18,padding:"18px 20px",marginBottom:18}}>
              <div style={{fontSize:10,color:C.accent,letterSpacing:2,marginBottom:6,fontWeight:700}}>CREW MEMBER</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
                <div style={{fontSize:20,fontWeight:800}}>{result.crewName}</div>
                <div style={{background:`${C.accent}22`,border:`1px solid ${C.accent}50`,
                  borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,color:C.accent}}>
                  {result.crewRole}
                </div>
              </div>
              <div style={{fontSize:12,color:C.soft}}>{result.empId} · the airline</div>
              <div style={{marginTop:12,display:"flex",gap:20,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:1.5}}>FLIGHT HRS</div>
                  <div style={{fontSize:18,fontWeight:700,color:C.blue}}>{result.flightBLH?.toFixed(1)||"–"}h</div>
                </div>
                <div>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:1.5}}>TOTAL PAID HRS</div>
                  <div style={{fontSize:18,fontWeight:700,color:C.accent}}>{result.totalBLH?.toFixed(1)||"–"}h</div>
                </div>
              </div>

            </div>
            {result.flights.map((f,i)=>(
              <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,
                borderRadius:13,padding:"12px 14px",marginBottom:7,
                display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:3,alignSelf:"stretch",borderRadius:2,
                  background:f.overnight?C.amber:C.green,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:13,fontWeight:800,marginRight:8}}>{f.flightNo}</span>
                  <span style={{fontSize:12,color:C.soft}}>
                    {f.from}→{f.to} · {f.dep}–{f.arr||(f.overnight?"next day":"")}
                    {f.signOff&&<span style={{color:C.muted}}> · off {f.signOff}</span>}
                  </span>
                </div>
                <div style={{fontSize:11,color:C.muted}}>{f.date}</div>
              </div>
            ))}
            <button onClick={()=>onImport(result)} style={{width:"100%",background:C.accent,
              border:"none",borderRadius:14,padding:"16px 0",color:"#fff",
              fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:14}}>
              ✓ Import {result.flights.length} Flights
            </button>
          </div>
        )}
        {step==="error"&&(
          <div style={{paddingTop:24}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:44,marginBottom:10}}>⚠️</div>
              <div style={{fontSize:17,fontWeight:700}}>Import Failed</div>
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
              padding:16,marginBottom:18}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:2,marginBottom:8}}>ERROR</div>
              <div style={{fontSize:12,color:"#FF9F7A",lineHeight:1.7,
                wordBreak:"break-all",fontFamily:"monospace"}}>{err}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep("guide")} style={{flex:1,background:C.card2,
                border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 0",
                color:C.soft,fontSize:13,fontWeight:600,cursor:"pointer"}}>← Guide</button>
              <button onClick={()=>{setErr("");setStep("upload");}} style={{flex:2,
                background:C.accent,border:"none",borderRadius:14,padding:"13px 0",
                color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Try Again →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  HOURS + FINANCE TAB
// ═══════════════════════════════════════════════════════════════════
function HoursTab({roster,totalDuty,crew,pay,setPay,bills,setBills,agenda}){
  const [view,     setView]   =useState("pay");
  const [editPay,  setEditPay]=useState(false);
  const [draft,    setDraft]  =useState(pay);
  const [addingBill,setAdding]=useState(false);
  const [newBill,  setNewBill]=useState({name:"",amount:"",freq:"monthly"});

  // Total paid hours (RGD/PHO already counted in totalBLH by parser)
  const totalPaidHours=crew.totalBLH||totalDuty;
  const targetPay=pay.targetPay||5000;
  const targetHours=pay.targetHours||80;
  // AVL (Home Available Reserve) paid at standby rate × 7.5h per day
  const avlDays=Object.values(agenda).reduce((n,items)=>
    n+items.filter(i=>i.type==="duty"&&i.code==="AVL").length,0);
  const avlEarned=avlDays*(pay.sbRate||0)*7.5;
  const earned=totalPaidHours*pay.rate + avlEarned;
  const pLeft=Math.max(0,targetPay-earned);
  const hLeft=Math.max(0,targetHours-totalPaidHours);
  const pct=Math.min((earned/targetPay)*100,100);
  const r=60,circ=2*Math.PI*r,dash=(pct/100)*circ;

  const monthlyBills=bills.reduce((s,b)=>{
    if(b.freq==="weekly")return s+b.amount*52/12;
    if(b.freq==="fortnightly")return s+b.amount*26/12;
    return s+b.amount;
  },0);
  const leftover=earned-monthlyBills;
  const savePay=()=>{
    setPay(draft);
    setEditPay(false);
    try{localStorage.setItem("crewmate_pay",JSON.stringify(draft));}catch(e){}
  };
  const deleteBill=id=>setBills(bs=>bs.filter(b=>b.id!==id));
  const addBill=()=>{
    if(!newBill.name||!newBill.amount)return;
    setBills(bs=>[...bs,{id:Date.now(),name:newBill.name,amount:parseFloat(newBill.amount),freq:newBill.freq}]);
    setNewBill({name:"",amount:"",freq:"monthly"});setAdding(false);
  };

  return(
    <div>
      <div style={{display:"flex",background:C.card,borderRadius:12,padding:4,marginBottom:18}}>
        {[{k:"pay",l:"PAY"},{k:"finance",l:"FINANCES"}].map(({k,l})=>(
          <button key={k} onClick={()=>setView(k)} style={{flex:1,padding:"9px 0",borderRadius:9,
            border:"none",background:view===k?C.card2:"transparent",
            color:view===k?C.text:C.muted,fontSize:10,fontWeight:700,letterSpacing:2,cursor:"pointer",
            boxShadow:view===k?`inset 0 0 0 1px ${C.border}`:"none",transition:"all .15s"}}>{l}</button>
        ))}
      </div>

      {view==="pay"&&(
        <div>
          <div style={{background:C.card,borderRadius:16,padding:"13px 18px",
            border:`1px solid ${C.border}`,marginBottom:12,
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:40,height:40,borderRadius:"50%",
              background:`linear-gradient(135deg,${C.accent},${C.blue})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:15,fontWeight:800,color:"#fff",flexShrink:0}}>
              {crew.crewName?.[0]||"R"}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700}}>{crew.crewName}</div>
              <div style={{fontSize:11,color:C.soft}}>{crew.empId} · {crew.role}{pay.airline?` · ${pay.airline}`:""}</div>
            </div>
            <button onClick={()=>{setDraft(pay);setEditPay(true);}} style={{
              background:`${C.accent}18`,border:`1px solid ${C.accent}40`,
              borderRadius:9,padding:"6px 12px",color:C.accent,
              fontSize:11,fontWeight:700,cursor:"pointer"}}>Edit</button>
          </div>

          {editPay&&(
            <div style={{background:C.card2,borderRadius:16,padding:18,
              border:`1px solid ${C.accent}50`,marginBottom:12}}>
              <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:1,marginBottom:14}}>EDIT PAY SETTINGS</div>
              {[{k:"rate",l:"Hourly Rate ($/hr)",prefix:"$"},
                {k:"targetHours",l:"Target Hours",prefix:""},
                {k:"targetPay",l:"Pay Target ($/period)",prefix:"$"}].map(({k,l,prefix})=>(
                <div key={k} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.soft,marginBottom:5}}>{l}</div>
                  <div style={{position:"relative"}}>
                    {prefix&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.soft,fontSize:14}}>{prefix}</span>}
                    <input type="number" value={draft[k]}
                      onChange={e=>setDraft(d=>({...d,[k]:parseFloat(e.target.value)||0}))}
                      style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,
                        borderRadius:10,padding:`11px 12px 11px ${prefix?"28px":"12px"}`,
                        color:C.text,fontSize:14,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={()=>setEditPay(false)} style={{flex:1,background:C.card,
                  border:`1px solid ${C.border}`,borderRadius:11,padding:"12px 0",
                  color:C.soft,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={savePay} style={{flex:2,background:C.accent,border:"none",
                  borderRadius:11,padding:"12px 0",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Save</button>
              </div>
            </div>
          )}

          {/* Pay breakdown */}
          <div style={{background:C.card,borderRadius:16,padding:"14px 18px",
            border:`1px solid ${C.border}`,marginBottom:12}}>
            <div style={{fontSize:10,color:C.soft,letterSpacing:2,marginBottom:12}}>HOURS BREAKDOWN</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                {l:"FLIGHT HRS",v:`${(crew.flightBLH||0).toFixed(1)}h`,c:C.green},
                {l:"TOTAL PAID",v:`${totalPaidHours.toFixed(1)}h`,c:C.accent},
              ].map(({l,v,c})=>(
                <div key={l} style={{background:C.card2,borderRadius:10,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:8,color:C.muted,letterSpacing:1.5,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:C.card,borderRadius:22,padding:24,border:`1px solid ${C.border}`,
            marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{position:"relative",width:160,height:160}}>
              <svg width={160} height={160} style={{transform:"rotate(-90deg)"}}>
                <circle cx={80} cy={80} r={r} fill="none" stroke={C.card2} strokeWidth={10}/>
                <circle cx={80} cy={80} r={r} fill="none" stroke={C.accent} strokeWidth={10}
                  strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                  style={{transition:"stroke-dasharray 1s",filter:`drop-shadow(0 0 5px ${C.accent})`}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:26,fontWeight:900,letterSpacing:-1,color:C.accent}}>
                  ${Math.round(earned).toLocaleString()}
                </div>
                <div style={{fontSize:10,color:C.soft}}>of ${targetPay.toLocaleString()}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:16,width:"100%",marginTop:16}}>
              {[{l:"PAID HRS",v:`${totalPaidHours.toFixed(1)}h`,c:C.accent},
                {l:"TO TARGET $",v:`$${Math.round(pLeft).toLocaleString()}`,c:C.soft},
                {l:"SECTORS",v:roster.length,c:C.blue}].map(({l,v,c})=>(
                <div key={l} style={{flex:1,textAlign:"center"}}>
                  <div style={{fontSize:8,color:C.muted,letterSpacing:1.5,marginBottom:2}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:C.card,borderRadius:18,padding:20,border:`1px solid ${C.border}`,marginBottom:12}}>
            <div style={{fontSize:10,color:C.soft,letterSpacing:2,marginBottom:14}}>PAY THIS PERIOD</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:3}}>ESTIMATED EARNED</div>
              <div style={{fontSize:32,fontWeight:900,letterSpacing:-1.5,color:C.accent}}>
                ${Math.round(earned).toLocaleString()}
                <span style={{fontSize:12,color:C.soft,fontWeight:400}}> NZD</span>
              </div>
            </div>
            <div style={{height:1,background:C.border,marginBottom:14}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[{l:"PAY TARGET",v:`$${targetPay.toLocaleString()}`},
                {l:"STILL TO EARN",v:`$${Math.round(pLeft).toLocaleString()}`},
                {l:"HOURLY RATE",v:`$${pay.rate.toFixed(2)}`},
                {l:"STANDBY RATE",v:`$${(pay.sbRate||0).toFixed(2)}`},
                {l:"HOURS TARGET",v:`${targetHours}h`},
                {l:"AIRLINE",v:pay.airline||"–"}].map(({l,v})=>(
                <div key={l} style={{background:C.card2,borderRadius:11,padding:13}}>
                  <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:14,fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            {avlDays>0&&(
              <div style={{background:`${C.green}10`,border:`1px solid ${C.green}30`,
                borderRadius:11,padding:13,marginBottom:12}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:3}}>
                  📲 HOME STANDBY (AVL)
                </div>
                <div style={{fontSize:14,fontWeight:700,color:C.green}}>
                  +${Math.round(avlEarned).toLocaleString()}
                  <span style={{fontSize:10,color:C.soft,fontWeight:400}}>
                    {" "}· {avlDays} day{avlDays>1?"s":""} × 7.5h × ${(pay.sbRate||0).toFixed(2)}/hr
                  </span>
                </div>
              </div>
            )}
            <div style={{background:C.card2,borderRadius:11,padding:13,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:4}}>ALLOWANCES & OTHER PAY</div>
              <div style={{fontSize:11,color:C.soft,lineHeight:1.6}}>
                Duty hours calculation only. Variable allowances (meal, overnight, international) are not included as they fluctuate per sector.
              </div>
            </div>
          </div>

          {pLeft>0&&(
            <div style={{background:`${C.accent}15`,border:`1px solid ${C.accent}35`,borderRadius:14,padding:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>💡 ${Math.round(pLeft).toLocaleString()} to pay target</div>
              <div style={{fontSize:12,color:C.soft,lineHeight:1.6}}>
                Approx {hLeft.toFixed(1)} more hours. Picking up a sector brings you closer.
              </div>
            </div>
          )}
        </div>
      )}

      {view==="finance"&&(
        <div>
          <div style={{background:`linear-gradient(135deg,${C.card},${C.card2})`,borderRadius:18,padding:20,border:`1px solid ${C.border}`,marginBottom:14}}>
            <div style={{fontSize:10,color:C.soft,letterSpacing:2,marginBottom:14}}>MONTHLY SNAPSHOT</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:C.card,borderRadius:12,padding:14,border:`1px solid ${C.green}40`}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:4}}>ESTIMATED PAY</div>
                <div style={{fontSize:20,fontWeight:800,color:C.green}}>${Math.round(earned).toLocaleString()}</div>
              </div>
              <div style={{background:C.card,borderRadius:12,padding:14,border:`1px solid ${C.red}40`}}>
                <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:4}}>TOTAL BILLS</div>
                <div style={{fontSize:20,fontWeight:800,color:C.red}}>${Math.round(monthlyBills).toLocaleString()}</div>
              </div>
            </div>
            <div style={{background:C.card,borderRadius:12,padding:14,border:`1px solid ${leftover>=0?C.green:C.red}40`}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1.5,marginBottom:4}}>{leftover>=0?"LEFT AFTER BILLS":"SHORTFALL"}</div>
              <div style={{fontSize:24,fontWeight:900,color:leftover>=0?C.green:C.red}}>
                {leftover<0?"-":""}${Math.abs(Math.round(leftover)).toLocaleString()}
                <span style={{fontSize:11,color:C.soft,fontWeight:400}}> NZD/mo</span>
              </div>
              <div style={{marginTop:10,background:C.card2,borderRadius:6,height:5,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:6,width:`${Math.min(100,(monthlyBills/Math.max(earned,1))*100)}%`,
                  background:leftover>=0?`linear-gradient(90deg,${C.green},${C.blue})`:`linear-gradient(90deg,${C.red},${C.amber})`,transition:"width .8s"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                <div style={{fontSize:9,color:C.soft}}>{Math.round((monthlyBills/Math.max(earned,1))*100)}% of income</div>
                <div style={{fontSize:9,color:C.soft}}>{Math.round(100-(monthlyBills/Math.max(earned,1))*100)}% remaining</div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,color:C.soft,letterSpacing:2}}>BILLS & EXPENSES</div>
            <button onClick={()=>setAdding(true)} style={{background:`${C.blue}18`,border:`1px solid ${C.blue}40`,
              borderRadius:9,padding:"5px 12px",color:C.blue,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add</button>
          </div>
          {addingBill&&(
            <div style={{background:C.card2,borderRadius:14,padding:16,border:`1px solid ${C.blue}40`,marginBottom:12}}>
              <div style={{fontSize:11,color:C.blue,fontWeight:700,letterSpacing:1,marginBottom:12}}>NEW EXPENSE</div>
              <input placeholder="Name (e.g. Rent)" value={newBill.name}
                onChange={e=>setNewBill(b=>({...b,name:e.target.value}))}
                style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:9,padding:"10px 12px",color:C.text,fontSize:13,
                  outline:"none",marginBottom:8,boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.soft}}>$</span>
                  <input placeholder="Amount" type="number" value={newBill.amount}
                    onChange={e=>setNewBill(b=>({...b,amount:e.target.value}))}
                    style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,
                      borderRadius:9,padding:"10px 10px 10px 22px",color:C.text,
                      fontSize:13,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <select value={newBill.freq} onChange={e=>setNewBill(b=>({...b,freq:e.target.value}))}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:9,
                    padding:"10px 12px",color:C.text,fontSize:13,outline:"none",cursor:"pointer"}}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setAdding(false)} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:10,padding:"11px 0",color:C.soft,fontSize:12,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button onClick={addBill} style={{flex:2,background:C.blue,border:"none",borderRadius:10,
                  padding:"11px 0",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Add Expense</button>
              </div>
            </div>
          )}
          {bills.map(bill=>{
            const monthly=bill.freq==="weekly"?bill.amount*52/12:bill.freq==="fortnightly"?bill.amount*26/12:bill.amount;
            const pctB=Math.min(100,(monthly/Math.max(earned,1))*100);
            return(
              <div key={bill.id} style={{background:C.card,borderRadius:14,padding:"13px 16px",marginBottom:8,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700}}>{bill.name}</div>
                    <div style={{fontSize:11,color:C.soft,marginTop:2}}>
                      ${bill.amount.toFixed(0)} / {bill.freq}
                      {bill.freq!=="monthly"&&<span style={{color:C.muted}}> · ${Math.round(monthly)}/mo</span>}
                    </div>
                  </div>
                  <button onClick={()=>deleteBill(bill.id)} style={{background:"none",border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"4px 10px",color:"#FF3B30",fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
                <div style={{background:C.card2,borderRadius:4,height:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pctB}%`,borderRadius:4,
                    background:`linear-gradient(90deg,${C.red},${C.amber})`,transition:"width .5s"}}/>
                </div>
                <div style={{fontSize:9,color:C.muted,marginTop:4}}>{pctB.toFixed(1)}% of current pay</div>
              </div>
            );
          })}
          {bills.length===0&&!addingBill&&(
            <div style={{textAlign:"center",padding:"30px 0",color:C.muted,fontSize:13}}>
              No expenses added yet.<br/>Tap + Add to start tracking.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
