import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import {handleReportEmail,renderReportPdf,providerDiagnostic} from './handler.ts';
const session='11111111-1111-1111-1111-111111111111',student='22222222-2222-2222-2222-222222222222';
const doc:any={session_id:session,status:'ended',activity_type:'quiz',quiz_title:'Demo quiz',class_name:'Faculty',room_name:'FACULTYDEMO',ended_at:'2026-10-13T06:00:00Z',students:[{id:student,name:'Demo Faculty',code:'DEMO001',joined:true}],questions:[{id:'q',position:1,type:'short_answer',prompt:'Explain',points:3,options:[],correct_position:null,accepted_answers:[],manual_grading:true}],responses:[{student_id:student,question_id:'q',option_position:null,answer_text:'Demo response',awarded_points:2,is_correct:false,teacher_comment:'Add a second point.'}]};
function fixture(mode='accepted',provider='resend'){
 const calls:any[]=[],outcomes:any[]=[],env:Record<string,string>={SUPABASE_URL:'https://project.example.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',RESEND_API_KEY:'resend-test',BREVO_API_KEY:'brevo-test',MOOSEND_API_KEY:'moosend-test',REPORT_FROM_EMAIL:'sender@example.test',EMAIL_PROVIDER:provider};
 let stored:any=null;
 const deps={env:(key:string)=>env[key],render:renderReportPdf,fetch:async(input:any,init:any)=>{
  const url=String(input),body=init?.body?JSON.parse(init.body):null;calls.push({url,body,headers:init?.headers,redirect:init?.redirect});
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'teacher-test',is_anonymous:mode==='anonymous'}));
  if(url.includes('/rpc/')){
   const method=url.split('/').at(-1);
   if(method==='classpulse_prepare_report_email')return new Response(JSON.stringify({job_id:'33333333-3333-3333-3333-333333333333'}));
   if(method==='classpulse_claim_report_email')return new Response(JSON.stringify(mode==='already'?{status:'accepted'}:{claimed:true,id:'33333333-3333-3333-3333-333333333333',attempt_token:'token',recipient:'faculty@example.test',script_snapshot:mode==='mismatch'?{...doc,students:[{...doc.students[0],id:'wrong'}]}:doc,payload:mode==='retry'?{from:'Stored sender',to:['faculty@example.test'],subject:'Stored',text:'Stored',attachments:[{filename:'stored.pdf',content:'JVBERg=='}]}:null,provider:mode==='retry'?'resend':null}));
   if(method==='classpulse_store_email_payload')stored=body.email_payload;
   if(method==='classpulse_finish_report_email')outcomes.push(body);
   return new Response('null');
  }
  if(provider==='moosend'){
   if(mode==='network')throw new Error('Connection lost');
   if(mode==='rejected')return new Response(JSON.stringify({Code:400,Error:'INVALID-SENDER',Context:null}));
   if(mode==='rate')return new Response(JSON.stringify({Code:429,Error:'RATE-LIMITING',Context:null}));
   if(mode==='uncertain')return new Response(JSON.stringify({Code:500,Error:'ERROR',Context:null}));
   if(mode==='malformed')return new Response('{}');
   return new Response(JSON.stringify({Code:0,Error:null,Context:mode==='noid'?null:'moosend-campaign-test'}));
  }
  if(mode==='network')throw new Error('Connection lost');
  if(mode==='rejected')return new Response('{"error":"invalid sender"}',{status:400});
  if(mode==='uncertain')return new Response('{}',{status:500});
  return new Response(JSON.stringify(provider==='resend'?{id:'email-test'}:{messageId:'email-test'}));
 }};
 const body={action:'send',session_id:session,student_id:student,fingerprint:'a'.repeat(32)};
 const request=(override:any={},auth=true,origin='http://localhost:8081')=>new Request('http://localhost/send-report-email',{method:'POST',headers:{'Content-Type':'application/json',origin,...(auth?{authorization:'Bearer user-test'}:{})},body:JSON.stringify({...body,...override})});
 return {calls,outcomes,deps,env,request,get stored(){return stored;}};
}
Deno.test('both providers send exactly one authoritative recipient and one individual PDF',async()=>{for(const provider of ['resend','brevo']){const f=fixture('accepted',provider),res=await handleReportEmail(f.request(),f.deps);assert.equal((await res.json()).status,'accepted');const sent=f.calls.find(x=>x.url.includes('api.resend.com')||x.url.includes('api.brevo.com'));assert.equal(sent.body.to.length,1);assert.equal(provider==='resend'?sent.body.to[0]:sent.body.to[0].email,'faculty@example.test');const attachments=sent.body.attachments??sent.body.attachment;assert.equal(attachments.length,1);assert.ok(Buffer.from(attachments[0].content,'base64').subarray(0,5).toString().startsWith('%PDF-'));assert.equal(f.outcomes[0].result_status,'accepted');}});
Deno.test('no account setup means no provider request',async()=>{const f=fixture();delete f.env.RESEND_API_KEY;const res=await handleReportEmail(f.request(),f.deps);assert.equal(res.status,503);assert.equal(f.calls.filter(x=>x.url.includes('/rpc/')).length,0);});
Deno.test('missing auth, anonymous login, wrong origin and injected recipients are rejected',async()=>{const f=fixture();assert.equal((await handleReportEmail(f.request({},false),f.deps)).status,401);assert.equal((await handleReportEmail(f.request({},true,'https://evil.example'),f.deps)).status,403);assert.equal((await handleReportEmail(f.request({to:'wrong@example.test'}),f.deps)).status,400);const a=fixture('anonymous');assert.equal((await handleReportEmail(a.request(),a.deps)).status,401);});
Deno.test('duplicate claims and wrong student documents cannot send mail',async()=>{for(const mode of ['already','mismatch']){const f=fixture(mode);await handleReportEmail(f.request(),f.deps);assert.ok(!f.calls.some(x=>x.url.includes('api.resend.com')));}});
Deno.test('definitive rejection is retryable; provider/network uncertainty requires review',async()=>{for(const [mode,status] of [['rejected','failed'],['uncertain','unknown'],['network','unknown']]){const f=fixture(mode);const res=await handleReportEmail(f.request(),f.deps);assert.equal((await res.json()).status,status);assert.equal(f.outcomes[0].result_status,status);}});
Deno.test('retry uses the frozen payload rather than generating a different attachment',async()=>{const f=fixture('retry');f.deps.render=async()=>{throw new Error('Must not regenerate');};const res=await handleReportEmail(f.request(),f.deps);assert.equal((await res.json()).status,'accepted');assert.equal(f.calls.find(x=>x.url.includes('api.resend.com')).body.subject,'Stored');});
Deno.test('server PDF renders student marks and feedback',async()=>{const pdf=await renderReportPdf(doc);await Deno.writeFile('work/email-testing/server-script.pdf',pdf);assert.ok(pdf.length>1000);});

