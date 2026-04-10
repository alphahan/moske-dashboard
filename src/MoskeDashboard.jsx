import { useState, useEffect, useRef, useCallback } from "react";

const SHEETS = {
  members: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=Medlemmer",
  board:   "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=Bestyrelse",
  news:    "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/gviz/tq?tqx=out:csv&sheet=Nyheder",
};

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=55.4761&longitude=8.4594" +
  "&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m" +
  "&wind_speed_unit=ms&timezone=Europe%2FCopenhagen";

const PRAYER_URL =
  "https://api.aladhan.com/v1/timingsByCity?city=Esbjerg&country=Denmark&method=3";

const WMO_ICONS = {
  0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",51:"🌦",53:"🌦",55:"🌧",
  61:"🌧",63:"🌧",65:"🌧",71:"🌨",73:"🌨",75:"❄️",80:"🌦",81:"🌧",
  82:"⛈",95:"⛈",96:"⛈",99:"⛈",
};
const WMO_TR = {
  0:"Açık",1:"Az Bulutlu",2:"Parçalı Bulutlu",3:"Bulutlu",45:"Sisli",48:"Sisli",
  51:"Hafif Yağmurlu",53:"Yağmurlu",55:"Kuvvetli Yağmur",61:"Hafif Yağmurlu",
  63:"Yağmurlu",65:"Kuvvetli Yağmur",71:"Hafif Karlı",73:"Karlı",75:"Yoğun Kar",
  80:"Sağanak",81:"Kuvvetli Sağanak",82:"Şiddetli Sağanak",95:"Gök Gürültülü",
  96:"Fırtına",99:"Fırtına",
};
const WMO_DA = {
  0:"Klar himmel",1:"Mest klart",2:"Delvis skyet",3:"Overskyet",45:"Tåge",48:"Tåge",
  51:"Let regn",53:"Regn",55:"Kraftig regn",61:"Let regn",63:"Regn",65:"Kraftig regn",
  71:"Let sne",73:"Sne",75:"Kraftig sne",80:"Byger",81:"Kraftige byger",
  82:"Voldsomme byger",95:"Tordenvejr",96:"Tordenvejr",99:"Tordenvejr",
};

const PRAYER_SLOTS = [
  { key:"Imsak",   tr:"İmsak",   da:"Imsak"           },
  { key:"Dhuhr",   tr:"Öğle",    da:"Middagsbøn"       },
  { key:"Asr",     tr:"İkindi",  da:"Eftermiddagsbøn"  },
  { key:"Maghrib", tr:"Akşam",   da:"Aftenbøn"         },
  { key:"Isha",    tr:"Yatsı",   da:"Nattebøn"         },
];
const NEXT_KEYS = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];

const BOARD_ROLES_DA = {
  "Başkan":              "Formand",
  "Başkan Yardımcısı":   "Næstformand",
  "Sayman":              "Kasserer",
  "Sayman Yardımcısı":   "Kasserer Assistent",
  "Sekreter":            "Sekretær",
  "Sekreter Yardımcısı": "Sekretær Assistent",
  "Kadın Kol Başkanı":   "Kvindeligt Udvalg",
  "Gençler Başkanı":     "Ungdomsformand",
  "Çocuk Başkanı":       "Børneformand",
};

const YEARS = ["2025","2026 (1-6)","2026 (7-12)"];
const SCROLL_PPS = 38;

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim());
  return lines.slice(1).map(line=>{
    const vals=[]; let cur="",inQ=false;
    for (const ch of line){
      if (ch==='"'){inQ=!inQ;continue;}
      if (ch===","&&!inQ){vals.push(cur.trim());cur="";continue;}
      cur+=ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h,i)=>[h,vals[i]??""]));
  });
}

function sortByLastName(members) {
  return [...members].sort((a,b)=>{
    const last=n=>{const p=(n.Navn||"").trim().split(" ");return p.length>1?p[p.length-1]:p[0];};
    const la=last(a),lb=last(b);
    if (la!==lb) return la.localeCompare(lb,"tr");
    return (a.Navn||"").localeCompare(b.Navn||"","tr");
  });
}

function parseEventDate(str) {
  if (!str) return null;
  const m=str.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (!m) return null;
  const y=m[3].length===2?2000+parseInt(m[3]):parseInt(m[3]);
  return new Date(y,parseInt(m[2])-1,parseInt(m[1]));
}

