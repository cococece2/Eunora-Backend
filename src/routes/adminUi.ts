import { Router } from 'express'

// A small moderation page, served by the API itself at /admin-ui.
// It holds no secrets: you type your ADMIN_API_KEY into it, and it only talks to /admin/* on this same server.
export const adminUiRouter = Router()

adminUiRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
  res.type('html').send(PAGE)
})

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Moderation</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4efe9;color:#2c4a5c}
  main{max-width:760px;margin:0 auto;padding:24px 16px 60px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#6a8a98;font-size:14px;margin:0 0 18px}
  .card{background:#fff;border:1px solid #d7e1e6;border-radius:14px;padding:16px 18px;margin-bottom:14px}
  input{width:100%;padding:10px 12px;border:1px solid #b9c9d2;border-radius:10px;font-size:14px}
  button{border:0;border-radius:999px;padding:9px 18px;font-weight:700;font-size:13px;cursor:pointer;background:#7a9ab0;color:#fff}
  button.ghost{background:#e6edf1;color:#3a5a72} button.bad{background:#c84040} button.good{background:#4a8a6a}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center} .tabs button{background:#e6edf1;color:#3a5a72} .tabs button.on{background:#2c4a5c;color:#fff}
  .meta{font-size:12px;color:#6a8a98;margin-bottom:8px} .body{white-space:pre-wrap;line-height:1.65;font-size:15px;margin:0 0 14px}
  .check{background:#fbf3e0;border:1px solid #ecd9a6;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.6;color:#5a4020}
  .msg{padding:10px 14px;border-radius:10px;font-size:13px;margin:10px 0} .err{background:#f8e3e3;color:#8a3030} .ok{background:#e1f1e8;color:#2f6a4a}
  .empty{color:#6a8a98;text-align:center;padding:30px 0}
</style></head><body><main>
<h1>Moderation</h1><p class="sub">Read every letter before it goes public.</p>
<div class="card"><label for="key" class="meta">Admin key (the ADMIN_API_KEY from your backend .env)</label>
  <div class="row"><input id="key" type="password" autocomplete="off" style="flex:1;min-width:200px"><button id="go">Load</button></div></div>
<div class="check"><b>Before you publish a letter, check it:</b><br>
  • No numbers about bodies or food (weights, calories, sizes, days)<br>
  • No methods, tips or tricks, and nothing that glorifies the illness<br>
  • No real names, schools, places or contact details<br>
  • If the writer sounds like they are in danger right now, do not publish. Delete it, and consider how you could reach out through the site's help resources.</div>
<div id="status"></div>
<div class="row tabs" style="margin:16px 0"><button data-t="pending" class="on">Pending letters</button><button data-t="approved">Published letters</button><button data-t="hidden">Hidden messages</button></div>
<div id="list"></div>
</main><script>
(function(){
  var key='', tab='pending';
  var $=function(id){return document.getElementById(id)};
  function say(text,cls){var s=$('status');s.innerHTML='';if(!text)return;var d=document.createElement('div');d.className='msg '+cls;d.textContent=text;s.appendChild(d)}
  function api(method,path){
    return fetch(path,{method:method,headers:{'x-admin-key':key}}).then(function(r){
      if(r.status===204)return null;
      return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})
    })
  }
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function btn(label,cls,fn){var b=el('button',cls,label);b.onclick=fn;return b}
  function when(v){try{return new Date(v).toLocaleString()}catch(e){return ''}}
  function act(p,done){say('Working…','ok');p.then(function(){say(done,'ok');load()}).catch(function(e){say(e.message,'err')})}
  function render(items,kind){
    var list=$('list');list.innerHTML='';
    if(!items.length){list.appendChild(el('div','empty','Nothing here. All caught up. ⚓'));return}
    items.forEach(function(it){
      var c=el('div','card');
      if(kind==='letter'){
        c.appendChild(el('div','meta','From '+(it.sailor||it.sailorName||'a sailor')+' · '+when(it.createdAt||it.created_at)+' · letter #'+it.id));
        c.appendChild(el('p','body',it.body||it.text||''));
        var r=el('div','row');
        if(!it.approved)r.appendChild(btn('Publish','good',function(){act(api('POST','/admin/letters/'+it.id+'/approve'),'Published.')}));
        r.appendChild(btn(it.approved?'Unpublish and delete':'Reject and delete','bad',function(){if(confirm('Delete this letter for good?'))act(api('DELETE','/admin/letters/'+it.id),'Deleted.')}));
        c.appendChild(r)
      } else {
        c.appendChild(el('div','meta','Hidden message #'+it.id+' · '+(it.reports||0)+' report(s) · '+when(it.createdAt||it.created_at)));
        c.appendChild(el('p','body',it.body||''));
        var r2=el('div','row');
        r2.appendChild(btn('Restore','good',function(){act(api('POST','/admin/messages/'+it.id+'/unhide'),'Restored.')}));
        r2.appendChild(btn('Delete','bad',function(){if(confirm('Delete this message for good?'))act(api('DELETE','/admin/messages/'+it.id),'Deleted.')}));
        c.appendChild(r2)
      }
      list.appendChild(c)
    })
  }
  function load(){
    if(!key){say('Enter your admin key first.','err');return}
    var p=tab==='hidden'?api('GET','/admin/messages/hidden').then(function(j){render(j.messages||[],'msg')})
      :api('GET','/admin/letters?status='+tab).then(function(j){render(j.letters||[],'letter')});
    p.then(function(){var f=$('status').firstChild;if(f&&(f.className.indexOf('err')>-1||f.textContent==='Working…'))say('','')}).catch(function(e){$('list').innerHTML='';say(e.message,'err')})
  }
  $('go').onclick=function(){key=$('key').value.trim();load()};
  $('key').onkeydown=function(e){if(e.key==='Enter')$('go').onclick()};
  document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){
    document.querySelectorAll('.tabs button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');tab=b.dataset.t;load()}});
})();
</script></body></html>`
