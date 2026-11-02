import { setupShoulder } from '/shoulder.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=localStorage.getItem('shoulder-token')||'',installPrompt=null;
const shoulder=setupShoulder($('#shoulder-screen'),()=>token,{standalone:true,onUnauthorized:signOut});
async function api(path,body){
  const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;
}
async function users(){
  try{const rows=await api('/api/auth/users?department=farestald');$('#login-users').innerHTML=rows.map(x=>`<button type="button" class="user-button" data-name="${esc(x.username)}"><span>${esc(x.username.slice(0,2).toUpperCase())}</span><strong>${esc(x.username)}</strong></button>`).join('')||'No users available';
    $('#login-users').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#login-user').value=b.dataset.name;$('#login-password').value='';$('#login-error').textContent='';$('#login-users').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));});
  }catch(e){$('#login-error').textContent=e.message;}
}
function home(){shoulder.reset();$('#home-screen').hidden=false;$('#shoulder-screen').hidden=true;$('#back-button').hidden=true;$('#screen-title').textContent='Shoulder';}
function enter(user){$('#login-view').hidden=true;$('#app-view').hidden=false;$('#current-user').textContent=user.username;home();}
function signOut(){token='';localStorage.removeItem('shoulder-token');shoulder.reset();$('#app-view').hidden=true;$('#login-view').hidden=false;$('#login-password').value='';users();}
$('#logout-button').onclick=signOut;$('#back-button').onclick=home;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{$('#home-screen').hidden=true;$('#shoulder-screen').hidden=false;$('#back-button').hidden=false;$('#screen-title').textContent=b.querySelector('strong').textContent;shoulder.show(b.dataset.mode);});
$('#pin-keypad').onclick=event=>{
  const b=event.target.closest('button');if(!b)return;const input=$('#login-password');
  if(b.hasAttribute('data-pin-clear'))input.value='';else if(b.hasAttribute('data-pin-backspace'))input.value=input.value.slice(0,-1);else if(input.value.length<128)input.value+=b.dataset.pin;
};
$('#login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('#login-error').textContent='';
  try{const data=await api('/api/auth/login',{username:$('#login-user').value,password:$('#login-password').value,department:'farestald'});token=data.token;localStorage.setItem('shoulder-token',token);$('#login-password').value='';enter(data.user);}catch(e){$('#login-error').textContent=e.message;}finally{button.disabled=false;}
};
function installHelp(){
  $('#install-help').textContent=installPrompt?'Install Shoulder as a separate app on this phone.':/iPad|iPhone|iPod/.test(navigator.userAgent)?'In Safari, tap Share, then Add to Home Screen.':'Open the browser menu and choose Install app or Add to Home screen. If Shoulder is already installed, open it from your home screen.';
  $('#install-native').hidden=!installPrompt;$('#install-dialog').showModal();
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if($('#install-dialog').open){$('#install-native').hidden=false;$('#install-help').textContent='Install Shoulder as a separate app on this phone.';}});
window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;$('#install-dialog').close();installPrompt=null;});
$('#install-app').onclick=installHelp;$('#install-close').onclick=()=>$('#install-dialog').close();
$('#install-native').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install-dialog').close();};
const connection=()=>{$('#connection-note').textContent=navigator.onLine?'':'No connection. Connect to load and save shoulder observations.';};window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)$('#install-app').hidden=true;
else if(new URLSearchParams(location.search).has('install'))installHelp();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/shoulder-app/sw.js',{scope:'/shoulder-app/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
(async()=>{if(!token)return users();try{enter(await api('/api/auth/me?department=farestald'));}catch{signOut();}})();
