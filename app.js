/*
  Soraya — Phase C.1 Code Cleanup
  Datei: app.js
  Zweck: Alle Inline-Scripts aus der alten index.html ausgelagert.
  Hinweis: Kein Modul-Script, damit bestehende onclick-Funktionen global bleiben.
*/

let sb=null;const KEYS={config:'soraya_config',person:'soraya_person_id',conv:'soraya_conversation_id',name:'soraya_person_name',birth:'soraya_birth',created:'soraya_created_at',analyses:'soraya_analysis_count'};const $=id=>document.getElementById(id);
    function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3300)}function status(id,t,type=''){const e=$(id);if(!e)return;e.classList.remove('ok','bad');if(type)e.classList.add(type);e.textContent=typeof t==='string'?t:JSON.stringify(t,null,2)}function safe(v,f=''){return(v===undefined||v===null||v==='')?f:String(v)}function escapeHtml(s){return safe(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}function markdownToHtml(t){return escapeHtml(t||'Noch kein Text vorhanden.').replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>')}
    function showSection(id){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));const t=$(id);if(t)t.classList.add('active');document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-nav')===id));window.scrollTo({top:0,behavior:'smooth'})}function openLogin(){$('loginModal').classList.add('open')}function closeLogin(){$('loginModal').classList.remove('open')}function openSettings(){$('settingsModal').classList.add('open')}function closeSettings(){$('settingsModal').classList.remove('open')}
    function initSupabase(c){sb=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}})}function saveConfig(){const c={supabaseUrl:$('supabaseUrl').value.trim(),supabaseAnonKey:$('supabaseAnonKey').value.trim(),engineUrl:$('engineUrl').value.trim().replace(/\/$/,'')};if(!c.supabaseUrl||!c.supabaseAnonKey||!c.engineUrl){status('configStatus','Bitte alle Felder ausfüllen.','bad');return}localStorage.setItem(KEYS.config,JSON.stringify(c));initSupabase(c);status('configStatus','Verbindung gespeichert.','ok');toast('Verbindung gespeichert.')}function loadConfig(){const r=localStorage.getItem(KEYS.config);if(!r){status('configStatus','Noch keine Verbindung gespeichert.','bad');return false}try{const c=JSON.parse(r);$('supabaseUrl').value=c.supabaseUrl||'';$('supabaseAnonKey').value=c.supabaseAnonKey||'';$('engineUrl').value=c.engineUrl||'';initSupabase(c);status('configStatus','Verbindung geladen.','ok');return true}catch(e){status('configStatus','Gespeicherte Verbindung ist ungültig.','bad');return false}}function getEngineUrl(){const r=localStorage.getItem(KEYS.config);if(!r)throw new Error('Bitte zuerst Verbindung speichern.');return JSON.parse(r).engineUrl}async function getToken(){if(!sb&&!loadConfig())throw new Error('Supabase Client nicht bereit.');const{data,error}=await sb.auth.getSession();if(error)throw error;const token=data.session&&data.session.access_token;if(!token)throw new Error('Nicht eingeloggt oder kein Access Token vorhanden.');return token}async function callSoraya(path,body,method='POST'){const token=await getToken();const res=await fetch(getEngineUrl()+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body||{})});const text=await res.text();let json;try{json=JSON.parse(text)}catch{throw new Error(text)}if(!res.ok)throw new Error(json.detail||json.error||('HTTP '+res.status));if(json.ok===false)throw new Error(json.error||'Soraya ok=false');return json}
    async function signIn(){try{if(!sb&&!loadConfig())throw new Error('Bitte zuerst Verbindung speichern.');const email=$('email').value.trim(),password=$('password').value;const{data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;const name=(data.user.email||'du').split('@')[0];localStorage.setItem(KEYS.name,localStorage.getItem(KEYS.name)||name);renderIdentity();status('authStatus','Login erfolgreich: '+data.user.email,'ok');closeLogin();toast('Login erfolgreich.')}catch(e){status('authStatus',e.message,'bad');toast('Login fehlgeschlagen.')}}async function signUp(){try{if(!sb&&!loadConfig())throw new Error('Bitte zuerst Verbindung speichern.');const{error}=await sb.auth.signUp({email:$('email').value.trim(),password:$('password').value});if(error)throw error;status('authStatus','Registrierung gestartet. Bitte E-Mail bestätigen, falls nötig.','ok')}catch(e){status('authStatus',e.message,'bad')}}async function signOut(){try{if(sb)await sb.auth.signOut();localStorage.removeItem(KEYS.conv);status('authStatus','Abgemeldet.','ok');toast('Abgemeldet.')}catch(e){toast(e.message)}}
    function nval(id){const v=$(id).value.trim();return v===''?null:Number(v)}async function createPerson(){try{const payload={is_self:true,relation:null,person:{name:$('pName').value.trim(),year:Number($('pYear').value),month:Number($('pMonth').value),day:Number($('pDay').value),hour:nval('pHour'),minute:nval('pMinute'),birthplace:$('pBirthplace').value.trim()}};if(!payload.person.name||!payload.person.year||!payload.person.month||!payload.person.day||!payload.person.birthplace)throw new Error('Bitte Name, Datum und Geburtsort ausfüllen.');const data=await callSoraya('/mobile/people/create',payload);const id=data.data.person.id;$('personId').value=id;localStorage.setItem(KEYS.person,id);localStorage.setItem(KEYS.name,payload.person.name);localStorage.setItem(KEYS.birth,JSON.stringify(payload.person));if(!localStorage.getItem(KEYS.created))localStorage.setItem(KEYS.created,new Date().toISOString());renderIdentity();status('personResult','✅ Person gespeichert.\nName: '+data.data.person.name+'\nID: '+id,'ok');toast('Profil gespeichert.')}catch(e){status('personResult',e.message,'bad')}}function needPerson(){if(!$('personId').value.trim()){toast('Bitte zuerst dein Profil speichern.');showSection('profile');return false}return true}
    async function loadAnalysis(forceNew){if(!needPerson())return;try{$('analysisReading').innerHTML='Soraya liest dein kosmisches Feld ...';const data=await callSoraya('/mobile/analysis/save',{person_id:$('personId').value.trim(),force_new:!!forceNew});const a=data.data.analysis||{};const reading=a.reading||data.data.reading||'Keine Analyse gefunden.';$('analysisSource').textContent='source: '+(data.data.source||'loaded');$('analysisReading').innerHTML=markdownToHtml(reading);localStorage.setItem(KEYS.analyses,String(Number(localStorage.getItem(KEYS.analyses)||0)+1));renderIdentity();toast('Analyse geladen.')}catch(e){$('analysisReading').textContent='Fehler: '+e.message}}async function loadHoroscope(){if(!needPerson())return;try{$('horoMood').textContent='Soraya berechnet ...';const data=await callSoraya('/mobile/horoscope/save',{person_id:$('personId').value.trim(),period:$('period').value,at:null});const h=data.data.horoscope||{};$('horoMood').textContent=h.stimmung||data.data.stimmung||'Dein Horoskop';$('horoBody').textContent=h.body||data.data.body||data.data.text||'Keine Horoskopdaten gefunden.';$('horoTip').textContent='✦ '+(h.tipp||data.data.tipp||'Vertraue deinem inneren Kompass.');toast('Horoskop geladen.')}catch(e){$('horoMood').textContent='Fehler';$('horoBody').textContent=e.message}}
    function appendBubble(role,text){const w=$('chatWindow'),d=document.createElement('div');d.className='bubble '+(role==='user'?'user':'assistant');d.textContent=text;w.appendChild(d);w.scrollTop=w.scrollHeight}function clearChatView(){$('chatWindow').innerHTML='<div class="bubble assistant">Hallo, ich bin Soraya ✨ Wie kann ich dich heute unterstützen?</div>'}function needsSafetyNote(m){return/(wohnung|haus|kaufen|kredit|vertrag|steuer|invest|aktie|crypto|bitcoin|gesund|krank|arzt|medizin|anwalt)/i.test(m||'')}async function sendChat(){if(!needPerson())return;const m=$('chatMessage').value.trim();if(!m)return;appendBubble('user',m);$('chatMessage').value='';try{const data=await callSoraya('/mobile/chat/save',{person_id:$('personId').value.trim(),message:m,conversation_id:$('conversationId').value.trim()||null,memory:null,people_ids:[]});$('conversationId').value=data.data.conversation_id;localStorage.setItem(KEYS.conv,data.data.conversation_id);let reply=data.data.reply||'Keine Antwort.';if(needsSafetyNote(m))reply+='\n\nHinweis: Soraya ersetzt keine professionelle Finanz-, Rechts- oder Gesundheitsberatung. Prüfe wichtige Entscheidungen bitte zusätzlich sachlich und mit passenden Expertinnen oder Experten.';appendBubble('assistant',reply)}catch(e){appendBubble('assistant','Fehler: '+e.message)}}
    async function saveSynastry(){if(!needPerson())return;try{const data=await callSoraya('/mobile/synastry/save',{person_a_id:$('personId').value.trim(),person_b_id:$('personBId').value.trim()});const s=data.data.synastry||{};const score=s.score_value||(s.score&&s.score.value)||0;$('compatScore').textContent=score+'%';$('compatRing').style.setProperty('--score',Math.min(100,Number(score))+'%');status('synastryText','✅ Synastrie gespeichert.\nKompatibilität: '+score+'%\nKosmische Verbindung wurde berechnet.','ok');toast('Synastrie berechnet.')}catch(e){status('synastryText',e.message,'bad')}}
    const ZOD=[{s:'Steinbock',g:'♑',el:'Erde',q:'Kardinal',r:'Saturn',from:[12,22],to:[1,19]},{s:'Wassermann',g:'♒',el:'Luft',q:'Fix',r:'Uranus & Saturn',from:[1,20],to:[2,18]},{s:'Fische',g:'♓',el:'Wasser',q:'Veränderlich',r:'Neptun & Jupiter',from:[2,19],to:[3,20]},{s:'Widder',g:'♈',el:'Feuer',q:'Kardinal',r:'Mars',from:[3,21],to:[4,19]},{s:'Stier',g:'♉',el:'Erde',q:'Fix',r:'Venus',from:[4,20],to:[5,20]},{s:'Zwillinge',g:'♊',el:'Luft',q:'Veränderlich',r:'Merkur',from:[5,21],to:[6,20]},{s:'Krebs',g:'♋',el:'Wasser',q:'Kardinal',r:'Mond',from:[6,21],to:[7,22]},{s:'Löwe',g:'♌',el:'Feuer',q:'Fix',r:'Sonne',from:[7,23],to:[8,22]},{s:'Jungfrau',g:'♍',el:'Erde',q:'Veränderlich',r:'Merkur',from:[8,23],to:[9,22]},{s:'Waage',g:'♎',el:'Luft',q:'Kardinal',r:'Venus',from:[9,23],to:[10,22]},{s:'Skorpion',g:'♏',el:'Wasser',q:'Fix',r:'Pluto & Mars',from:[10,23],to:[11,21]},{s:'Schütze',g:'♐',el:'Feuer',q:'Veränderlich',r:'Jupiter',from:[11,22],to:[12,21]}],MON=['Jan.','Feb.','März','Apr.','Mai','Juni','Juli','Aug.','Sep.','Okt.','Nov.','Dez.'];function signFor(d,m){return ZOD.find(z=>{const[fm,fd]=z.from,[tm,td]=z.to;return(m===fm&&d>=fd)||(m===tm&&d<=td)})||null}function renderSun(d,m){const z=signFor(d,m);if(!z)return;$('sunGlyph').textContent=z.g;$('sunSign').textContent=z.s;$('sunRange').textContent=`${z.from[1]}. ${MON[z.from[0]-1]} – ${z.to[1]}. ${MON[z.to[0]-1]}`;$('sunElement').textContent=z.el;$('sunQuality').textContent=z.q;$('sunRuler').textContent=z.r;$('sunProps').style.display='grid';$('profileSub').textContent='Seelenlicht-Sucher · '+z.s}
    function renderMoon(){const syn=29.530588853,ref=Date.UTC(2000,0,6,18,14)/86400000,now=Date.now()/86400000;let age=((now-ref)%syn+syn)%syn,illum=Math.round((1-Math.cos(2*Math.PI*age/syn))/2*100),label='Mondphase',sub='Die Energie des Himmels für heute.';if(age<1.85){label='Neumond';sub='Zeit für Neuanfänge und Absichten.'}else if(age<5.5){label='Zunehmende Sichel';sub='Etwas Neues nimmt Form an.'}else if(age<9.2){label='Erstes Viertel';sub='Zeit zu handeln und dranzubleiben.'}else if(age<12.9){label='Zunehmender Mond';sub='Wachstum, Klärung, Ausrichtung.'}else if(age<16.6){label='Vollmond';sub='Höhepunkt — sehen, was gereift ist.'}else if(age<20.3){label='Abnehmender Mond';sub='Loslassen und dankbar sein.'}else if(age<23.99){label='Letztes Viertel';sub='Aufräumen und Klarheit schaffen.'}else{label='Abnehmende Sichel';sub='Ruhe, Rückzug, Vorbereitung.'}$('moonPhase').textContent=label;$('moonIllum').textContent=illum+'% beleuchtet';$('moonSub').textContent=sub;$('ritualMoonTitle').textContent=label;$('ritualMoonText').textContent=illum+'% beleuchtet · '+sub;$('moonVisual').style.setProperty('--shadow-scale',Math.max(.18,Math.min(1.25,1-illum/100)))}
    function renderGreeting(){const h=new Date().getHours(),g=h<11?'Guten Morgen':h<18?'Schön, dass du da bist':'Guten Abend',name=localStorage.getItem(KEYS.name)||'du';$('greetLine').innerHTML=g+',<br><span class="gold" id="heroName">'+escapeHtml(name)+'</span>.'}function renderIdentity(){const name=localStorage.getItem(KEYS.name)||'Dein Profil';$('profileTitle').textContent=name;$('profileInitial').textContent=(name[0]||'S').toUpperCase();renderGreeting();let b=null;try{b=JSON.parse(localStorage.getItem(KEYS.birth)||'null')}catch(e){}if(b){renderSun(Number(b.day),Number(b.month));$('pName').value=$('pName').value||b.name||'';$('pDay').value=$('pDay').value||b.day||'';$('pMonth').value=$('pMonth').value||b.month||'';$('pYear').value=$('pYear').value||b.year||'';$('pHour').value=$('pHour').value||(b.hour??'');$('pMinute').value=$('pMinute').value||(b.minute??'');$('pBirthplace').value=$('pBirthplace').value||b.birthplace||''}const pid=localStorage.getItem(KEYS.person);if(pid)$('personId').value=pid;const cid=localStorage.getItem(KEYS.conv);if(cid)$('conversationId').value=cid;const created=localStorage.getItem(KEYS.created);if(created){$('daysStat').textContent=Math.max(1,Math.round((Date.now()-new Date(created).getTime())/86400000))}$('analysisStat').textContent=localStorage.getItem(KEYS.analyses)||'0'}window._sorayaPreview=function(){const d=Number($('pDay').value),m=Number($('pMonth').value);if(d>=1&&d<=31&&m>=1&&m<=12)renderSun(d,m);const n=$('pName').value.trim();if(n){localStorage.setItem(KEYS.name,n);renderIdentity()}}
    function renderWheel(){const svg=$('chartWheel'),C=210,gold='#e4b55a',pale='rgba(228,181,90,.32)',violet='rgba(190,108,255,.48)';if(!svg)return;const glyphs=['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];let p='';const ring=(r,c,w)=>`<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`;p+=ring(190,pale,1)+ring(150,gold,1.2)+ring(110,'rgba(228,181,90,.18)',1)+ring(70,'rgba(228,181,90,.14)',1);for(let i=0;i<12;i++){const a=(i*30-90)*Math.PI/180;p+=`<line x1="${C+110*Math.cos(a)}" y1="${C+110*Math.sin(a)}" x2="${C+190*Math.cos(a)}" y2="${C+190*Math.sin(a)}" stroke="${pale}" stroke-width="1"/>`;const ga=((i*30)+15-90)*Math.PI/180;p+=`<text x="${C+170*Math.cos(ga)}" y="${C+170*Math.sin(ga)}" fill="${gold}" font-size="21" text-anchor="middle" dominant-baseline="central">${glyphs[i]}</text>`}const pts=[];for(let i=0;i<9;i++){const a=(i*40+7-90)*Math.PI/180;pts.push([C+82*Math.cos(a),C+82*Math.sin(a)]);p+=`<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3" fill="${i%2?gold:'#be6cff'}"/>`}for(let i=0;i<pts.length;i++)for(let j=i+2;j<pts.length;j+=3)p+=`<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[j][0]}" y2="${pts[j][1]}" stroke="${j%2?violet:'rgba(228,181,90,.4)'}" stroke-width="1"/>`;p+=`<circle cx="${C}" cy="${C}" r="5" fill="${gold}"/>`;svg.innerHTML=p}window.addEventListener('load',async()=>{loadConfig();renderMoon();renderIdentity();renderWheel();if(sb){try{const{data}=await sb.auth.getSession();if(data.session&&data.session.user&&!localStorage.getItem(KEYS.name)){localStorage.setItem(KEYS.name,(data.session.user.email||'du').split('@')[0]);renderIdentity()}}catch(e){}}})

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

window.addEventListener('load', () => {
    const msg = document.getElementById('chatMessage');
    if (msg && !msg.dataset.phaseA1) {
      msg.dataset.phaseA1 = 'true';
      msg.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (window.sendChat) window.sendChat();
        }
      });
    }
  });

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.1: real chart from backend /chart endpoint ===== */
(function () {
  const PLANET_GLYPHS = {
    Sun: "☉",
    Moon: "☾",
    Mercury: "☿",
    Venus: "♀",
    Mars: "♂",
    Jupiter: "♃",
    Saturn: "♄",
    Uranus: "♅",
    Neptune: "♆",
    Pluto: "♇",
    Chiron: "⚷",
    True_North_Lunar_Node: "☊",
    Mean_Lilith: "⚸",
    Ascendant: "AC",
    Medium_Coeli: "MC",
    Descendant: "DC",
    Imum_Coeli: "IC"
  };

  const SIGN_GLYPHS = {
    Ari: "♈", Tau: "♉", Gem: "♊", Can: "♋", Leo: "♌", Vir: "♍",
    Lib: "♎", Sco: "♏", Sag: "♐", Cap: "♑", Aqu: "♒", Pis: "♓",
    Widder: "♈", Stier: "♉", Zwillinge: "♊", Krebs: "♋", Loewe: "♌", Löwe: "♌",
    Jungfrau: "♍", Waage: "♎", Skorpion: "♏", Schuetze: "♐", Schütze: "♐",
    Steinbock: "♑", Wassermann: "♒", Fische: "♓"
  };

  const SIGN_ORDER = ["Ari","Tau","Gem","Can","Leo","Vir","Lib","Sco","Sag","Cap","Aqu","Pis"];
  const CORE_POINTS = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","Chiron","Ascendant","Medium_Coeli"];
  const CORE_DISPLAY = new Set(CORE_POINTS);

  let lastChartData = null;
  let loadingChart = false;

  function el(id) {
    return document.getElementById(id);
  }

  function getConfigEngineUrl() {
    const raw = localStorage.getItem("soraya_config");
    if (!raw) throw new Error("Bitte zuerst unter Verbindung die Backend URL speichern.");
    const config = JSON.parse(raw);
    if (!config.engineUrl) throw new Error("Backend URL fehlt in Verbindung.");
    return config.engineUrl.replace(/\/$/, "");
  }

  async function callEnginePublic(path, body) {
    const res = await fetch(getConfigEngineUrl() + path, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body || {})
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(text || "Ungültige Backend-Antwort.");
    }
    if (!res.ok || json.ok === false) throw new Error(json.detail || json.error || ("HTTP " + res.status));
    return json;
  }

  function numberOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function getBirthPayload() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem("soraya_birth") || "null"); } catch (e) {}
    const payload = {
      name: (b && b.name) || (el("pName") && el("pName").value.trim()) || "Unbenannt",
      year: numberOrNull((b && b.year) || (el("pYear") && el("pYear").value)),
      month: numberOrNull((b && b.month) || (el("pMonth") && el("pMonth").value)),
      day: numberOrNull((b && b.day) || (el("pDay") && el("pDay").value)),
      hour: numberOrNull((b && b.hour) ?? (el("pHour") && el("pHour").value)),
      minute: numberOrNull((b && b.minute) ?? (el("pMinute") && el("pMinute").value)),
      birthplace: (b && b.birthplace) || (el("pBirthplace") && el("pBirthplace").value.trim()) || ""
    };

    if (!payload.year || !payload.month || !payload.day || !payload.birthplace) {
      throw new Error("Bitte Profil mit Geburtsdatum und Geburtsort speichern.");
    }

    return payload;
  }

  function fmtDeg(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "–";
    const deg = Math.floor(n);
    const min = Math.round((n - deg) * 60);
    return deg + "°" + String(min).padStart(2, "0") + "′";
  }

  function angleXY(center, radius, absPos) {
    const a = (Number(absPos) - 90) * Math.PI / 180;
    return [center + radius * Math.cos(a), center + radius * Math.sin(a)];
  }

  function aspectColor(type) {
    if (type === "trine" || type === "sextile") return "rgba(190,108,255,.58)";
    if (type === "square" || type === "opposition") return "rgba(228,181,90,.48)";
    return "rgba(255,255,255,.22)";
  }

  function renderRealWheel(chart) {
    const svg = el("chartWheel");
    if (!svg || !chart) return;

    const C = 210, outer = 190, signR = 169, houseR = 149, pointR = 126, aspectR = 94;
    const gold = "#e4b55a";
    const pale = "rgba(228,181,90,.32)";
    const soft = "rgba(228,181,90,.14)";
    const points = (chart.points || []).filter(p => CORE_DISPLAY.has(p.name));
    const pointMap = new Map(points.map(p => [p.name, p]));

    let out = "";
    const ring = (r, c, w) => `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
    out += ring(outer, pale, 1);
    out += ring(houseR, gold, 1.2);
    out += ring(110, soft, 1);
    out += ring(70, soft, 1);

    for (let i = 0; i < 12; i++) {
      const cusp = i * 30;
      const [x1, y1] = angleXY(C, houseR, cusp);
      const [x2, y2] = angleXY(C, outer, cusp);
      const [gx, gy] = angleXY(C, signR, cusp + 15);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${pale}" stroke-width="1"/>`;
      out += `<text x="${gx}" y="${gy}" fill="${gold}" font-size="21" text-anchor="middle" dominant-baseline="central">${SIGN_GLYPHS[SIGN_ORDER[i]]}</text>`;
    }

    (chart.houses || []).forEach(h => {
      const [x1, y1] = angleXY(C, 72, h.cusp_abs_pos);
      const [x2, y2] = angleXY(C, houseR, h.cusp_abs_pos);
      const [tx, ty] = angleXY(C, 136, h.cusp_abs_pos + 5);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(228,181,90,.22)" stroke-width="1"/>`;
      out += `<text x="${tx}" y="${ty}" fill="rgba(180,166,201,.78)" font-size="10" text-anchor="middle" dominant-baseline="central">${h.number}</text>`;
    });

    (chart.aspects || []).slice(0, 24).forEach(a => {
      const p1 = pointMap.get(a.p1);
      const p2 = pointMap.get(a.p2);
      if (!p1 || !p2) return;
      const [x1, y1] = angleXY(C, aspectR, p1.abs_pos);
      const [x2, y2] = angleXY(C, aspectR, p2.abs_pos);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${aspectColor(a.type)}" stroke-width="1"/>`;
    });

    points.forEach((p, idx) => {
      const r = pointR + (idx % 3) * 10;
      const [x, y] = angleXY(C, r, p.abs_pos);
      const [dx, dy] = angleXY(C, 106, p.abs_pos);
      const glyph = PLANET_GLYPHS[p.name] || "•";
      out += `<circle cx="${dx}" cy="${dy}" r="3.2" fill="${idx % 2 ? "#be6cff" : gold}"/>`;
      out += `<text x="${x}" y="${y}" fill="${p.name === "Ascendant" ? "#f7dc91" : "#be6cff"}" font-size="${glyph.length > 1 ? 11 : 20}" font-weight="700" text-anchor="middle" dominant-baseline="central">${glyph}</text>`;
    });

    out += `<circle cx="${C}" cy="${C}" r="5" fill="${gold}"/>`;
    svg.innerHTML = out;
    svg.classList.add("real-chart-loaded");
  }

  function miniCard(title, point) {
    if (!point) return "";
    return `
      <div class="astro-mini-card">
        <div class="glyph">${PLANET_GLYPHS[point.name] || SIGN_GLYPHS[point.sign] || "✦"}</div>
        <h4>${title}</h4>
        <p>${point.sign_de || point.sign} · ${fmtDeg(point.degree)}${point.house ? " · Haus " + point.house : ""}</p>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = el("realChartPanel");
    if (panel) return panel;

    const wheel = el("chartWheel");
    const card = wheel && wheel.closest(".card");
    panel = document.createElement("div");
    panel.id = "realChartPanel";
    panel.className = "real-chart-grid";
    panel.innerHTML = `
      <div class="card phaseb-panel">
        <div class="card-title"><h4>Echte Chart-Daten</h4><span class="badge" id="chartDataStatus">bereit</span></div>
        <p class="phaseb-note">Phase B.1 nutzt den Backend-Endpunkt <code>/chart</code> und visualisiert echte Planeten, Häuser und Aspekte aus deinem Geburtshoroskop.</p>
        <div class="phaseb-actions">
          <button class="btn gold" onclick="window.loadRealChartData(true)">Chart-Daten laden</button>
          <button class="btn" onclick="showSection('profile')">Geburtsdaten prüfen</button>
        </div>
        <div id="chartMeta" class="chart-meta"></div>
      </div>
      <div class="big-three-grid" id="bigThreeGrid"></div>
      <div class="card"><div class="card-title"><h4>Planeten</h4><span class="badge">radix</span></div><div id="planetList" class="planet-list"></div></div>
      <div class="card"><div class="card-title"><h4>Elemente Balance</h4><span class="badge">core 10</span></div><div id="elementList" class="element-list"></div></div>
      <div class="card"><div class="card-title"><h4>Stärkste Aspekte</h4><span class="badge">orb</span></div><div id="aspectList" class="aspect-list"></div></div>
    `;
    if (card) card.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function renderChartPanel(chart) {
    ensurePanel();

    const meta = chart.meta || {};
    const big = chart.big_three || {};
    const points = chart.points || [];
    const aspects = chart.aspects || [];
    const dist = chart.distributions || {};
    const elems = dist.elements || {};

    el("chartDataStatus").textContent = "real";
    el("chartMeta").textContent = [
      meta.name ? "Name: " + meta.name : "",
      meta.house_system ? "Häuser: " + meta.house_system : "",
      meta.time_known === false ? "Geburtszeit unbekannt: 12:00 als Näherung" : "",
      meta.resolved_place ? "Ort: " + meta.resolved_place : ""
    ].filter(Boolean).join(" · ");

    el("bigThreeGrid").innerHTML =
      miniCard("Sonne", big.sun) +
      miniCard("Mond", big.moon) +
      miniCard("Aszendent", big.ascendant);

    const shownPoints = points.filter(p => CORE_DISPLAY.has(p.name)).slice(0, 13);
    el("planetList").innerHTML = shownPoints.map(p => `
      <div class="planet-row">
        <div class="left">
          <span class="orb-sm">${PLANET_GLYPHS[p.name] || "✦"}</span>
          <span><b>${p.name_de || p.name}</b><small>${p.sign_de || p.sign}${p.house ? " · Haus " + p.house : ""}${p.retrograde ? " · rückläufig" : ""}</small></span>
        </div>
        <span class="degree-pill">${fmtDeg(p.degree)}</span>
      </div>
    `).join("");

    const maxElem = Math.max(1, ...Object.values(elems).map(Number));
    el("elementList").innerHTML = Object.entries(elems).map(([name, value]) => `
      <div class="element-row">
        <b>${name}</b>
        <div class="element-bar"><span style="width:${Math.round(Number(value) / maxElem * 100)}%"></span></div>
        <span class="degree-pill">${value}</span>
      </div>
    `).join("");

    el("aspectList").innerHTML = aspects.slice(0, 8).map(a => `
      <div class="aspect-row">
        <div class="left">
          <span class="orb-sm">◇</span>
          <span><b>${a.p1_de || a.p1} ${a.type_de || a.type}</b><small>${a.p2_de || a.p2}</small></span>
        </div>
        <span class="degree-pill">Orb ${fmtDeg(a.orb)}</span>
      </div>
    `).join("");
  }

  async function loadRealChartData(force) {
    ensurePanel();

    if (loadingChart) return;
    if (lastChartData && !force) {
      renderRealWheel(lastChartData);
      renderChartPanel(lastChartData);
      return;
    }

    try {
      loadingChart = true;
      if (el("chartDataStatus")) el("chartDataStatus").textContent = "lädt";
      const payload = getBirthPayload();
      const json = await callEnginePublic("/chart", payload);
      lastChartData = json.data;
      renderRealWheel(lastChartData);
      renderChartPanel(lastChartData);
      if (window.toast) toast("Echte Chart-Daten geladen.");
    } catch (err) {
      ensurePanel();
      if (el("chartDataStatus")) el("chartDataStatus").textContent = "fehlt";
      if (el("chartMeta")) el("chartMeta").textContent = err.message;
      if (window.toast) toast("Chart-Daten konnten nicht geladen werden.");
    } finally {
      loadingChart = false;
    }
  }

  window.loadRealChartData = loadRealChartData;

  window.addEventListener("load", () => {
    ensurePanel();

    const oldShowSection = window.showSection;
    if (typeof oldShowSection === "function" && !oldShowSection.__phaseBWrapped) {
      const wrapped = function (id) {
        oldShowSection(id);
        if (id === "analysis") setTimeout(() => loadRealChartData(false), 120);
      };
      wrapped.__phaseBWrapped = true;
      window.showSection = wrapped;
    }

    const oldCreatePerson = window.createPerson;
    if (typeof oldCreatePerson === "function" && !oldCreatePerson.__phaseBWrapped) {
      const wrappedCreate = async function () {
        const result = await oldCreatePerson.apply(this, arguments);
        setTimeout(() => loadRealChartData(true), 300);
        return result;
      };
      wrappedCreate.__phaseBWrapped = true;
      window.createPerson = wrappedCreate;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.2: compact chart tabs + cleaner wheel label placement ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function waitForPhaseB() {
    if (!window.loadRealChartData) {
      setTimeout(waitForPhaseB, 120);
      return;
    }

    const oldLoad = window.loadRealChartData;
    if (oldLoad.__phaseB2Wrapped) return;

    window.loadRealChartData = async function () {
      const result = await oldLoad.apply(this, arguments);
      setTimeout(applyChartPanelTabs, 120);
      setTimeout(polishWheelLabels, 140);
      return result;
    };
    window.loadRealChartData.__phaseB2Wrapped = true;

    window.addEventListener("load", () => {
      setTimeout(applyChartPanelTabs, 250);
      setTimeout(polishWheelLabels, 270);
    });
  }

  function applyChartPanelTabs() {
    const panel = el("realChartPanel");
    if (!panel || panel.dataset.phaseB2Tabs === "true") return;

    const cards = Array.from(panel.querySelectorAll(":scope > .card"));
    const planetCard = cards.find(c => c.querySelector("#planetList"));
    const elementCard = cards.find(c => c.querySelector("#elementList"));
    const aspectCard = cards.find(c => c.querySelector("#aspectList"));
    if (!planetCard || !elementCard || !aspectCard) return;

    panel.dataset.phaseB2Tabs = "true";

    planetCard.classList.add("chart-detail-card", "active");
    elementCard.classList.add("chart-detail-card");
    aspectCard.classList.add("chart-detail-card");

    const tabs = document.createElement("div");
    tabs.className = "chart-tabs";
    tabs.innerHTML = `
      <button class="active" data-chart-tab="planet">Planeten</button>
      <button data-chart-tab="element">Elemente</button>
      <button data-chart-tab="aspect">Aspekte</button>
    `;

    const big = el("bigThreeGrid");
    if (big) big.insertAdjacentElement("afterend", tabs);

    const tabMap = { planet: planetCard, element: elementCard, aspect: aspectCard };
    tabs.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-chart-tab]");
      if (!btn) return;
      tabs.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(tabMap).forEach(card => card.classList.remove("active"));
      tabMap[btn.dataset.chartTab].classList.add("active");
    });
  }

  function polishWheelLabels() {
    const svg = el("chartWheel");
    if (!svg || !svg.classList.contains("real-chart-loaded")) return;

    const texts = Array.from(svg.querySelectorAll("text"));
    texts.forEach(t => {
      const content = (t.textContent || "").trim();

      // Make planet labels smaller than sign labels, reducing overlap.
      if (["☉","☾","☿","♀","♂","♃","♄","♅","♆","♇","⚷","AC","MC","DC","IC"].includes(content)) {
        t.setAttribute("font-size", content.length > 1 ? "9" : "16");
        t.setAttribute("font-weight", "700");
      }

      // House numbers stay subtle.
      if (/^\d+$/.test(content)) {
        t.setAttribute("font-size", "9");
        t.setAttribute("opacity", ".75");
      }
    });
  }

  waitForPhaseB();
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.3: local people cache + partner create/select for Synastry ===== */
(function () {
  const PEOPLE_KEY = "soraya_people_cache_v1";

  function el(id) { return document.getElementById(id); }

  function readPeopleCache() {
    try {
      const rows = JSON.parse(localStorage.getItem(PEOPLE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  }

  function writePeopleCache(rows) {
    const byId = new Map();
    rows.filter(Boolean).forEach(p => {
      if (p.id) byId.set(p.id, p);
    });
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(Array.from(byId.values())));
  }

  function addPersonToCache(person, extra) {
    if (!person || !person.id) return;
    const rows = readPeopleCache();
    rows.push({
      id: person.id,
      name: person.name || (extra && extra.name) || "Unbenannt",
      relation: (extra && extra.relation) || person.relation || null,
      is_self: !!((extra && extra.is_self) || person.is_self),
      birth_date: person.birth_date || null,
      birthplace: person.birthplace || (extra && extra.birthplace) || null,
      created_at: person.created_at || new Date().toISOString()
    });
    writePeopleCache(rows);
    renderPartnerSelector();
  }

  function cacheSelfFromStorage() {
    const pid = localStorage.getItem("soraya_person_id");
    if (!pid) return;

    let birth = null;
    try { birth = JSON.parse(localStorage.getItem("soraya_birth") || "null"); } catch (e) {}

    const name = localStorage.getItem("soraya_person_name") || (birth && birth.name) || "Ich";
    addPersonToCache({
      id: pid,
      name,
      is_self: true,
      birthplace: birth && birth.birthplace
    }, {is_self: true, relation: "self", name});
  }

  function getCurrentPersonId() {
    return (el("personId") && el("personId").value.trim()) || localStorage.getItem("soraya_person_id") || "";
  }

  function renderPartnerSelector() {
    const select = el("synPersonSelect");
    const chips = el("partnerChipList");
    const currentId = getCurrentPersonId();
    if (!select) return;

    const people = readPeopleCache();
    const partners = people.filter(p => p && p.id && p.id !== currentId);

    select.innerHTML = "";
    if (!partners.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Noch keine zweite Person gespeichert";
      select.appendChild(opt);
      if (el("personBId")) el("personBId").value = "";
    } else {
      const first = document.createElement("option");
      first.value = "";
      first.textContent = "Person auswählen";
      select.appendChild(first);

      partners.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + (p.relation ? " · " + p.relation : "");
        select.appendChild(opt);
      });
    }

    if (chips) {
      chips.innerHTML = partners.slice(0, 6).map(p => `<span class="partner-chip">${p.name}</span>`).join("");
    }
  }

  function hideRawUuidInput() {
    const input = el("personBId");
    if (!input) return;
    const label = input.previousElementSibling;
    const hint = input.nextElementSibling;
    if (label && label.tagName === "LABEL") label.style.display = "none";
    if (hint && hint.tagName === "P") hint.style.display = "none";
  }

  function ensureSynastryPartnerUI() {
    if (el("phaseB3PartnerCard")) {
      renderPartnerSelector();
      return;
    }

    const wrap = document.querySelector("#synastry .syn-wrap");
    if (!wrap) return;

    hideRawUuidInput();

    const card = document.createElement("div");
    card.id = "phaseB3PartnerCard";
    card.className = "card phaseb3-partner-card";
    card.innerHTML = `
      <div class="card-title">
        <h4>Zweite Person</h4>
        <span class="badge">ohne UUID</span>
      </div>
      <div class="partner-select-row">
        <div>
          <label>Gespeicherte Person wählen</label>
          <select id="synPersonSelect"></select>
        </div>
        <button class="btn" onclick="window.refreshSynastryPeople()">Aktualisieren</button>
      </div>
      <div id="partnerChipList" class="partner-chip-list"></div>
      <p class="synastry-hint">Du musst keine ID mehr kopieren. Lege hier eine zweite Person an oder wähle eine gespeicherte Person aus.</p>

      <div style="margin-top:18px">
        <div class="card-title" style="margin-bottom:6px"><h4>Neue Person anlegen</h4></div>
        <label>Name</label>
        <input id="partnerName" placeholder="Name der zweiten Person" />
        <div class="partner-form-grid">
          <div><label>Tag</label><input id="partnerDay" inputmode="numeric" placeholder="14" /></div>
          <div><label>Monat</label><input id="partnerMonth" inputmode="numeric" placeholder="9" /></div>
          <div><label>Jahr</label><input id="partnerYear" inputmode="numeric" placeholder="1988" /></div>
        </div>
        <div class="partner-form-grid two">
          <div><label>Stunde optional</label><input id="partnerHour" inputmode="numeric" placeholder="18" /></div>
          <div><label>Minute optional</label><input id="partnerMinute" inputmode="numeric" placeholder="30" /></div>
        </div>
        <label>Geburtsort</label>
        <input id="partnerBirthplace" placeholder="z. B. Budapest, Ungarn" />
        <label>Beziehung</label>
        <select id="partnerRelation">
          <option value="partner">Partner/in</option>
          <option value="friend">Freund/in</option>
          <option value="family">Familie</option>
          <option value="other">Andere</option>
        </select>
        <button class="btn gold block" onclick="window.createSynastryPerson()" style="margin-top:16px">Zweite Person speichern</button>
        <div id="partnerCreateStatus" class="status">Noch keine zweite Person gespeichert.</div>
      </div>
    `;

    const compat = wrap.querySelector(".compat");
    if (compat) compat.insertAdjacentElement("afterend", card);
    else wrap.insertAdjacentElement("afterbegin", card);

    const select = el("synPersonSelect");
    if (select) {
      select.addEventListener("change", () => {
        if (el("personBId")) el("personBId").value = select.value || "";
      });
    }

    renderPartnerSelector();
  }

  function numOrNull(id) {
    const node = el(id);
    const v = node ? node.value.trim() : "";
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function requiredNumber(id, label) {
    const n = numOrNull(id);
    if (n === null) throw new Error(label + " fehlt.");
    return n;
  }

  window.createSynastryPerson = async function () {
    try {
      if (!window.callSoraya) throw new Error("Backend-Verbindung ist noch nicht bereit.");
      const person = {
        name: (el("partnerName") && el("partnerName").value.trim()) || "",
        year: requiredNumber("partnerYear", "Jahr"),
        month: requiredNumber("partnerMonth", "Monat"),
        day: requiredNumber("partnerDay", "Tag"),
        hour: numOrNull("partnerHour"),
        minute: numOrNull("partnerMinute"),
        birthplace: (el("partnerBirthplace") && el("partnerBirthplace").value.trim()) || ""
      };
      const relation = (el("partnerRelation") && el("partnerRelation").value) || "partner";

      if (!person.name) throw new Error("Name fehlt.");
      if (!person.birthplace) throw new Error("Geburtsort fehlt.");

      const data = await window.callSoraya("/mobile/people/create", {
        is_self: false,
        relation,
        person
      });

      const row = data.data && data.data.person;
      if (!row || !row.id) throw new Error("Person wurde gespeichert, aber keine ID erhalten.");

      addPersonToCache(row, {...person, relation, is_self: false});
      const select = el("synPersonSelect");
      if (select) select.value = row.id;
      if (el("personBId")) el("personBId").value = row.id;

      if (window.status) status("partnerCreateStatus", "✅ Zweite Person gespeichert.\nName: " + (row.name || person.name), "ok");
      if (window.toast) toast("Zweite Person gespeichert.");
    } catch (err) {
      if (window.status) status("partnerCreateStatus", err.message, "bad");
      if (window.toast) toast("Person konnte nicht gespeichert werden.");
    }
  };

  window.refreshSynastryPeople = function () {
    cacheSelfFromStorage();
    renderPartnerSelector();
    if (window.toast) toast("Personenliste aktualisiert.");
  };

  function improveSynastryResult() {
    const oldSave = window.saveSynastry;
    if (typeof oldSave !== "function" || oldSave.__phaseB3Wrapped) return;

    const wrapped = async function () {
      const selected = (el("synPersonSelect") && el("synPersonSelect").value) || "";
      if (selected && el("personBId")) el("personBId").value = selected;
      if (!selected && !(el("personBId") && el("personBId").value.trim())) {
        if (window.toast) toast("Bitte zuerst eine zweite Person auswählen oder anlegen.");
        return;
      }

      const result = await oldSave.apply(this, arguments);
      setTimeout(() => {
        const scoreText = el("compatScore") ? el("compatScore").textContent : "";
        const box = el("synastryText");
        if (box && scoreText && !document.getElementById("synastryMiniStats")) {
          const div = document.createElement("div");
          div.id = "synastryMiniStats";
          div.className = "synastry-result-grid";
          div.innerHTML = `
            <div class="synastry-mini"><b>${scoreText}</b><span>Harmonie</span></div>
            <div class="synastry-mini"><b>∞</b><span>Verbindung</span></div>
            <div class="synastry-mini"><b>✦</b><span>Insight</span></div>
          `;
          box.insertAdjacentElement("afterend", div);
        }
      }, 250);
      return result;
    };

    wrapped.__phaseB3Wrapped = true;
    window.saveSynastry = wrapped;
  }

  function wrapSelfCreatePerson() {
    const oldCreate = window.createPerson;
    if (typeof oldCreate !== "function" || oldCreate.__phaseB3Wrapped) return;

    const wrapped = async function () {
      const result = await oldCreate.apply(this, arguments);
      setTimeout(() => {
        cacheSelfFromStorage();
        renderPartnerSelector();
      }, 400);
      return result;
    };

    wrapped.__phaseB3Wrapped = true;
    window.createPerson = wrapped;
  }

  window.addEventListener("load", () => {
    setTimeout(() => {
      ensureSynastryPartnerUI();
      cacheSelfFromStorage();
      improveSynastryResult();
      wrapSelfCreatePerson();
      renderPartnerSelector();
    }, 350);

    const oldShowSection = window.showSection;
    if (typeof oldShowSection === "function" && !oldShowSection.__phaseB3Wrapped) {
      const wrappedShow = function (id) {
        oldShowSection(id);
        if (id === "synastry") setTimeout(() => {
          ensureSynastryPartnerUI();
          cacheSelfFromStorage();
          renderPartnerSelector();
        }, 100);
      };
      wrappedShow.__phaseB3Wrapped = true;
      window.showSection = wrappedShow;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.3.1: visibility helper and chart-note correction ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function updateChartNote() {
    const cards = document.querySelectorAll("#analysis .card");
    cards.forEach(card => {
      const text = card.textContent || "";
      if (text.includes("Phase A: Das Rad ist dekorativ")) {
        const nodes = Array.from(card.querySelectorAll("p, .dev-note, .phaseb-note"));
        nodes.forEach(n => {
          if ((n.textContent || "").includes("Phase A: Das Rad ist dekorativ")) {
            n.textContent = "Phase B: Dieses Rad nutzt echte Chart-Daten aus deinem Backend. Planeten, Häuser und Aspekte werden berechnet visualisiert.";
          }
        });
      }
    });
  }

  function addSynastryHints() {
    const synSection = el("synastry");
    if (synSection && !el("synastryOpenHelper")) {
      const title = synSection.querySelector(".page-title");
      if (title) {
        const p = document.createElement("p");
        p.id = "synastryOpenHelper";
        p.className = "synastry-open-helper";
        p.textContent = "Lege eine zweite Person an oder wähle eine gespeicherte Person. Danach berechnet Soraya eure Verbindung.";
        title.appendChild(p);
      }
    }

    const tile = Array.from(document.querySelectorAll(".tile")).find(t => (t.textContent || "").includes("Synastrie"));
    if (tile && !document.getElementById("homeSynastryHint")) {
      const hint = document.createElement("div");
      hint.id = "homeSynastryHint";
      hint.className = "home-synastry-hint";
      hint.textContent = "Synastrie ist über diesen Shortcut erreichbar.";
      const grid = tile.closest(".shortcut-grid");
      if (grid) grid.insertAdjacentElement("afterend", hint);
    }
  }

  function verifyB3Ui() {
    // If B3 partner UI was not created yet, try to open helper by re-triggering the wrapped section flow.
    if (!el("phaseB3PartnerCard") && typeof window.showSection === "function") {
      const active = document.querySelector(".section.active");
      if (active && active.id === "synastry") {
        setTimeout(() => window.showSection("synastry"), 100);
      }
    }
  }

  window.addEventListener("load", () => {
    setTimeout(updateChartNote, 250);
    setTimeout(addSynastryHints, 300);
    setTimeout(verifyB3Ui, 500);
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.3.2: generate warm Synastry interpretation from score ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function selectedPartnerName() {
    const select = el("synPersonSelect");
    if (select && select.value) {
      const text = select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : "";
      return (text || "").split("·")[0].trim();
    }
    const input = el("partnerName");
    return input && input.value.trim() ? input.value.trim() : "die zweite Person";
  }

  function currentUserName() {
    return localStorage.getItem("soraya_person_name") || (el("pName") && el("pName").value.trim()) || "du";
  }

  function parseScore() {
    const raw = el("compatScore") ? el("compatScore").textContent : "";
    const match = String(raw).match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function category(score) {
    if (score === null) return {
      title: "Eine Verbindung mit vielen offenen Fragen",
      label: "Noch nicht genug Daten",
      tone: "Soraya braucht zuerst beide Geburtsdaten, damit die Resonanz genauer beschrieben werden kann.",
      light: "Achte auf das erste Gefühl zwischen euch.",
      shadow: "Nicht zu schnell urteilen.",
      practice: "Stellt euch eine ehrliche Frage: Was fühlt sich leicht an, was braucht Geduld?"
    };

    if (score <= 35) return {
      title: "Eine herausfordernde, aber lehrreiche Verbindung",
      label: "Lernverbindung",
      tone: "Zwischen euch liegt weniger automatische Leichtigkeit, dafür aber viel Entwicklungspotenzial. Diese Verbindung kann alte Muster sichtbar machen und euch zeigen, wo Geduld, Klarheit und echte Kommunikation wichtig sind.",
      light: "Ihr könnt einander helfen, blinde Flecken zu erkennen.",
      shadow: "Missverständnisse, unterschiedliche Bedürfnisse oder emotionale Reibung können schneller entstehen.",
      practice: "Nicht alles sofort persönlich nehmen. Sprecht langsam, konkret und ehrlich über Erwartungen."
    };

    if (score <= 60) return {
      title: "Eine gemischte Verbindung mit Wachstumskraft",
      label: "Wachstumsbindung",
      tone: "Eure Dynamik wirkt weder rein leicht noch rein schwierig. Es gibt Anziehung und gemeinsame Lernfelder. Wenn ihr bewusst miteinander umgeht, kann diese Verbindung stabiler werden, als der erste Eindruck vermuten lässt.",
      light: "Es gibt echte Resonanz, besonders wenn ihr gemeinsame Ziele findet.",
      shadow: "Manche Themen brauchen Wiederholung, Geduld und klare Grenzen.",
      practice: "Pflegt Rituale: regelmäßige Gespräche, gemeinsame Pläne und bewusstes Zuhören."
    };

    if (score <= 80) return {
      title: "Eine harmonische Verbindung mit guter Resonanz",
      label: "Starke Resonanz",
      tone: "Zwischen euch gibt es eine natürliche Verständigung. Vieles kann sich vertraut, unterstützend und angenehm anfühlen. Diese Verbindung eignet sich gut, um gemeinsam zu wachsen und einander emotional zu stärken.",
      light: "Ihr könnt euch gegenseitig Sicherheit, Motivation und Wärme geben.",
      shadow: "Achtet darauf, Harmonie nicht mit Konfliktvermeidung zu verwechseln.",
      practice: "Sprecht auch über schwierige Dinge, solange die Stimmung ruhig ist."
    };

    return {
      title: "Eine sehr starke seelische Resonanz",
      label: "Tiefe Verbindung",
      tone: "Diese Verbindung trägt eine besondere Intensität. Ihr könnt euch schnell vertraut fühlen, als würdet ihr einander auf einer tieferen Ebene erkennen. Das kann sehr schön sein, braucht aber trotzdem Bewusstheit.",
      light: "Starke Anziehung, emotionale Nähe und inspirierende Spiegelung.",
      shadow: "Zu viel Intensität kann Erwartungen oder Abhängigkeit erzeugen.",
      practice: "Bewahrt Eigenständigkeit. Eine starke Verbindung wird gesünder, wenn beide frei atmen können."
    };
  }

  function ensureDescriptionCard() {
    let card = el("synastryDescriptionCard");
    if (card) return card;

    const result = el("synastryText");
    card = document.createElement("div");
    card.id = "synastryDescriptionCard";
    card.className = "card synastry-description-card";
    card.innerHTML = `
      <div class="card-title">
        <h4>Deutung eurer Verbindung</h4>
        <span class="badge" id="synastryDescriptionBadge">Insight</span>
      </div>
      <div id="synastryDescriptionBody"></div>
    `;

    if (result) {
      const stats = el("synastryMiniStats");
      if (stats) stats.insertAdjacentElement("afterend", card);
      else result.insertAdjacentElement("afterend", card);
    } else {
      const wrap = document.querySelector("#synastry .syn-wrap");
      if (wrap) wrap.appendChild(card);
    }

    return card;
  }

  function renderSynastryDescription() {
    const card = ensureDescriptionCard();
    const body = el("synastryDescriptionBody");
    const badge = el("synastryDescriptionBadge");
    if (!card || !body) return;

    const score = parseScore();
    const c = category(score);
    const user = currentUserName();
    const partner = selectedPartnerName();

    if (badge) badge.textContent = c.label;

    body.innerHTML = `
      <h4>${c.title}</h4>
      <p><strong>${user}</strong> und <strong>${partner}</strong>: ${c.tone}</p>
      <div class="synastry-advice-grid">
        <div class="synastry-advice"><b>Lichtseite</b><span>${c.light}</span></div>
        <div class="synastry-advice"><b>Schattenseite</b><span>${c.shadow}</span></div>
      </div>
      <p style="margin-top:14px"><strong>Sorayas Impuls:</strong> ${c.practice}</p>
      <p style="font-size:12px;color:var(--muted2)">Hinweis: Diese Deutung ist eine astrologische Reflexion und ersetzt keine Beziehungs-, Rechts- oder Gesundheitsberatung.</p>
    `;

    card.classList.add("active");
  }

  window.renderSynastryDescription = renderSynastryDescription;

  function wrapSaveSynastry() {
    const oldSave = window.saveSynastry;
    if (typeof oldSave !== "function" || oldSave.__phaseB32Wrapped) return;

    const wrapped = async function () {
      const result = await oldSave.apply(this, arguments);
      setTimeout(renderSynastryDescription, 350);
      return result;
    };

    wrapped.__phaseB32Wrapped = true;
    window.saveSynastry = wrapped;
  }

  window.addEventListener("load", () => {
    setTimeout(wrapSaveSynastry, 450);
    setTimeout(() => {
      if (parseScore() !== null) renderSynastryDescription();
    }, 700);
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4: load saved people from Supabase via /mobile/people/list ===== */
(function () {
  const PEOPLE_KEY = "soraya_people_cache_v1";

  function el(id) { return document.getElementById(id); }

  function readCache() {
    try {
      const rows = JSON.parse(localStorage.getItem(PEOPLE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      return [];
    }
  }

  function writeCache(rows) {
    const byId = new Map();
    rows.filter(Boolean).forEach(p => {
      if (p.id) byId.set(p.id, p);
    });
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(Array.from(byId.values())));
  }

  function normalizePerson(row) {
    return {
      id: row.id,
      name: row.name || "Unbenannt",
      relation: row.relation || null,
      is_self: !!row.is_self,
      birth_date: row.birth_date || null,
      birth_time: row.birth_time || null,
      time_known: row.time_known,
      birthplace: row.birthplace || null,
      created_at: row.created_at || null,
      loaded_from_supabase: true
    };
  }

  function setSyncStatus(text, ok) {
    const node = el("peopleSyncStatus");
    if (!node) return;
    node.textContent = text;
    node.style.color = ok ? "var(--green)" : "var(--muted2)";
  }

  function addSyncUI() {
    const card = el("phaseB3PartnerCard");
    if (!card || el("peopleSyncRow")) return;

    const selectRow = card.querySelector(".partner-select-row");
    if (!selectRow) return;

    const row = document.createElement("div");
    row.id = "peopleSyncRow";
    row.className = "people-sync-row";
    row.innerHTML = `
      <button class="btn" onclick="window.loadPeopleFromSupabase()">Aus Supabase laden</button>
      <div id="peopleSyncStatus">Personenliste wird lokal gespeichert. Mit Supabase-Sync werden gespeicherte Personen wieder geladen.</div>
    `;

    selectRow.insertAdjacentElement("afterend", row);
  }

  function enhanceChips() {
    document.querySelectorAll(".partner-chip").forEach(chip => chip.classList.add("loaded"));
  }

  window.loadPeopleFromSupabase = async function () {
    try {
      if (!window.callSoraya) throw new Error("Backend-Verbindung ist noch nicht bereit.");
      setSyncStatus("Lade Personen aus Supabase ...", false);

      const json = await window.callSoraya("/mobile/people/list", null, "GET");
      const people = (json.data && (json.data.people || json.data)) || [];
      if (!Array.isArray(people)) throw new Error("Unerwartetes Format von /mobile/people/list.");

      const current = readCache();
      writeCache(current.concat(people.map(normalizePerson)));

      if (typeof window.refreshSynastryPeople === "function") {
        window.refreshSynastryPeople();
      }

      const partnerCount = people.filter(p => !p.is_self).length;
      setSyncStatus(`✅ ${people.length} Person(en) geladen · ${partnerCount} mögliche Partnerperson(en).`, true);
      enhanceChips();

      if (window.toast) toast("Personen aus Supabase geladen.");
    } catch (err) {
      setSyncStatus("Supabase-Liste noch nicht verfügbar: " + err.message, false);
      if (window.toast) toast("Personenliste konnte nicht geladen werden.");
    }
  };

  function wrapCreateSynastryPerson() {
    const oldCreate = window.createSynastryPerson;
    if (typeof oldCreate !== "function" || oldCreate.__phaseB4Wrapped) return;

    const wrapped = async function () {
      const result = await oldCreate.apply(this, arguments);
      setTimeout(() => {
        if (typeof window.loadPeopleFromSupabase === "function") {
          window.loadPeopleFromSupabase();
        }
      }, 900);
      return result;
    };

    wrapped.__phaseB4Wrapped = true;
    window.createSynastryPerson = wrapped;
  }

  function boot() {
    addSyncUI();
    wrapCreateSynastryPerson();

    const active = document.querySelector(".section.active");
    if (active && active.id === "synastry") {
      setTimeout(() => window.loadPeopleFromSupabase && window.loadPeopleFromSupabase(), 300);
    }
  }

  window.addEventListener("load", () => {
    setTimeout(boot, 650);

    const oldShowSection = window.showSection;
    if (typeof oldShowSection === "function" && !oldShowSection.__phaseB4Wrapped) {
      const wrappedShow = function (id) {
        oldShowSection(id);
        if (id === "synastry") {
          setTimeout(() => {
            addSyncUI();
            wrapCreateSynastryPerson();
            if (typeof window.loadPeopleFromSupabase === "function") window.loadPeopleFromSupabase();
          }, 250);
        }
      };
      wrappedShow.__phaseB4Wrapped = true;
      window.showSection = wrappedShow;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4.1: login guard and visible session check ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  async function getSessionSafe() {
    try {
      if (!window.sb && typeof window.loadConfig === "function") {
        window.loadConfig();
      }
      if (!window.sb && typeof sb !== "undefined") {
        window.sb = sb;
      }
      const client = window.sb || (typeof sb !== "undefined" ? sb : null);
      if (!client || !client.auth) return { ok: false, error: "Supabase-Verbindung fehlt." };

      const { data, error } = await client.auth.getSession();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.session || !data.session.access_token) {
        return { ok: false, error: "Nicht eingeloggt oder Session abgelaufen." };
      }
      return { ok: true, session: data.session };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function ensureLoggedIn(actionName) {
    const result = await getSessionSafe();
    if (result.ok) return true;

    const message = "Bitte zuerst einloggen. " + (actionName ? "Dann erneut: " + actionName + "." : "");
    if (window.toast) toast(message);
    if (window.status) {
      ["personResult", "partnerCreateStatus", "synastryText", "peopleSyncStatus"].forEach(id => {
        const node = el(id);
        if (node) {
          if (id === "peopleSyncStatus") node.textContent = message;
          else status(id, message, "bad");
        }
      });
    }

    if (typeof window.openLogin === "function") {
      window.openLogin();
      const authStatus = el("authStatus");
      if (authStatus) {
        authStatus.textContent = "Deine Session fehlt oder ist abgelaufen. Bitte mit E-Mail und Passwort einloggen.";
        authStatus.classList.remove("ok");
        authStatus.classList.add("bad");
      }
    }

    return false;
  }

  function addSessionCard() {
    if (el("loginSessionCard")) return;

    const profile = el("profile");
    if (!profile) return;

    const card = document.createElement("div");
    card.id = "loginSessionCard";
    card.className = "card login-session-card";
    card.innerHTML = `
      <h4>Login-Status</h4>
      <p id="loginSessionText">Session wird geprüft ...</p>
      <button class="btn gold" onclick="window.checkLoginSession()">Login prüfen</button>
      <button class="btn" onclick="openLogin()" style="margin-left:8px">Einloggen</button>
    `;

    const title = profile.querySelector(".page-title");
    if (title) title.insertAdjacentElement("afterend", card);
  }

  window.checkLoginSession = async function () {
    addSessionCard();
    const card = el("loginSessionCard");
    const text = el("loginSessionText");
    const result = await getSessionSafe();

    if (result.ok) {
      if (card) card.classList.add("ok");
      if (text) text.textContent = "✅ Eingeloggt als " + (result.session.user && result.session.user.email ? result.session.user.email : "Supabase User") + ". Mobile Endpoints sind bereit.";
      if (window.toast) toast("Login aktiv.");
      return true;
    }

    if (card) card.classList.remove("ok");
    if (text) text.textContent = "⚠️ Nicht eingeloggt: " + result.error;
    if (window.toast) toast("Bitte einloggen.");
    return false;
  };

  function wrapAction(name, label) {
    const oldFn = window[name];
    if (typeof oldFn !== "function" || oldFn.__phaseB41Wrapped) return;

    const wrapped = async function () {
      const ok = await ensureLoggedIn(label);
      if (!ok) return;
      return oldFn.apply(this, arguments);
    };

    wrapped.__phaseB41Wrapped = true;
    window[name] = wrapped;
  }

  window.addEventListener("load", () => {
    setTimeout(() => {
      addSessionCard();
      window.checkLoginSession && window.checkLoginSession();

      wrapAction("createPerson", "Profil speichern");
      wrapAction("createSynastryPerson", "Zweite Person speichern");
      wrapAction("saveSynastry", "Verbindung berechnen");
      wrapAction("loadPeopleFromSupabase", "Aus Supabase laden");
      wrapAction("loadAnalysis", "Analyse öffnen");
      wrapAction("loadHoroscope", "Horoskop laden");
      wrapAction("sendChat", "Chat senden");
    }, 800);
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4.2: premium UX cleanup ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function cleanSyncText() {
    const node = el("peopleSyncStatus");
    if (!node) return;

    const txt = node.textContent || "";
    if (txt.includes("Person(en) geladen")) {
      const match = txt.match(/(\d+)\s+Person\(en\).*?(\d+)\s+mögliche/);
      if (match) {
        node.textContent = "Gespeicherte Personen bereit · " + match[2] + " auswählbar";
      } else {
        node.textContent = "Gespeicherte Personen bereit";
      }
      node.classList.add("soraya-ok");
    } else if (txt.includes("Personenliste wird lokal")) {
      node.textContent = "Gespeicherte Personen werden automatisch geladen.";
      node.classList.remove("soraya-ok");
    } else if (txt.includes("Supabase-Liste noch nicht")) {
      node.textContent = "Noch keine gespeicherte Personenliste verfügbar.";
      node.classList.remove("soraya-ok");
    }
  }

  function cleanLoginCard() {
    const text = el("loginSessionText");
    const body = document.body;
    if (!text || !body) return;

    const txt = text.textContent || "";
    if (txt.includes("✅") || txt.includes("Eingeloggt")) {
      body.classList.remove("soraya-needs-login");
    } else {
      body.classList.add("soraya-needs-login");
    }
  }

  function wrapAddPersonForm() {
    const card = el("phaseB3PartnerCard");
    if (!card || card.dataset.b42Wrapped === "true") return;

    const title = Array.from(card.querySelectorAll("h4")).find(h => (h.textContent || "").includes("Neue Person anlegen"));
    if (!title) return;

    const container = title.closest("div[style*='margin-top']") || title.parentElement;
    if (!container || container.closest("details.soraya-add-person")) return;

    const details = document.createElement("details");
    details.className = "soraya-add-person";
    details.open = false;

    const summary = document.createElement("summary");
    summary.textContent = "＋ Neue Person anlegen";
    details.appendChild(summary);

    container.parentNode.insertBefore(details, container);
    details.appendChild(container);

    // Make duplicate heading smaller by changing text
    title.textContent = "Geburtsdaten";
    card.dataset.b42Wrapped = "true";
  }

  function cleanSelectOptions() {
    const select = el("synPersonSelect");
    if (!select) return;

    const seen = new Set();
    Array.from(select.options).forEach(option => {
      const normalized = (option.textContent || "").trim().toLowerCase();
      if (!option.value) return;
      if (seen.has(normalized)) {
        option.remove();
      } else {
        seen.add(normalized);
      }
    });
  }

  function polish() {
    cleanSyncText();
    cleanLoginCard();
    wrapAddPersonForm();
    cleanSelectOptions();
  }

  window.addEventListener("load", () => {
    setTimeout(polish, 700);
    setTimeout(polish, 1400);

    const oldShowSection = window.showSection;
    if (typeof oldShowSection === "function" && !oldShowSection.__phaseB42Wrapped) {
      const wrappedShow = function (id) {
        oldShowSection(id);
        setTimeout(polish, 300);
        setTimeout(polish, 900);
      };
      wrappedShow.__phaseB42Wrapped = true;
      window.showSection = wrappedShow;
    }

    const oldLoadPeople = window.loadPeopleFromSupabase;
    if (typeof oldLoadPeople === "function" && !oldLoadPeople.__phaseB42Wrapped) {
      const wrappedLoad = async function () {
        const result = await oldLoadPeople.apply(this, arguments);
        setTimeout(polish, 150);
        return result;
      };
      wrappedLoad.__phaseB42Wrapped = true;
      window.loadPeopleFromSupabase = wrappedLoad;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4.3: custom luxury person picker logic ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function parseOptionLabel(option) {
    const raw = (option.textContent || "").trim();
    const parts = raw.split("·").map(x => x.trim()).filter(Boolean);
    return {
      title: parts[0] || raw || "Person",
      subtitle: parts.slice(1).join(" · ")
    };
  }

  function ensurePicker() {
    const select = el("synPersonSelect");
    if (!select) return;

    let picker = el("sorayaPersonPicker");
    if (!picker) {
      picker = document.createElement("div");
      picker.id = "sorayaPersonPicker";
      picker.className = "soraya-person-picker";
      picker.innerHTML = `
        <button type="button" class="soraya-person-trigger" id="sorayaPersonTrigger">Person auswählen<span>Gespeicherte Partnerperson</span></button>
        <div class="soraya-person-menu" id="sorayaPersonMenu"></div>
      `;
      select.insertAdjacentElement("afterend", picker);

      const trigger = el("sorayaPersonTrigger");
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        picker.classList.toggle("open");
      });

      document.addEventListener("click", (event) => {
        if (!picker.contains(event.target)) picker.classList.remove("open");
      });
    }

    renderPickerOptions();
  }

  function renderPickerOptions() {
    const select = el("synPersonSelect");
    const picker = el("sorayaPersonPicker");
    const menu = el("sorayaPersonMenu");
    const trigger = el("sorayaPersonTrigger");
    if (!select || !picker || !menu || !trigger) return;

    const options = Array.from(select.options);
    const realOptions = options.filter(o => o.value);

    if (!realOptions.length) {
      menu.innerHTML = `<button type="button" class="soraya-person-option empty">Noch keine Person gespeichert<small>Lege unten eine zweite Person an.</small></button>`;
      trigger.innerHTML = `Person auswählen<span>Noch keine gespeicherte Partnerperson</span>`;
      return;
    }

    const seen = new Set();
    const unique = [];
    realOptions.forEach(o => {
      const parsed = parseOptionLabel(o);
      const key = (parsed.title + "|" + parsed.subtitle).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(o);
      }
    });

    menu.innerHTML = unique.map(o => {
      const p = parseOptionLabel(o);
      const active = o.value === select.value ? " active" : "";
      return `<button type="button" class="soraya-person-option${active}" data-value="${o.value.replace(/"/g, "&quot;")}">${p.title}<small>${p.subtitle || "gespeichert"}</small></button>`;
    }).join("");

    menu.querySelectorAll("[data-value]").forEach(btn => {
      btn.addEventListener("click", () => {
        select.value = btn.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        const p = { title: btn.childNodes[0].textContent.trim(), subtitle: btn.querySelector("small") ? btn.querySelector("small").textContent : "" };
        trigger.innerHTML = `${p.title}<span>${p.subtitle || "gespeicherte Person"}</span>`;
        picker.classList.remove("open");
        renderPickerOptions();
      });
    });

    const selected = unique.find(o => o.value === select.value);
    if (selected) {
      const p = parseOptionLabel(selected);
      trigger.innerHTML = `${p.title}<span>${p.subtitle || "gespeicherte Person"}</span>`;
    } else {
      trigger.innerHTML = `Person auswählen<span>${unique.length} gespeicherte Person(en)</span>`;
    }
  }

  function cleanTechnicalCopy() {
    const sync = el("peopleSyncStatus");
    if (sync) {
      const text = sync.textContent || "";
      if (text.includes("auswählbar") || text.includes("geladen")) {
        const m = text.match(/(\d+)\s+auswählbar|(\d+)\s+mögliche/);
        const count = m ? (m[1] || m[2]) : "";
        sync.textContent = count ? `✦ ${count} gespeicherte Partnerperson(en)` : "✦ Gespeicherte Personen bereit";
      }
    }

    // Remove duplicated self names from native select before picker reads it.
    const select = el("synPersonSelect");
    if (select) {
      const seen = new Set();
      Array.from(select.options).forEach(option => {
        if (!option.value) return;
        const key = (option.textContent || "").trim().toLowerCase();
        if (seen.has(key)) option.remove();
        else seen.add(key);
      });
    }
  }

  function bootPicker() {
    cleanTechnicalCopy();
    ensurePicker();
    renderPickerOptions();
  }

  window.addEventListener("load", () => {
    setTimeout(bootPicker, 900);
    setTimeout(bootPicker, 1600);

    const oldShow = window.showSection;
    if (typeof oldShow === "function" && !oldShow.__phaseB43Wrapped) {
      const wrapped = function (id) {
        oldShow(id);
        setTimeout(bootPicker, 350);
        setTimeout(bootPicker, 1000);
      };
      wrapped.__phaseB43Wrapped = true;
      window.showSection = wrapped;
    }

    const oldRefresh = window.refreshSynastryPeople;
    if (typeof oldRefresh === "function" && !oldRefresh.__phaseB43Wrapped) {
      const wrappedRefresh = function () {
        const result = oldRefresh.apply(this, arguments);
        setTimeout(bootPicker, 120);
        return result;
      };
      wrappedRefresh.__phaseB43Wrapped = true;
      window.refreshSynastryPeople = wrappedRefresh;
    }

    const oldLoad = window.loadPeopleFromSupabase;
    if (typeof oldLoad === "function" && !oldLoad.__phaseB43Wrapped) {
      const wrappedLoad = async function () {
        const result = await oldLoad.apply(this, arguments);
        setTimeout(bootPicker, 180);
        return result;
      };
      wrappedLoad.__phaseB43Wrapped = true;
      window.loadPeopleFromSupabase = wrappedLoad;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4.4: inline picker refinement ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  function closePickerAfterChoice() {
    const menu = el("sorayaPersonMenu");
    const picker = el("sorayaPersonPicker");
    if (!menu || !picker || picker.dataset.b44Bound === "true") return;

    picker.dataset.b44Bound = "true";
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".soraya-person-option[data-value]");
      if (!option) return;
      setTimeout(() => {
        picker.classList.remove("open");
      }, 80);
    });
  }

  function improveTriggerCopy() {
    const trigger = el("sorayaPersonTrigger");
    if (!trigger) return;

    const text = trigger.textContent || "";
    if (text.includes("Person auswählen") && text.includes("gespeicherte Person")) {
      const count = (text.match(/\d+/) || [""])[0];
      trigger.innerHTML = `Person auswählen<span>${count ? count + " gespeicherte Partnerperson(en)" : "Gespeicherte Partnerperson"}</span>`;
    }
  }

  function reduceSelfDuplicateOptions() {
    const select = el("synPersonSelect");
    if (!select) return;

    const currentName = (localStorage.getItem("soraya_person_name") || "").trim().toLowerCase();
    let selfSeen = false;

    Array.from(select.options).forEach(option => {
      if (!option.value) return;
      const label = (option.textContent || "").trim().toLowerCase();

      // Keep at most one own profile option if it appears by mistake.
      if (currentName && label.startsWith(currentName)) {
        if (selfSeen) option.remove();
        selfSeen = true;
      }
    });
  }

  function polishB44() {
    reduceSelfDuplicateOptions();
    improveTriggerCopy();
    closePickerAfterChoice();
  }

  window.addEventListener("load", () => {
    setTimeout(polishB44, 900);
    setTimeout(polishB44, 1700);

    const oldShow = window.showSection;
    if (typeof oldShow === "function" && !oldShow.__phaseB44Wrapped) {
      const wrapped = function (id) {
        oldShow(id);
        setTimeout(polishB44, 300);
        setTimeout(polishB44, 900);
      };
      wrapped.__phaseB44Wrapped = true;
      window.showSection = wrapped;
    }

    const oldLoad = window.loadPeopleFromSupabase;
    if (typeof oldLoad === "function" && !oldLoad.__phaseB44Wrapped) {
      const wrappedLoad = async function () {
        const result = await oldLoad.apply(this, arguments);
        setTimeout(polishB44, 200);
        return result;
      };
      wrappedLoad.__phaseB44Wrapped = true;
      window.loadPeopleFromSupabase = wrappedLoad;
    }
  });
})();