function toMin(t){if(!t)return 9999;const[h,m]=t.split(":").map(Number);return h*60+m;}

function minsUntil(t){
  if(!t)return null;
  const now=new Date();
  const nowMin=now.getHours()*60+now.getMinutes();
  let diff=toMin(t)-nowMin;
  if(diff<0)diff+=1440;
  return diff;
}

function fmtMins(m){
  if(m===null)return"–";
  if(m>=60)return`${Math.floor(m/60)}t ${m%60}m`;
  return`${m}m`;
}

const DEMO_MEMBERS = [
  "Ali Duran","Kadir Duran","Yusuf Duran","Batuhan Sezer","Mustafa Sezer",
  "Ahmet Kaya","Mehmet Kaya","Hüseyin Kaya","Osman Arslan","Veysel Arslan",
  "İbrahim Çelik","Hasan Çelik","Sefa Taşkın","Emircan Tetik","Cenk Boz",
  "Eray Güzel","Tolunay Keskin","Samet Demirtaş","Burhan Eroğlu","Taha İnce",
  "Rüzgar Korkmaz","Doruk Bayraktar","Ufuk Özbay","Salih Ertuğrul","Aytaç Gökmen",
  "Serdar Albayrak","Doğukan Çakır","Taner Arı","Berkay Saygın","Metin Aydınlı",
].map((Navn,i)=>({
  No:String(i+1),Navn,
  "2025":        i%5===0?"Ikke betalt":"Betalt",
  "2026 (1-6)":  i%7===0?"Ikke betalt":i%11===0?"":"Betalt",
  "2026 (7-12)": i%3===0?"Ikke betalt":i%9===0?"":"Betalt",
}));

const DEMO_NEWS=[
  {Titel:"Cigkofte & Ayran – 40 kr",Dato:"07/11/2026",
   Tekst:"Fredag kl. 14.00 vil der blive solgt cigkofte og ayran efter fredagsbønnen.",
   TurkishTitel:"Çiğköfte & Ayran – 40 kr",
   TurkishTekst:"Cuma namazından sonra saat 14.00'te çiğköfte ve ayran satılacaktır."},
  {Titel:"Cityjump tur for børnene",Dato:"09/11/2026",
   Tekst:"Søndag kl. 15.00–17.00. Tilmelding senest fredag til bestyrelsen.",
   TurkishTitel:"Çocuklar için Cityjump",
   TurkishTekst:"Pazar 15.00–17.00. En geç Cuma günü yönetime kayıt yaptırın."},
  {Titel:"Generalforsamling",Dato:"15/11/2026",
   Tekst:"Årets generalforsamling afholdes i moskeen kl. 19.00.",
   TurkishTitel:"Genel Kurul Toplantısı",
   TurkishTekst:"Yıllık genel kurul camide saat 19.00'da yapılacaktır."},
  {Titel:"Koran kursus starter",Dato:"22/11/2026",
   Tekst:"Nyt koran kursus for børn 8–14 år. Lørdage kl. 10.00.",
   TurkishTitel:"Kuran Kursu Başlıyor",
   TurkishTekst:"8-14 yaş çocuklar için yeni Kuran kursu. Cumartesi 10.00."},
  {Titel:"Fællesspisning",Dato:"29/11/2026",
   Tekst:"Månedlig fællesspisning efter Maghrib bønnen. Alle er velkomne.",
   TurkishTitel:"Toplu Yemek",
   TurkishTekst:"Akşam namazından sonra aylık toplu yemek. Herkes davetlidir."},
  {Titel:"Nytårsfest",Dato:"10/01/2027",
   Tekst:"Fejring af det nye år med familie og venner i moskeens festsal.",
   TurkishTitel:"Yeni Yıl Kutlaması",
   TurkishTekst:"Caminin salonunda aile ve arkadaşlarla yeni yıl kutlaması."},
];