Deno.test('Moosend sends one roster recipient and one PDF through its transactional endpoint',async()=>{
 const f=fixture('accepted','moosend'),res=await handleReportEmail(f.request(),f.deps);assert.equal((await res.json()).status,'accepted');
 const sent=f.calls.find(x=>x.url.includes('api.moosend.com'));
 assert.equal(new URL(sent.url).pathname,'/v3/campaigns/transactional/send.json');assert.equal(new URL(sent.url).searchParams.get('apikey'),'moosend-test');assert.equal(sent.redirect,'error');
 assert.equal(sent.body.From.Email,'sender@example.test');assert.equal(sent.body.Personalizations.length,1);assert.equal(sent.body.Personalizations[0].To.length,1);assert.equal(sent.body.Personalizations[0].To[0].Email,'faculty@example.test');assert.equal(sent.body.Cc,undefined);assert.equal(sent.body.Bcc,undefined);
 assert.equal(sent.body.attachments.length,1);assert.equal(sent.body.attachments[0].Type,'application/pdf');assert.ok(Buffer.from(sent.body.attachments[0].Content,'base64').subarray(0,5).toString().startsWith('%PDF-'));
 assert.equal(f.outcomes[0].message_id,'moosend-campaign-test');assert.equal(f.stored.Personalizations[0].To[0].Email,'faculty@example.test');assert.ok(!JSON.stringify(f.stored).includes('moosend-test'));
});
Deno.test('Moosend inspects API codes on HTTP 200, handles missing IDs and preserves uncertainty',async()=>{
 for(const [mode,status] of [['rejected','failed'],['rate','failed'],['uncertain','unknown'],['malformed','unknown'],['network','unknown'],['noid','accepted']]){
 const f=fixture(mode,'moosend'),res=await handleReportEmail(f.request(),f.deps);assert.equal((await res.json()).status,status,mode);assert.equal(f.outcomes[0].result_status,status,mode);if(mode==='noid')assert.equal(f.outcomes[0].message_id,null);
 }
});
Deno.test('Moosend setup, duplicate protection, student identity and provider-switch protection',async()=>{
 const missing=fixture('accepted','moosend');delete missing.env.MOOSEND_API_KEY;assert.equal((await handleReportEmail(missing.request(),missing.deps)).status,503);
 for(const mode of ['already','mismatch','retry']){const f=fixture(mode,'moosend');await handleReportEmail(f.request(),f.deps);assert.ok(!f.calls.some(x=>x.url.includes('api.moosend.com')));}
 const oversized=fixture('accepted','moosend');oversized.deps.render=async()=>new Uint8Array(10000001);await handleReportEmail(oversized.request(),oversized.deps);assert.ok(!oversized.calls.some(x=>x.url.includes('api.moosend.com')));
});

Deno.test('diagnostics report Moosend codes without leaking keys, URLs or arbitrary provider text',async()=>{
 const f=fixture('rejected','moosend'),res=await handleReportEmail(f.request(),f.deps),body=await res.json();assert.match(body.error,/HTTP 200 \/ API 400 \(INVALID-SENDER\)/);assert.equal(f.outcomes[0].error_text,'Moosend refused the message: HTTP 200 / API 400 (INVALID-SENDER).');
 for(const Error of ['https://api.example/send?apikey=secret-value','secret-value','SECRET-VALUE','key is secret-value','person@example.test'])assert.ok(!providerDiagnostic('moosend',400,{Code:400,Error},'secret-value').includes(Error));
});

Deno.test('Moosend negative API code includes its explanation with special-character secrets redacted',()=>{
 assert.match(providerDiagnostic('moosend',200,{Code:-1,Error:'Invalid content type'},'secret'),/API -1 \(Invalid content type\)/);
 for(const key of ['key.+[x]','a*b?','secret-value']){const text=providerDiagnostic('moosend',200,{Code:-1,Error:'Invalid API credential '+key+' '+encodeURIComponent(key)},key);assert.ok(!text.includes(key));assert.ok(!text.includes(encodeURIComponent(key)));}
 assert.match(providerDiagnostic('moosend',200,{Code:-1,Error:'Sender not found: test@example.test'},'secret'),/Sender not found/);
 assert.ok(providerDiagnostic('moosend',200,{Code:-1,Error:'x'.repeat(3000)},'secret').length<100);
});
