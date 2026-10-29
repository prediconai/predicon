const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),jwt=require('jsonwebtoken');
const app=express(),P=process.env;app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","'unsafe-inline'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["https://fonts.gstatic.com"],imgSrc:["'self'","data:"],connectSrc:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'16kb'}));
app.get('/health',(q,r)=>r.json({status:'ok',product:'predion'}));
// Tier dibaca dari JWT (app_metadata diisi server/webhook), bukan dari klien.
const tier=u=>(u.app_metadata&&u.app_metadata.tier)||'free',LIM={free:10,pro:100,business:400};
const auth=(q,r,n)=>{try{q.user=jwt.verify((q.get('authorization')||'').slice(7),P.SUPABASE_JWT_SECRET);n()}catch{r.status(401).json({error:'unauthorized'})}};
const limiter=rateLimit({windowMs:864e5,limit:q=>LIM[tier(q.user)]||10,keyGenerator:q=>q.user.sub,standardHeaders:true,legacyHeaders:false});
const SYS='Kamu asisten intelijen PREDION untuk founder dan UKM Indonesia/ASEAN. Jawab ringkas dalam Bahasa Indonesia. Data bersifat simulasi/ilustratif; berikan konteks risiko, bukan rekomendasi beli/jual.';
app.post('/api/ai/chat',auth,limiter,async(q,r)=>{const m=q.body.messages;
 if(!Array.isArray(m)||!m.length||m.length>12||m.some(x=>!['user','assistant'].includes(x.role)||typeof x.content!=='string'||x.content.length>2000))return r.status(400).json({error:'bad_request'});
 for(let i=0;i<3;i++){try{const a=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':P.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:P.ANTHROPIC_MODEL||'claude-sonnet-4-6',max_tokens:600,system:SYS,messages:m}),signal:AbortSignal.timeout(20000)});
  if(a.ok){const d=await a.json();return r.json({text:d.content.map(b=>b.text||'').join('')})}
  if(a.status!==429&&a.status<500)break}catch{}await new Promise(s=>setTimeout(s,400*(i+1)))}
 r.status(502).json({error:'ai_unavailable'})});
app.use(express.static('public'));
const s=app.listen(P.PORT||3000);process.on('SIGTERM',()=>s.close(()=>process.exit(0)));