const DEMO_BOARD=[
  {Rolle:"Başkan",              Navn:"Ahmed Yılmaz",   Telefon:"12 34 56 78"},
  {Rolle:"Başkan Yardımcısı",   Navn:"Mehmet Kaya",    Telefon:"12 34 56 78"},
  {Rolle:"Sayman",              Navn:"Mustafa Demir",  Telefon:"12 34 56 78"},
  {Rolle:"Sayman Yardımcısı",   Navn:"Hasan Çelik",    Telefon:"12 34 56 78"},
  {Rolle:"Sekreter",            Navn:"İbrahim Arslan", Telefon:"12 34 56 78"},
  {Rolle:"Sekreter Yardımcısı", Navn:"Osman Şahin",    Telefon:"12 34 56 78"},
  {Rolle:"Kadın Kol Başkanı",   Navn:"Fatma Yıldız",   Telefon:"12 34 56 78"},
  {Rolle:"Gençler Başkanı",     Navn:"Emre Öztürk",    Telefon:"12 34 56 78"},
  {Rolle:"Çocuk Başkanı",       Navn:"Zeynep Aydın",   Telefon:"12 34 56 78"},
];

export default function MoskeDashboard() {
  const [time,       setTime]       = useState(new Date());
  const [weather,    setWeather]    = useState(null);
  const [prayers,    setPrayers]    = useState(null);
  const [nextPrayer, setNextPrayer] = useState(null);
  const [minsLeft,   setMinsLeft]   = useState(null);
  const [members,    setMembers]    = useState(sortByLastName(DEMO_MEMBERS));
  const [news,       setNews]       = useState(DEMO_NEWS);
  const [board,      setBoard]      = useState(DEMO_BOARD);

  const scrollRef = useRef(null);
  const animRef   = useRef(null);
  const posRef    = useRef(0);
  const lastTRef  = useRef(null);

  useEffect(()=>{
    const id=setInterval(()=>setTime(new Date()),1000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    const load=()=>fetch(WEATHER_URL).then(r=>r.json()).then(d=>setWeather(d.current)).catch(()=>{});
    load();
    const id=setInterval(load,600000);
    return ()=>clearInterval(id);
  },[]);

  const fetchPrayers=useCallback(()=>{
    fetch(PRAYER_URL).then(r=>r.json()).then(d=>setPrayers(d.data?.timings??null)).catch(()=>{});
  },[]);
  useEffect(()=>{
    fetchPrayers();
    const now=new Date();
    const msToMidnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now;
    const t=setTimeout(()=>{fetchPrayers();setInterval(fetchPrayers,86400000);},msToMidnight);
    return ()=>clearTimeout(t);
  },[fetchPrayers]);

  useEffect(()=>{
    if(!prayers)return;
    const nowMin=time.getHours()*60+time.getMinutes();
    let found=null;
    for(const p of NEXT_KEYS){if(prayers[p]&&toMin(prayers[p])>nowMin){found=p;break;}}
    if(!found)found=NEXT_KEYS[0];
    setNextPrayer(found);
    setMinsLeft(minsUntil(prayers[found]));
  },[prayers,time]);

  const fetchSheet=useCallback((url,setter,demo,transform)=>{
    if(url.includes("YOUR_SHEET_ID"))return;
    fetch(url).then(r=>r.text()).then(t=>{
      const rows=parseCSV(t);
      if(rows.length)setter(transform?transform(rows):rows);
    }).catch(()=>setter(demo));
  },[]);

  useEffect(()=>{
    const load=()=>{
      fetchSheet(SHEETS.members,setMembers,DEMO_MEMBERS,r=>sortByLastName(r));
      fetchSheet(SHEETS.board,setBoard,DEMO_BOARD);
      fetchSheet(SHEETS.news,setNews,DEMO_NEWS);
    };
    load();
    const id=setInterval(load,60000);
    return ()=>clearInterval(id);
  },[fetchSheet]);

  useEffect(()=>{
    const el=scrollRef.current;
    if(!el)return;
    posRef.current=0;lastTRef.current=null;
    const tick=ts=>{
      if(lastTRef.current!==null){
        const dt=(ts-lastTRef.current)/1000;
        posRef.current+=SCROLL_PPS*dt;
        const half=el.scrollHeight/2;
        if(posRef.current>=half)posRef.current-=half;
        el.scrollTop=posRef.current;
      }
      lastTRef.current=ts;
      animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(animRef.current);
  },[members]);

  const today=new Date();today.setHours(0,0,0,0);
  const upcomingNews=[...news]
    .map(n=>({...n,_date:parseEventDate(n.Dato)}))
    .filter(n=>n._date&&n._date>=today)
    .sort((a,b)=>a._date-b._date)
    .slice(0,5);

  const fmtClock=d=>d.toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const fmtFullDate=d=>d.toLocaleDateString("da-DK",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const fmtEventDate=str=>{
    const d=parseEventDate(str);if(!d)return str;
    return d.toLocaleDateString("da-DK",{weekday:"short",day:"numeric",month:"short"});
  };

  const nowMin=time.getHours()*60+time.getMinutes();
  const nextSlot=PRAYER_SLOTS.find(p=>p.key===nextPrayer);

  return (
    <div style={s.root}>

      {/* TOP BAR */}
      <header style={s.topbar}>
        <div style={s.topLeft}>
          <span style={s.mosqueName}>🕌 Esbjerg Anatoliens Moske</span>
          <span style={s.dateStr}>{fmtFullDate(time)}</span>
        </div>

        <div style={s.weatherWidget}>
          <span style={{fontSize:40,lineHeight:1}}>
            {weather?(WMO_ICONS[weather.weathercode]??"🌡"):"🌡"}
          </span>
          <div style={s.weatherCenter}>
            <span style={s.weatherTemp}>
              {weather?`${Math.round(weather.temperature_2m)}°C`:"–°C"}
            </span>
            <span style={s.weatherDesc}>
              {weather
                ?`${WMO_TR[weather.weathercode]??""} · ${WMO_DA[weather.weathercode]??""}`
                :"Henter vejr…"}
            </span>
            <div style={s.weatherRow2}>
              {weather?.windspeed_10m!=null&&<span>💨 {Math.round(weather.windspeed_10m)} m/s</span>}
              {weather?.relative_humidity_2m!=null&&<span>💧 {Math.round(weather.relative_humidity_2m)}%</span>}
              <span style={s.inlineClock}>{fmtClock(time)}</span>
            </div>
          </div>
        </div>

        <div style={s.countdownBlock}>
          <span style={s.countdownLabel}>Sonraki namaza · Næste bøn om</span>
          <span style={s.countdownMins}>{fmtMins(minsLeft)}</span>
          <span style={s.countdownName}>
            {nextSlot?`${nextSlot.tr} · ${nextSlot.da}`:"–"}
          </span>
          {nextSlot&&prayers?.[nextSlot.key]&&(
            <span style={s.countdownTime}>kl. {prayers[nextSlot.key]}</span>
          )}
        </div>
      </header>

      {/* MAIN */}
      <main style={s.main}>

        {/* LEFT */}
        <section style={s.leftPanel}>

          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Kommende arrangementer · Yaklaşan Etkinlikler</span>
          </div>
          <div style={s.eventsList}>
            {upcomingNews.length===0&&(
              <div style={s.emptyMsg}>Ingen kommende arrangementer · Yaklaşan etkinlik yok</div>
            )}
            {upcomingNews.map((n,i)=>(
              <div key={i} style={s.eventCard}>
                <div style={s.eventBadge}>{fmtEventDate(n.Dato)}</div>
                <div style={s.eventContent}>
                  <div style={s.eventTitle}>{n.Titel}</div>
                  {n.TurkishTitel&&n.TurkishTitel!==n.Titel&&
                    <div style={s.eventTitleTR}>{n.TurkishTitel}</div>}
                  {n.Tekst&&<div style={s.eventBody}>{n.Tekst}</div>}
                  {n.TurkishTekst&&
                    <div style={{...s.eventBody,color:"#8a7455",fontStyle:"italic"}}>
                      {n.TurkishTekst}
                    </div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{flex:1}}/>

          {/* Prayer times */}
          <div style={s.prayerBox}>
            <div style={s.prayerBoxTitle}>Bugünkü Namaz Vakitleri · Bøntider i dag</div>
            <div style={s.prayerGrid}>
              {PRAYER_SLOTS.map(({key,tr,da})=>{
                const timeStr=prayers?.[key]??"–";
                const isNext=nextPrayer===key;
                const isPast=prayers&&prayers[key]&&toMin(prayers[key])<nowMin&&!isNext;
                return (
                  <div key={key} style={{...s.prayerRow,...(isNext?s.prayerRowNext:{}),...(isPast?s.prayerRowPast:{})}}>
                    <div style={s.prayerNames}>
                      <span style={{...s.prayerTR,...(isNext?{color:"#c8952a"}:{})}}>{tr}</span>
                      <span style={s.prayerDA}>{da}</span>
                    </div>
                    <span style={{...s.prayerTimeVal,...(isNext?{color:"#c8952a",fontWeight:700}:{})}}>
                      {timeStr}
                    </span>
                    {isNext&&<span style={s.prayerDot}/>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Board */}
          <div style={s.boardBox}>
            <div style={s.boardTitle}>Yönetim Kurulu · Bestyrelsen</div>
            <div style={s.boardGrid}>
              {board.map((b,i)=>(
                <div key={i} style={s.boardMember}>
                  <div style={s.boardRoleTR}>{b.Rolle}</div>
                  <div style={s.boardRoleDA}>{BOARD_ROLES_DA[b.Rolle]??""}</div>
                  <div style={s.boardName}>{b.Navn}</div>
                  {b.Telefon&&<div style={s.boardPhone}>{b.Telefon}</div>}
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* RIGHT: Members */}
        <section style={s.rightPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Medlemmer · Üyeler</span>
            <span style={s.panelSub}>{members.length} i alt · alfabetisk efter efternavn</span>
          </div>

          <div style={s.tableHead}>
            <span style={{...s.col,...s.colNo}}>#</span>
            <span style={{...s.col,flex:1}}>Navn / İsim</span>
            {YEARS.map(y=>(
              <span key={y} style={{...s.col,...s.colYear}}>{y}</span>
            ))}
          </div>

          <div style={s.scrollWrap} ref={scrollRef}>
            {[...members,...members].map((m,i)=>(
              <div key={i} style={{...s.tableRow,background:i%2===0?"#faf8f5":"#fff"}}>
                <span style={{...s.col,...s.colNo,color:"#b0a080"}}>{m.No}</span>
                <span style={{...s.col,flex:1,fontWeight:500,color:"#2d2416"}}>{m.Navn}</span>
                {YEARS.map(y=>(
                  <span key={y} style={{...s.col,...s.colYear}}>
                    <StatusBadge val={m[y]}/>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

function StatusBadge({val}){
  if(!val||val==="")      return <span style={{...bd,...bdGray}}>–</span>;
  if(val==="Betalt")      return <span style={{...bd,...bdGreen}}>✓ Betalt</span>;
  if(val==="Ikke betalt") return <span style={{...bd,...bdRed}}>✗ Ikke betalt</span>;
  return <span style={{...bd,...bdGray}}>{val}</span>;
}
const bd      ={fontSize:12,fontWeight:600,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap"};
const bdGreen ={background:"#d4f0dc",color:"#1a6b34"};
const bdRed   ={background:"#fde0e0",color:"#9b2020"};
const bdGray  ={background:"#ede8de",color:"#7a6b50"};

const s={
  root:{fontFamily:"'Noto Sans','Segoe UI',sans-serif",background:"#f5f0e8",height:"100vh",display:"flex",flexDirection:"column",color:"#2d2416",overflow:"hidden"},
  topbar:{background:"#2e2010",color:"#f5f0e8",padding:"12px 36px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:24,flexShrink:0},
  topLeft:{display:"flex",flexDirection:"column",gap:2,flex:"0 0 auto"},
  mosqueName:{fontSize:24,fontWeight:700,color:"#f5c87a",letterSpacing:"0.01em"},
  dateStr:{fontSize:14,color:"#c8b89a",textTransform:"capitalize"},
  weatherWidget:{flex:"0 0 400px",display:"flex",alignItems:"center",gap:16,background:"rgba(255,255,255,0.09)",borderRadius:14,padding:"12px 22px"},
  weatherCenter:{display:"flex",flexDirection:"column",gap:3},
  weatherTemp:{fontSize:30,fontWeight:700,color:"#f5c87a",lineHeight:1},
  weatherDesc:{fontSize:14,color:"#e8d8b0",fontWeight:500},
  weatherRow2:{display:"flex",gap:14,fontSize:13,color:"#c8b89a",alignItems:"center",marginTop:2},
  inlineClock:{fontSize:20,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums",marginLeft:4},
  countdownBlock:{flex:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"flex-end",background:"rgba(200,149,42,0.20)",borderRadius:14,padding:"10px 22px",borderLeft:"3px solid #c8952a"},
  countdownLabel:{fontSize:11,color:"#c8b060",textTransform:"uppercase",letterSpacing:"0.07em"},
  countdownMins:{fontSize:44,fontWeight:700,color:"#f5c87a",fontVariantNumeric:"tabular-nums",lineHeight:1.05},
  countdownName:{fontSize:17,fontWeight:700,color:"#e8d0a0",marginTop:2},
  countdownTime:{fontSize:14,color:"#b89860",marginTop:1},
  main:{display:"flex",flex:1,overflow:"hidden"},
  leftPanel:{width:"50%",borderRight:"2px solid #e0d5c0",display:"flex",flexDirection:"column",overflow:"hidden",background:"#faf8f5"},
  rightPanel:{width:"50%",display:"flex",flexDirection:"column",overflow:"hidden",background:"#fff"},
  panelHeader:{padding:"12px 22px 10px",borderBottom:"1px solid #e8e0d0",display:"flex",alignItems:"baseline",gap:12,background:"#f0ead8",flexShrink:0},
  panelTitle:{fontSize:18,fontWeight:700,color:"#2e2010"},
  panelSub:{fontSize:12,color:"#a08060"},
  eventsList:{padding:"12px 18px",display:"flex",flexDirection:"column",gap:10,flexShrink:0},
  emptyMsg:{fontSize:14,color:"#a08060",padding:"8px 4px"},
  eventCard:{display:"flex",gap:12,background:"#fff",borderRadius:9,border:"1px solid #e8e0d0",borderLeft:"5px solid #c8952a",padding:"11px 14px",alignItems:"flex-start"},
  eventBadge:{flexShrink:0,background:"#2e2010",color:"#f5c87a",fontSize:12,fontWeight:700,borderRadius:7,padding:"5px 10px",textAlign:"center",whiteSpace:"nowrap",alignSelf:"flex-start",marginTop:1},
  eventContent:{display:"flex",flexDirection:"column",gap:3,minWidth:0},
  eventTitle:{fontSize:17,fontWeight:700,color:"#2e2010"},
  eventTitleTR:{fontSize:13,color:"#6b5530",fontStyle:"italic"},
  eventBody:{fontSize:13,color:"#5a4828",lineHeight:1.5},
  prayerBox:{borderTop:"2px solid #e0d5c0",background:"#f5f0e8",flexShrink:0,padding:"11px 18px 13px"},
  prayerBoxTitle:{fontSize:13,fontWeight:700,color:"#2e2010",marginBottom:8},
  prayerGrid:{display:"flex",flexDirection:"column",gap:5},
  prayerRow:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px",borderRadius:8,background:"#fff",border:"1px solid #ece5d6",position:"relative"},
  prayerRowNext:{background:"#fff8ea",border:"2px solid #c8952a"},
  prayerRowPast:{opacity:0.38},
  prayerNames:{display:"flex",alignItems:"center",gap:12},
  prayerTR:{fontSize:17,fontWeight:700,color:"#2e2010",minWidth:90},
  prayerDA:{fontSize:13,color:"#8a7050"},
  prayerTimeVal:{fontSize:18,fontWeight:700,color:"#4a3a22",fontVariantNumeric:"tabular-nums"},
  prayerDot:{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",width:8,height:8,borderRadius:"50%",background:"#c8952a"},
  boardBox:{borderTop:"2px solid #e0d5c0",background:"#ede8db",padding:"11px 18px 14px",flexShrink:0},
  boardTitle:{fontSize:13,fontWeight:700,color:"#2e2010",marginBottom:9},
  boardGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px 18px"},
  boardMember:{},
  boardRoleTR:{fontSize:13,fontWeight:700,color:"#2e2010"},
  boardRoleDA:{fontSize:11,color:"#8a7050",fontStyle:"italic"},
  boardName:{fontSize:14,fontWeight:600,color:"#3a2a10",marginTop:1},
  boardPhone:{fontSize:12,color:"#6b5530"},
  tableHead:{display:"flex",alignItems:"center",padding:"10px 18px",background:"#2e2010",color:"#f5c87a",fontSize:12,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",gap:8,flexShrink:0},
  scrollWrap:{flex:1,overflowY:"hidden",contain:"strict"},
  tableRow:{display:"flex",alignItems:"center",padding:"8px 18px",gap:8,borderBottom:"1px solid #f0ead8",fontSize:15},
  col:{display:"flex",alignItems:"center"},
  colNo:{width:36,flexShrink:0,fontSize:12},
  colYear:{width:108,flexShrink:0,justifyContent:"center"},
};
