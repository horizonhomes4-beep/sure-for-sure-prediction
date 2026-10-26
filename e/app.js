import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,addDoc,updateDoc,doc,getDocs,query,orderBy,limit,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseConfig,emailjsConfig,adminUid} from './config.js';
const $=id=>document.getElementById(id), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let auth,db,uid=null,recipients=[],mode='text',busy=false,stop=false;
const valid=s=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)&&s.length<=254;
const configured= firebaseConfig.apiKey!=='REPLACE_ME'&&firebaseConfig.projectId!=='REPLACE_ME'&&adminUid!=='REPLACE_WITH_ADMIN_UID';
function saveDraft(){localStorage.setItem('mailStudioDraft',JSON.stringify({sender:$('sender').value,replyTo:$('replyTo').value,subject:$('subject').value,body:$('body').value,mode,recipients}));}
function renderRecipients(){ $('count').textContent=recipients.length; $('recipientList').innerHTML=recipients.map((r,i)=>`<div class="recipient"><span>${escape(r.name||r.email)} <small>${r.name?escape(r.email):''}</small></span><button class="danger" data-index="${i}">×</button></div>`).join('');saveDraft(); }
function addRecipient(email,name=''){email=email.trim().toLowerCase();if(!valid(email))return false;if(recipients.some(r=>r.email===email))return false;recipients.push({email,name:name.trim().slice(0,100)});renderRecipients();return true;}
$('add').onclick=()=>{if(!addRecipient($('address').value,$('recipientName').value))alert('Invalid or duplicate email.');else{$('address').value='';$('recipientName').value='';}};
$('recipientList').onclick=e=>{const b=e.target.closest('[data-index]');if(b&&!busy){recipients.splice(Number(b.dataset.index),1);renderRecipients();}};
$('import').onclick=()=>{let n=0;for(const part of $('bulk').value.split(/[\n;,]+/)){const m=part.trim().match(/^(.*?)\s*<([^<>]+)>$/);if(addRecipient(m?m[2]:part,m?m[1].replace(/^['"]|['"]$/g,''):''))n++;}alert(`Added ${n} addresses (invalid and duplicate entries skipped).`);$('bulk').value='';};
$('clear').onclick=()=>{if(!busy&&confirm('Clear all recipients?')){recipients=[];renderRecipients();}};
$('csv').onclick=()=>$('csvFile').click();
function parseCSV(t){let rows=[],row=[],field='',quoted=false;for(let i=0;i<t.length;i++){let c=t[i];if(c==='"'){if(quoted&&t[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&t[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;}
$('csvFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const rows=parseCSV(await f.text());let n=0;for(const row of rows){if(row[0].trim().toLowerCase()==='email')continue;if(addRecipient(row[0],row[1]||''))n++;}alert(`Imported ${n} recipients.`);e.target.value='';};
$('export').onclick=()=>{const csv='email,name\r\n'+recipients.map(r=>[r.email,r.name].map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='recipients.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
function preview(){let content=$('body').value;if(mode==='html')$('preview').innerHTML=DOMPurify.sanitize(content,{USE_PROFILES:{html:true}});else $('preview').textContent=content||'Your preview will appear here.';saveDraft();}
function setMode(m){mode=m;$('plainTab').className=m==='text'?'':'secondary';$('htmlTab').className=m==='html'?'':'secondary';$('body').placeholder=m==='html'?'<h1>Hello {{name}}</h1>':'Write your message here…';preview();}
$('plainTab').onclick=()=>setMode('text');$('htmlTab').onclick=()=>setMode('html');for(const id of ['sender','replyTo','subject','body'])$(id).addEventListener('input',preview);
const replace=(s,r)=>s.replace(/{{\s*name\s*}}/gi,r.name||r.email).replace(/{{\s*email\s*}}/gi,r.email);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function setStatus(s){$('sendStatus').textContent=s;}
$('stop').onclick=()=>{stop=true;setStatus('Stop requested. Finishing current request…');};
$('send').onclick=async()=>{
 if(busy||!uid)return;const subject=$('subject').value.trim(),body=$('body').value,sender=$('sender').value.trim(),reply=$('replyTo').value.trim();
 if(!subject||!body.trim()||!sender||!recipients.length)return alert('Enter sender name, subject, message and recipients.');
 if(reply&&!valid(reply))return alert('Enter a valid reply-to email.');
 if(!$('consent').checked)return alert('Confirm recipient consent before sending.');
 if(recipients.length>100)return alert('For safety this browser sender is limited to 100 recipients per campaign.');
 if(!confirm(`Send to ${recipients.length} opted-in recipients?`))return;
 busy=true;stop=false;$('send').disabled=true;$('stop').disabled=false;
 const list=recipients.map(x=>({...x}));let accepted=0,failed=0,results=[],id=null;
 try{
  const ref=await addDoc(collection(db,'campaigns'),{subject,sender,replyTo:reply,format:mode,body,recipients:list,recipientCount:list.length,accepted:0,failed:0,status:'sending',createdAt:serverTimestamp()});id=ref.id;
  for(let i=0;i<list.length;i++){
   if(stop)break;const r=list[i],message=replace(body,r);let error='';
   try{await emailjs.send(emailjsConfig.serviceId,emailjsConfig.templateId,{to_email:r.email,to_name:r.name||r.email,from_name:sender,reply_to:reply,subject,message:mode==='text'?message:'',html_message:mode==='html'?message.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):escape(message).replace(/\n/g,'<br>')},{publicKey:emailjsConfig.publicKey});accepted++;}
   catch(e){failed++;error=String(e?.text||e?.message||e).slice(0,250);}
   results.push({email:r.email,status:error?'failed':'accepted',error});$('progress').style.width=((i+1)/list.length*100)+'%';setStatus(`Processed ${i+1}/${list.length}. Accepted: ${accepted}; Failed: ${failed}.`);
   await updateDoc(doc(db,'campaigns',id),{accepted,failed,results,status:'sending'});
   if(i<list.length-1&&!stop)await sleep(Math.max(1000,Math.min(60000,Number($('delay').value)||2500)));
  }
  await updateDoc(doc(db,'campaigns',id),{accepted,failed,results,status:stop?'stopped':failed?'completed_with_errors':'completed',finishedAt:serverTimestamp()});
  setStatus(`Finished. Accepted: ${accepted}; Failed: ${failed}; Unsent: ${list.length-results.length}.`);await loadHistory();
 }catch(e){setStatus('Campaign error: '+String(e.message||e));if(id)try{await updateDoc(doc(db,'campaigns',id),{status:'interrupted',accepted,failed,results})}catch{}}
 finally{busy=false;$('send').disabled=false;$('stop').disabled=true;}
};
async function loadHistory(){if(!uid)return;try{const snap=await getDocs(query(collection(db,'campaigns'),orderBy('createdAt','desc'),limit(50)));$('history').innerHTML=snap.docs.map(d=>{const x=d.data(),dt=x.createdAt?.toDate?.()?.toLocaleString()||'Pending',details=(x.results||[]).map(r=>`${r.email}: ${r.status}${r.error?' — '+r.error:''}`).join('\n');return `<tr><td>${escape(dt)}</td><td>${escape(x.subject)}</td><td>${x.recipientCount||0}</td><td>${x.accepted||0}</td><td>${x.failed||0}</td><td>${escape(x.status)}</td><td><button class="secondary" data-id="${d.id}">View</button></td></tr>`;}).join('')||'<tr><td colspan="7">No campaigns yet.</td></tr>';window._history=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));}catch(e){$('history').innerHTML=`<tr><td colspan="7">${escape(e.message)}</td></tr>`;}}
$('history').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const x=window._history?.[b.dataset.id];if(x)alert(`Subject: ${x.subject}\nRecipients: ${x.recipientCount}\nAccepted: ${x.accepted}\nFailed: ${x.failed}\n\n`+(x.results||[]).map(r=>`${r.email}: ${r.status}${r.error?' — '+r.error:''}`).join('\n'));};$('refresh').onclick=loadHistory;
$('login').onclick=async()=>{try{$('loginStatus').textContent='Signing in…';await signInWithEmailAndPassword(auth,$('loginEmail').value,$('loginPassword').value);}catch(e){$('loginStatus').textContent=e.message;}};
$('logout').onclick=()=>signOut(auth);
try{const draft=JSON.parse(localStorage.getItem('mailStudioDraft')||'{}');for(const id of ['sender','replyTo','subject','body'])$(id).value=draft[id]||'';recipients=Array.isArray(draft.recipients)?draft.recipients.filter(r=>valid(r.email)).slice(0,100):[];setMode(draft.mode==='html'?'html':'text');renderRecipients();}catch{}
if(!configured){$('setupState').textContent='Firebase setup required. See README.md';$('loginBox').classList.remove('hidden');$('login').disabled=true;}
else{try{const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);emailjs.init({publicKey:emailjsConfig.publicKey});$('setup').classList.add('hidden');onAuthStateChanged(auth,user=>{uid=user?.uid===adminUid?user.uid:null;$('app').classList.toggle('hidden',!uid);$('loginBox').classList.toggle('hidden',!!uid);$('logout').classList.toggle('hidden',!uid);$('who').textContent=uid?user.email:'';if(user&&!uid){$('loginStatus').textContent='This account is not authorized as administrator.';signOut(auth);}if(uid)loadHistory();});}catch(e){$('setupState').textContent=e.message;}}
