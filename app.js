import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot, deleteField } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isScore = value => Number.isInteger(value) && value >= 0 && value <= 10;
const hex = bytes => [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
const normalize = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const roomPattern = /^[a-f0-9]{32}$/;
const state = {room:null, role:'david', priorities:[], houses:[], unsub:[], db:null};
let authReady;

if (firebaseConfig.apiKey === 'PASTE_API_KEY' || firebaseConfig.projectId === 'PASTE_PROJECT_ID') {
  $('setup-error').textContent = 'Firebase needs to be configured first. See README.md.';
  $('create-room').disabled = $('join-room').disabled = true;
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  state.db = getFirestore(app);
  authReady = new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, user => {if(user){stop();resolve(user);}}, reject);
    signInAnonymously(auth).catch(reject);
  });
  const fromUrl = new URLSearchParams(location.search).get('room');
  if (roomPattern.test(fromUrl ?? '')) enterRoom(fromUrl).catch(showSetupError);
}

function showSetupError(error) {$('setup-error').textContent = `Could not open the shared list: ${error.message ?? error}`;}
function message(text) {$('status').textContent=text; clearTimeout(message.timer);message.timer=setTimeout(()=>{$('status').textContent='';},4500);}
function roomDoc() {return doc(state.db,'rooms',state.room);}
function priorityRef(id) {return doc(state.db,'rooms',state.room,'priorities',id);}
function houseRef(id) {return doc(state.db,'rooms',state.room,'houses',id);}
function sortPriorities() {return [...state.priorities].sort((a,b)=>((b.scores?.david ?? 0)+(b.scores?.partner ?? 0))-((a.scores?.david ?? 0)+(a.scores?.partner ?? 0)) || a.label.localeCompare(b.label));}
function roleScore(item) {return item.scores?.[state.role];}
function displayScore(score) {return isScore(score) ? score : '—';}
function total(item) {return (isScore(item.scores?.david)?item.scores.david:0)+(isScore(item.scores?.partner)?item.scores.partner:0);}

async function enterRoom(id, create=false) {
  await authReady;
  if(create) await setDoc(doc(state.db,'rooms',id),{createdAt:Date.now()});
  else if(!(await getDoc(doc(state.db,'rooms',id))).exists()) throw new Error('That code does not match a shared list.');
  state.unsub.forEach(fn=>fn());state.unsub=[];
  state.room=id; state.role=localStorage.getItem(`role-${id}`) || 'david';$('role').value=state.role;
  history.replaceState(null,'',`${location.pathname}?room=${id}`);
  $('room-label').textContent=`Code: ${id}`;$('setup').classList.add('hidden');$('workspace').classList.remove('hidden');
  const fail = error => message(`Sync error: ${error.message}`);
  state.unsub.push(onSnapshot(collection(state.db,'rooms',id,'priorities'), snapshot => {state.priorities=snapshot.docs.map(d=>({id:d.id,...d.data()}));render();},fail));
  state.unsub.push(onSnapshot(collection(state.db,'rooms',id,'houses'), snapshot => {state.houses=snapshot.docs.map(d=>({id:d.id,...d.data()}));render();},fail));
}

