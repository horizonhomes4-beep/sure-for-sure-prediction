import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase, ref, push, set, update, get, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { firebaseConfig, emailjsConfig } from './config.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validEmail = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '').trim()) && String(value).length <= 254;
const MAX_RECIPIENTS = 100, HISTORY_LIMIT = 50;
let auth, db, currentUid = null, recipients = [], mode = 'text', busy = false, stopRequested = false;
let historyRecords = {};

function setStatus(message) { $('sendStatus').textContent = message; }
function saveDraft() {
  try { localStorage.setItem('mailStudioDraft', JSON.stringify({
    sender:$('sender').value, replyTo:$('replyTo').value, subject:$('subject').value,
    body:$('body').value, mode, recipients:recipients.slice(0, MAX_RECIPIENTS)
  })); } catch (error) { console.warn('Draft could not be saved locally.', error); }
}
function renderRecipients() {
  $('count').textContent = recipients.length;
  $('recipientList').innerHTML = recipients.map((r,i)=>`<div class="recipient"><span>${escapeHTML(r.name || r.email)}${r.name ? `<small>${escapeHTML(r.email)}</small>` : ''}</span><button type="button" class="danger" data-index="${i}" aria-label="Remove ${escapeHTML(r.email)}">Remove</button></div>`).join('') || '<p class="muted">No recipients added yet.</p>';
  $('add').disabled = recipients.length >= MAX_RECIPIENTS;
  $('import').disabled = recipients.length >= MAX_RECIPIENTS;
  $('csv').disabled = recipients.length >= MAX_RECIPIENTS;
  saveDraft();
}
function addRecipient(email, name='') {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0,100);
  if (!validEmail(email) || recipients.length >= MAX_RECIPIENTS || recipients.some(r=>r.email===email)) return false;
  recipients.push({email,name}); renderRecipients(); return true;
}
function parseAddressLine(line) {
  const match = String(line).trim().match(/^(.*?)\s*<([^<>]+)>$/);
  return match ? {email:match[2], name:match[1].trim().replace(/^['"]|['"]$/g,'')} : {email:String(line).trim(),name:''};
}
function parseCSV(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}
  row.push(field); if(row.some(v=>v.trim()))rows.push(row); return rows;
}
function downloadCSV(filename, rows) {
  const csv = rows.map(row=>row.map(v=>`"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cleanHTML(html) {
  return window.DOMPurify ? DOMPurify.sanitize(html,{USE_PROFILES:{html:true},FORBID_TAGS:['style','iframe','form','input','button','object','embed']}) : escapeHTML(html).replace(/\n/g,'<br>');
}
function personalize(text, recipient) {
  return String(text).replace(/{{\s*name\s*}}/gi, recipient.name || recipient.email).replace(/{{\s*email\s*}}/gi, recipient.email);
}
function renderPreview() {
  const content=$('body').value;
  if(mode==='html') $('preview').innerHTML=cleanHTML(content);
  else $('preview').textContent=content || '';
  saveDraft();
}
function setMode(nextMode) {
  mode=nextMode;
  $('plainTab').classList.toggle('active',mode==='text');$('htmlTab').classList.toggle('active',mode==='html');
  $('body').placeholder=mode==='html'?'Paste or write HTML source here…':'Write your email message here…';
  renderPreview();
}
function setProgress(done,total) { $('progress').style.width=(total?Math.min(100,done/total*100):0)+'%'; }
function sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }

$('add').addEventListener('click',()=>{if(!addRecipient($('address').value,$('recipientName').value)){setStatus('That address is invalid, already added, or the 100-recipient limit has been reached.');return;} $('address').value='';$('recipientName').value='';});
$('address').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('add').click();}});
$('recipientList').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b&&!busy){recipients.splice(Number(b.dataset.index),1);renderRecipients();}});
$('import').addEventListener('click',()=>{let added=0,skipped=0;for(const line of $('bulk').value.split(/[\n\r;]+/).map(s=>s.trim()).filter(Boolean)){const parsed=parseAddressLine(line);if(addRecipient(parsed.email,parsed.name))added++;else skipped++;if(recipients.length>=MAX_RECIPIENTS)break;} $('bulk').value='';setStatus(`Added ${added} address(es). Skipped ${skipped} invalid, duplicate, or over-limit entry/entries.`);});
$('clear').addEventListener('click',()=>{if(!busy&&recipients.length&&confirm('Remove all recipients from the current draft?')){recipients=[];renderRecipients();}});
$('csv').addEventListener('click',()=>$('csvFile').click());
$('csvFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){alert('CSV file is too large. Please use a file under 2 MB.');e.target.value='';return;}try{const rows=parseCSV(await file.text());let added=0,skipped=0;for(const row of rows){if((row[0]||'').trim().toLowerCase()==='email')continue;if(addRecipient(row[0],row[1]||''))added++;else skipped++;if(recipients.length>=MAX_RECIPIENTS)break;}setStatus(`CSV import complete: ${added} added, ${skipped} skipped.`);}catch(error){alert('Could not read this CSV file.');}finally{e.target.value='';}});
$('export').addEventListener('click',()=>downloadCSV('mail-studio-recipients.csv',[['email','name'],...recipients.map(r=>[r.email,r.name])]));
$('plainTab').addEventListener('click',()=>setMode('text'));$('htmlTab').addEventListener('click',()=>setMode('html'));
['sender','replyTo','subject','body'].forEach(id=>$(id).addEventListener('input',renderPreview));
$('stop').addEventListener('click',()=>{stopRequested=true;$('stop').disabled=true;setStatus('Stop requested. The current email request will finish, then sending will stop.');});

$('send').addEventListener('click',async()=>{
  if(busy||!currentUid)return;
  const subject=$('subject').value.trim(), body=$('body').value, sender=$('sender').value.trim(), replyTo=$('replyTo').value.trim();
  if(!sender||!subject||!body.trim()||!recipients.length){alert('Enter a sender name, subject, message, and at least one recipient.');return;}
  if(replyTo&&!validEmail(replyTo)){alert('Enter a valid reply-to email address.');return;}
  if(recipients.length>MAX_RECIPIENTS){alert(`A campaign can contain no more than ${MAX_RECIPIENTS} recipients.`);return;}
  if(!$('consent').checked){alert('Please confirm recipient consent before sending.');return;}
  if(!window.emailjs || typeof emailjs.send!=='function'){alert('EmailJS did not load. Check your internet connection and reload the page.');return;}
  if(!confirm(`Send “${subject}” to ${recipients.length} recipient(s), one email at a time?`))return;

  busy=true;stopRequested=false;$('send').disabled=true;$('stop').disabled=false;
  const list=recipients.map(r=>({...r}));let accepted=0,failed=0,results=[],campaignKey=null;
  const delay=Math.max(1500,Math.min(10000,Number($('delay').value)||2500));
  try {
    const campaignRef=push(ref(db,'campaigns'));campaignKey=campaignRef.key;
    await set(campaignRef,{subject,sender,replyTo,format:mode,body,recipientCount:list.length,accepted:0,failed:0,status:'sending',createdAt:Date.now(),createdBy:currentUid,results:[]});
    for(let i=0;i<list.length;i++){
      if(stopRequested)break;
      const recipient=list[i], personalized=personalize(body,recipient);let errorText='';
      try{
        const html=mode==='html'?cleanHTML(personalized):escapeHTML(personalized).replace(/\r?\n/g,'<br>');
        const params={to_email:recipient.email,to_name:recipient.name||recipient.email,from_name:sender,reply_to:replyTo,subject,message:mode==='text'?personalized:'',html_message:html};
        await emailjs.send(emailjsConfig.serviceId,emailjsConfig.templateId,params,{publicKey:emailjsConfig.publicKey});
        accepted++;
      }catch(error){failed++;errorText=String(error?.text||error?.message||error||'EmailJS request failed').slice(0,240);}
      results.push({email:recipient.email,name:recipient.name||'',status:errorText?'failed':'accepted',error:errorText,processedAt:Date.now()});
      setProgress(i+1,list.length);
      setStatus(`Processed ${i+1} of ${list.length}. Accepted: ${accepted}; failed: ${failed}${stopRequested?'; stopping':''}.`);
      await update(ref(db,`campaigns/${campaignKey}`),{accepted,failed,results,status:'sending',lastUpdatedAt:Date.now()});
      if(i<list.length-1&&!stopRequested)await sleep(delay);
    }
    const status=stopRequested?'stopped':failed?'completed_with_errors':'completed';
    await update(ref(db,`campaigns/${campaignKey}`),{accepted,failed,results,status,finishedAt:Date.now(),lastUpdatedAt:Date.now()});
    setStatus(`Campaign ${status.replaceAll('_',' ')}. Accepted: ${accepted}; failed: ${failed}; not attempted: ${list.length-results.length}. “Accepted” means the provider accepted the request, not confirmed inbox delivery.`);
    await loadHistory();
  }catch(error){
    setStatus(`Campaign/database error: ${String(error?.message||error)}. Check Firebase permissions and your connection.`);
    if(campaignKey){try{await update(ref(db,`campaigns/${campaignKey}`),{status:'interrupted',accepted,failed,results,lastUpdatedAt:Date.now()});}catch{}}
  }finally{busy=false;$('send').disabled=false;$('stop').disabled=true;saveDraft();}
});

async function loadHistory(){
  if(!currentUid)return;
  $('history').innerHTML='<tr><td colspan="7">Loading history…</td></tr>';
  try{
    const snapshot=await get(query(ref(db,'campaigns'),orderByChild('createdAt'),limitToLast(HISTORY_LIMIT)));
    const entries=Object.entries(snapshot.val()||{}).sort((a,b)=>(b[1]?.createdAt||0)-(a[1]?.createdAt||0));
    historyRecords=Object.fromEntries(entries);
    $('history').innerHTML=entries.map(([key,c])=>{
      const status=String(c.status||'unknown'), tagClass=status==='completed'?'':(['completed_with_errors','interrupted'].includes(status)?'bad':'pending');
      return `<tr><td>${escapeHTML(c.createdAt?new Date(c.createdAt).toLocaleString():'—')}</td><td>${escapeHTML(c.subject||'(no subject)')}</td><td>${Number(c.recipientCount)||0}</td><td>${Number(c.accepted)||0}</td><td>${Number(c.failed)||0}</td><td><span class="status-tag ${tagClass}">${escapeHTML(status.replaceAll('_',' '))}</span></td><td><button class="secondary" data-history-id="${escapeHTML(key)}">View</button></td></tr>`;
    }).join('')||'<tr><td colspan="7">No campaign history yet.</td></tr>';
  }catch(error){$('history').innerHTML=`<tr><td colspan="7">Unable to load history: ${escapeHTML(error?.message||error)}</td></tr>`;}
}
function openHistory(key){
  const c=historyRecords[key];if(!c)return;
  const results=Array.isArray(c.results)?c.results:[];
  $('modalTitle').textContent=c.subject||'Campaign details';
  $('modalContent').innerHTML=`<div class="row mobile-stack"><div class="mini-stat"><strong>${Number(c.recipientCount)||0}</strong><span>Recipients</span></div><div class="mini-stat"><strong>${Number(c.accepted)||0}</strong><span>Accepted by provider</span></div><div class="mini-stat"><strong>${Number(c.failed)||0}</strong><span>Failed requests</span></div></div>
  <p class="muted">Created: ${escapeHTML(c.createdAt?new Date(c.createdAt).toLocaleString():'—')} · Status: ${escapeHTML(c.status||'unknown')} · Format: ${escapeHTML(c.format||'text')}</p>
  <p><strong>Sender:</strong> ${escapeHTML(c.sender||'—')} &nbsp; <strong>Reply-to:</strong> ${escapeHTML(c.replyTo||'—')}</p>
  <p><strong>Message body</strong></p><pre>${escapeHTML(c.body||'')}</pre>
  <p><strong>Recipient results (${results.length})</strong></p>
  <div class="history"><table><thead><tr><th>Email</th><th>Result</th><th>Error</th></tr></thead><tbody>${results.map(r=>`<tr><td>${escapeHTML(r.email)}</td><td>${escapeHTML(r.status)}</td><td>${escapeHTML(r.error||'—')}</td></tr>`).join('')||'<tr><td colspan="3">No individual results recorded.</td></tr>'}</tbody></table></div>
  <div style="margin-top:16px"><button id="exportCampaignResults" class="secondary">Export results CSV</button></div>`;
  $('historyModal').classList.remove('hidden');
  $('exportCampaignResults').addEventListener('click',()=>downloadCSV('campaign-results.csv',[['email','name','status','error'],...results.map(r=>[r.email,r.name,r.status,r.error])]),{once:true});
}
$('history').addEventListener('click',e=>{const b=e.target.closest('[data-history-id]');if(b)openHistory(b.dataset.historyId);});
$('refresh').addEventListener('click',loadHistory);
$('closeModal').addEventListener('click',()=>$('historyModal').classList.add('hidden'));
$('historyModal').addEventListener('click',e=>{if(e.target===$('historyModal'))$('historyModal').classList.add('hidden');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('historyModal').classList.add('hidden');});
$('login').addEventListener('click',async()=>{
  try{$('loginStatus').textContent='Signing in…';$('login').disabled=true;await signInWithEmailAndPassword(auth,$('loginEmail').value.trim(),$('loginPassword').value);}
  catch(error){$('loginStatus').textContent=error?.code==='auth/invalid-credential'?'Email or password is incorrect.':String(error?.message||error);}
  finally{$('login').disabled=false;}
});
$('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('login').click();});
$('logout').addEventListener('click',()=>signOut(auth));

try{
  const draft=JSON.parse(localStorage.getItem('mailStudioDraft')||'{}');
  for(const id of ['sender','replyTo','subject','body'])$(id).value=typeof draft[id]==='string'?draft[id]:'';
  recipients=Array.isArray(draft.recipients)?draft.recipients.filter(r=>r&&validEmail(r.email)).slice(0,MAX_RECIPIENTS).map(r=>({email:r.email,name:String(r.name||'').slice(0,100)})):[];
  setMode(draft.mode==='html'?'html':'text');renderRecipients();
}catch(error){setMode('text');renderRecipients();}

const configured=Boolean(firebaseConfig?.apiKey&&firebaseConfig?.projectId&&emailjsConfig?.serviceId&&emailjsConfig?.templateId&&emailjsConfig?.publicKey);
if(!configured){$('setup').classList.remove('hidden');$('setupState').textContent='Missing configuration values. Check config.js.';$('loginBox').classList.remove('hidden');$('login').disabled=true;}
else{
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);
    if(window.emailjs)emailjs.init({publicKey:emailjsConfig.publicKey});
    $('setup').classList.add('hidden');
    onAuthStateChanged(auth,async user=>{
      currentUid=null;
      if(user){
        try{const adminSnapshot=await get(ref(db,`admins/${user.uid}`));if(adminSnapshot.val()===true)currentUid=user.uid;}
        catch(error){$('loginStatus').textContent=`Unable to verify admin access: ${error?.message||error}`;}
      }
      const allowed=Boolean(currentUid);
      $('app').classList.toggle('hidden',!allowed);$('loginBox').classList.toggle('hidden',allowed);$('logout').classList.toggle('hidden',!user);$('who').textContent=allowed?(user.email||'Administrator'):'';
      if(user&&!allowed)$('loginStatus').textContent=`This account is not authorized. Ask the project owner to add admins/${user.uid} = true in Realtime Database.`;
      if(allowed)await loadHistory();
    });
  }catch(error){$('setup').classList.remove('hidden');$('setupState').textContent=`Initialization error: ${error?.message||error}`;$('loginBox').classList.remove('hidden');}
}