/* =========================================================
   Soraya Phase C.1 — extracted scripts
   ========================================================= */

/* ===== Phase B.4.5: login recovery logic ===== */
(function () {
  function el(id) { return document.getElementById(id); }

  async function sessionState() {
    try {
      if (!window.sb && typeof window.loadConfig === "function") window.loadConfig();
      const client = window.sb || (typeof sb !== "undefined" ? sb : null);
      if (!client || !client.auth) return { ok: false, error: "Supabase-Verbindung fehlt." };
      const { data, error } = await client.auth.getSession();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.session || !data.session.access_token) return { ok: false, error: "Nicht eingeloggt." };
      return { ok: true, session: data.session };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function ensureQuickLoginButton() {
    const profileCard = document.querySelector("#profile .profile-hero");
    if (!profileCard || el("profileLoginQuickButton")) return;

    const wrap = document.createElement("div");
    wrap.id = "profileLoginQuickButton";
    wrap.innerHTML = `
      <button class="btn gold" onclick="openLogin()">Einloggen</button>
      <div class="soraya-auth-mini">Du bist abgemeldet. Logge dich ein, um Profil, Synastrie und Chat zu speichern.</div>
    `;

    const card = profileCard.closest(".card");
    if (card) card.appendChild(wrap);
  }

  function findLogoutButton() {
    const buttons = Array.from(document.querySelectorAll("#profile button, #profile .btn"));
    return buttons.find(btn => (btn.textContent || "").includes("Abmelden") || (btn.textContent || "").includes("Einloggen"));
  }

  async function renderAuthUi() {
    ensureQuickLoginButton();

    const state = await sessionState();
    const body = document.body;
    const loginText = el("loginSessionText");
    const loginCard = el("loginSessionCard");
    const logoutBtn = findLogoutButton();

    if (state.ok) {
      body.classList.remove("soraya-logged-out", "soraya-needs-login");

      if (loginText) loginText.textContent = "✅ Eingeloggt als " + (state.session.user && state.session.user.email ? state.session.user.email : "Supabase User") + ". Mobile Endpoints sind bereit.";
      if (loginCard) loginCard.classList.add("ok");

      if (logoutBtn) {
        logoutBtn.textContent = "⇥ Abmelden";
        logoutBtn.onclick = window.signOut;
      }
      return true;
    }

    body.classList.add("soraya-logged-out", "soraya-needs-login");

    if (loginText) loginText.textContent = "Du bist abgemeldet. Bitte einloggen, um Daten zu speichern.";
    if (loginCard) loginCard.classList.remove("ok");

    if (logoutBtn) {
      logoutBtn.textContent = "Einloggen";
      logoutBtn.onclick = function () {
        if (typeof window.openLogin === "function") window.openLogin();
      };
    }

    return false;
  }

  function wrapAuthFunctions() {
    const oldSignOut = window.signOut;
    if (typeof oldSignOut === "function" && !oldSignOut.__phaseB45Wrapped) {
      const wrappedOut = async function () {
        const result = await oldSignOut.apply(this, arguments);
        setTimeout(renderAuthUi, 150);
        setTimeout(() => {
          if (window.toast) toast("Du bist abgemeldet. Einloggen ist im Profil wieder sichtbar.");
        }, 250);
        return result;
      };
      wrappedOut.__phaseB45Wrapped = true;
      window.signOut = wrappedOut;
    }

    const oldSignIn = window.signIn;
    if (typeof oldSignIn === "function" && !oldSignIn.__phaseB45Wrapped) {
      const wrappedIn = async function () {
        const result = await oldSignIn.apply(this, arguments);
        setTimeout(renderAuthUi, 250);
        return result;
      };
      wrappedIn.__phaseB45Wrapped = true;
      window.signIn = wrappedIn;
    }
  }

  window.sorayaRenderAuthUi = renderAuthUi;

  window.addEventListener("load", () => {
    setTimeout(() => {
      ensureQuickLoginButton();
      wrapAuthFunctions();
      renderAuthUi();
    }, 900);

    const oldShow = window.showSection;
    if (typeof oldShow === "function" && !oldShow.__phaseB45Wrapped) {
      const wrappedShow = function (id) {
        oldShow(id);
        if (id === "profile") {
          setTimeout(() => {
            ensureQuickLoginButton();
            wrapAuthFunctions();
            renderAuthUi();
          }, 250);
        }
      };
      wrappedShow.__phaseB45Wrapped = true;
      window.showSection = wrappedShow;
    }
  });
})();