$('create-room').addEventListener('click',async()=>{try {const id=hex(crypto.getRandomValues(new Uint8Array(16)));await enterRoom(id,true);}catch(error){showSetupError(error);}});
$('join-room').addEventListener('click',()=>{$('join-form').classList.toggle('hidden');});
$('join-form').addEventListener('submit',async event=>{event.preventDefault();let value=$('room-code').value.trim();try{value=new URL(value).searchParams.get('room') || value;}catch{} if(!roomPattern.test(value))return showSetupError(new Error('Paste a valid invite link or 32-character code.'));try{await enterRoom(value);}catch(error){showSetupError(error);}});
$('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);message('Invite link copied.');}catch{message(`Share this link: ${location.href}`);}});
$('role').addEventListener('change',event=>{state.role=event.target.value;localStorage.setItem(`role-${state.room}`,state.role);render();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.view').forEach(view=>view.classList.toggle('hidden',view.id!==button.dataset.view));}));

async function priorityId(label) {const bytes=new TextEncoder().encode(normalize(label));return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}
$('existing-priority').addEventListener('change',()=>{$('priority-name').disabled=Boolean($('existing-priority').value);$('priority-type').disabled=Boolean($('existing-priority').value);});
$('priority-form').addEventListener('submit',async event=>{
  event.preventDefault();$('priority-error').textContent='';
  const existingId=$('existing-priority').value;
  const label=$('priority-name').value.trim().replace(/\s+/g,' ');
  const score=Number($('priority-score').value);
  if(!existingId && !label)return $('priority-error').textContent='Choose an existing priority or name a new one.';
  if(!isScore(score))return $('priority-error').textContent='Enter a whole number from 0 to 10.';
  const button=event.submitter;button.disabled=true;
  try {
    const id=existingId || await priorityId(label), ref=priorityRef(id);
    if(existingId) {
      await updateDoc(ref,{[`scores.${state.role}`]:score,[`dealbreakers.${state.role}`]:$('priority-dealbreaker').checked});
    } else {
      const found=state.priorities.find(item=>item.id===id);
      if(found && isScore(found.scores?.[state.role]))throw new Error('This priority is already on your list. Edit its score below.');
      if(found) await updateDoc(ref,{[`scores.${state.role}`]:score,[`dealbreakers.${state.role}`]:$('priority-dealbreaker').checked});
      else await setDoc(ref,{label,category:$('priority-type').value,scores:{[state.role]:score},dealbreakers:{[state.role]:$('priority-dealbreaker').checked}});
    }
    $('priority-form').reset();$('priority-name').disabled=false;$('priority-type').disabled=false;message('Priority saved.');
  } catch(error){$('priority-error').textContent=error.message;} finally{button.disabled=false;}
});

$('mine-list').addEventListener('change',async event=>{
  const item=event.target.closest('[data-id]');if(!item)return;
  const field=event.target.dataset.field;if(!field)return;
  const value=field==='score'?Number(event.target.value):event.target.checked;
  if(field==='score'&&!isScore(value)){message('Use a whole number from 0 to 10.');render();return;}
  try{await updateDoc(priorityRef(item.dataset.id),{[`${field==='score'?'scores':'dealbreakers'}.${state.role}`]:value});}catch(error){message(error.message);render();}
});
$('mine-list').addEventListener('click',async event=>{
  const button=event.target.closest('[data-remove]');if(!button)return;
  const id=button.dataset.remove,item=state.priorities.find(p=>p.id===id);
  if(!item || !confirm(`Remove “${item.label}” from your list?`))return;
  try{
    if(isScore(item.scores?.[state.role==='david'?'partner':'david']))await updateDoc(priorityRef(id),{[`scores.${state.role}`]:deleteField(),[`dealbreakers.${state.role}`]:deleteField()});
    else await deleteDoc(priorityRef(id));
  }catch(error){message(error.message);}
});

$('house-form').addEventListener('submit',async event=>{
  event.preventDefault();const name=$('house-name').value.trim();if(!name)return;
  try{await setDoc(doc(collection(state.db,'rooms',state.room,'houses')),{name,ratings:{},createdAt:Date.now()});$('house-form').reset();}catch(error){message(error.message);}
});
$('house-summary').addEventListener('click',async event=>{
  const id=event.target.dataset.deleteHouse;if(!id)return;
  const house=state.houses.find(h=>h.id===id);if(!house||!confirm(`Remove ${house.name} and its ratings?`))return;
  try{await deleteDoc(houseRef(id));}catch(error){message(error.message);}
});
$('house-table').addEventListener('change',async event=>{
  const select=event.target.closest('[data-house][data-priority]');if(!select)return;
  const value=select.value===''?deleteField():Number(select.value);
  try{await updateDoc(houseRef(select.dataset.house),{[`ratings.${select.dataset.priority}`]:value});}catch(error){message(error.message);render();}
});

function render(){if(!state.room)return;renderMine();renderMaster();renderHouses();}
function renderMine(){
  const mine=sortPriorities().filter(p=>isScore(roleScore(p)));
  const available=state.priorities.filter(p=>!isScore(roleScore(p))).sort((a,b)=>a.label.localeCompare(b.label));
  const old=$('existing-priority').value;
  $('existing-priority').innerHTML='<option value="">Add a new priority instead</option>'+available.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}${isScore(p.scores?.[state.role==='david'?'partner':'david'])?' · partner listed':''}</option>`).join('');
  if(available.some(p=>p.id===old))$('existing-priority').value=old;else{$('priority-name').disabled=false;$('priority-type').disabled=false;}
  $('mine-list').innerHTML=mine.length?mine.map(p=>`<article class="priority-card" data-id="${esc(p.id)}"><div><h3>${esc(p.label)}${p.dealbreakers?.[state.role]?'<span class="badge">Dealbreaker</span>':''}</h3><span class="meta">${esc(p.category||'Other')} · ${isScore(p.scores?.[state.role==='david'?'partner':'david'])?'Also on your partner’s list':'Only on your list so far'}</span></div><div class="edit-controls"><label class="check"><input type="checkbox" data-field="dealbreaker" ${p.dealbreakers?.[state.role]?'checked':''}> Dealbreaker</label><label class="meta">Score <input type="number" min="0" max="10" step="1" data-field="score" value="${roleScore(p)}" aria-label="Your score for ${esc(p.label)}"></label><button class="button ghost" data-remove="${esc(p.id)}">Remove</button></div></article>`).join(''):'<div class="empty">No priorities yet. Add your first one above.</div>';
}
function renderMaster(){
  const items=sortPriorities();
  $('master-body').innerHTML=items.length?items.map(p=>{const a=p.scores?.david,b=p.scores?.partner;return `<tr><td>${esc(p.label)} <span class="meta">${esc(p.category||'Other')}</span></td><td class="number">${displayScore(a)}</td><td class="number">${displayScore(b)}</td><td><span class="score-pill">${total(p)} / 20</span></td><td class="number ${isScore(a)&&isScore(b)&&Math.abs(a-b)>=5?'diff':''}">${isScore(a)&&isScore(b)?Math.abs(a-b):'—'}</td><td>${p.dealbreakers?.david||p.dealbreakers?.partner?'<span class="badge">Yes</span>':'—'}</td></tr>`;}).join(''):'<tr><td colspan="6" class="muted">Your shared list will appear here.</td></tr>';
}
function renderHouses(){
  const items=sortPriorities(),houses=[...state.houses].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const weight=items.reduce((sum,p)=>sum+total(p),0);
  $('house-summary').innerHTML=houses.length?houses.map(h=>{const complete=items.filter(p=>isScore(h.ratings?.[p.id])).length;const points=items.reduce((sum,p)=>sum+total(p)*(h.ratings?.[p.id]??0),0);const percent=weight&&complete?`${Math.round(100*points/(10*weight))}%`:'—';return `<article class="house-card"><strong>${esc(h.name)}</strong><div class="percent">${percent}</div><small>${complete} of ${items.length} priorities rated</small><br><button class="button ghost" data-delete-house="${esc(h.id)}">Remove home</button></article>`;}).join(''):'<div class="empty">Add a home to start comparing.</div>';
  $('house-table').innerHTML=items.length&&houses.length?`<table><thead><tr><th>Priority</th><th>Weight</th>${houses.map(h=>`<th>${esc(h.name)}</th>`).join('')}</tr></thead><tbody>${items.map(p=>`<tr><td>${esc(p.label)}${p.dealbreakers?.david||p.dealbreakers?.partner?'<span class="badge">Dealbreaker</span>':''}</td><td>${total(p)}</td>${houses.map(h=>`<td><select class="rating-select" data-house="${esc(h.id)}" data-priority="${esc(p.id)}" aria-label="${esc(h.name)} rating for ${esc(p.label)}"><option value="">—</option>${Array.from({length:11},(_,v)=>`<option value="${v}" ${h.ratings?.[p.id]===v?'selected':''}>${v}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty">Add at least one priority and one home to see the comparison grid.</div>';
}
