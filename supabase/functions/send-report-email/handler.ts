import {Buffer} from 'node:buffer';
import pdfMake from 'npm:pdfmake@0.2.20/build/pdfmake.js';
import fonts from 'npm:pdfmake@0.2.20/build/vfs_fonts.js';
import {studentScriptDefinition,scriptSummary,scriptFilename,type StudentScriptDocument} from './pdf-model.ts';
type Dependencies={env:(key:string)=>string|undefined;fetch:typeof fetch;render:(doc:StudentScriptDocument)=>Promise<Uint8Array>};
export async function renderReportPdf(doc:StudentScriptDocument):Promise<Uint8Array>{pdfMake.vfs=fonts;return await new Promise(resolve=>pdfMake.createPdf(studentScriptDefinition(doc)).getBuffer((buffer:Uint8Array)=>resolve(new Uint8Array(buffer))));}
const defaultDependencies:Dependencies={env:key=>Deno.env.get(key),fetch,render:renderReportPdf};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function handleReportEmail(req:Request,deps:Dependencies=defaultDependencies):Promise<Response>{
 const origins=(deps.env('ALLOWED_ORIGINS')??'http://localhost:8081,https://classpulse-7ae.pages.dev').split(',').map(x=>x.trim());const origin=req.headers.get('origin');
 const cors:Record<string,string>={'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 if(origin&&origins.includes(origin))cors['Access-Control-Allow-Origin']=origin;
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(origin&&!origins.includes(origin))return reply({error:'Origin not allowed.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const authorization=req.headers.get('authorization')??'',url=deps.env('SUPABASE_URL'),publicKey=deps.env('SUPABASE_ANON_KEY');
 if(!authorization.startsWith('Bearer '))return reply({error:'Sign in as a teacher.'},401);
 if(!url||!publicKey)return reply({error:'Server connection is not configured.'},503);
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(raw.length>10000)return reply({error:'Request too large.'},413);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return reply({error:'Invalid request.'},400);}
 try{
  const auth=await deps.fetch(`${url}/auth/v1/user`,{headers:{apikey:publicKey,Authorization:authorization},signal:AbortSignal.timeout(15000)});
  const user=auth.ok?await auth.json():null;if(!user?.id||user.is_anonymous)return reply({error:'Sign in as a teacher.'},401);
 }catch{return reply({error:'Could not verify sign in.'},503);}
 const provider=deps.env('EMAIL_PROVIDER')??'resend',from=deps.env('REPORT_FROM_EMAIL')??'',name=(deps.env('REPORT_FROM_NAME')??'Classpulse').replace(/[<>\r\n]/g,''),key=deps.env(provider==='brevo'?'BREVO_API_KEY':'RESEND_API_KEY');
 const serviceKey=deps.env('SUPABASE_SERVICE_ROLE_KEY');const limit=Number(deps.env('EMAIL_DAILY_LIMIT')??100);
 const configured=['resend','brevo'].includes(provider)&&!!key&&!!serviceKey&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)&&Number.isInteger(limit)&&limit>=1&&limit<=1000;
 if(body.action==='status')return reply({configured,provider,daily_limit:limit});
 if(body.action!=='send'||typeof body.session_id!=='string'||!uuid.test(body.session_id)||typeof body.student_id!=='string'||!uuid.test(body.student_id)||typeof body.fingerprint!=='string'||! /^[0-9a-f]{32}$/.test(body.fingerprint)||Object.keys(body).some(x=>!['action','session_id','student_id','fingerprint'].includes(x)))return reply({error:'Choose a student from the recipient preview.'},400);
 if(!configured)return reply({error:'Email setup is not complete. No message was sent.'},503);
 async function rpc(method:string,args:Record<string,unknown>,server=false){const credential=server?serviceKey!:publicKey!;const response=await deps.fetch(`${url}/rest/v1/rpc/${method}`,{method:'POST',headers:{apikey:credential,Authorization:server?`Bearer ${credential}`:authorization,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.code==='P0001'?data.message:'Could not update email status.');return data;}
 let job:any;let contacted=false;
 try{
  const prepared=await rpc('classpulse_prepare_report_email',{target_session:body.session_id,target_student:body.student_id,expected_fingerprint:body.fingerprint});
  job=await rpc('classpulse_claim_report_email',{target_job:prepared.job_id,daily_limit:limit},true);
  if(!job.claimed)return reply({status:job.status,already:true});
  if(job.provider&&job.provider!==provider)throw new Error('This retry belongs to a different email provider. Review it before resending.');
  let payload=job.payload;
  if(!payload){
   const doc=job.script_snapshot as StudentScriptDocument;
   if(doc.session_id!==body.session_id||doc.students.length!==1||doc.students[0].id!==body.student_id)throw new Error('Student and report mismatch. No message was sent.');
   const summary=scriptSummary(doc),pdf=await deps.render(doc);if(pdf.byteLength>10000000)throw new Error('PDF is too large for email. Download the script instead.');
   const content=Buffer.from(pdf).toString('base64'),filename=scriptFilename(doc),subject=`${doc.quiz_title.replace(/[\r\n]/g,' ')} - corrected answer script`;
   const text=`Hello ${summary.student.name},\n\nYour corrected answer script is attached.\nQuiz: ${doc.quiz_title}\nStudent ID: ${summary.student.code}\nTotal marks: ${summary.earned} / ${summary.total}${summary.percentage===null?'':` (${summary.percentage}%)`}\n\nClasspulse`;
   payload=provider==='resend'?{from:`${name} <${from}>`,to:[job.recipient],subject,text,attachments:[{filename,content,content_type:'application/pdf'}]}:{sender:{name,email:from},to:[{email:job.recipient,name:summary.student.name}],subject,textContent:text,attachment:[{name:filename,content}]};
   await rpc('classpulse_store_email_payload',{target_job:job.id,token:job.attempt_token,provider_name:provider,email_payload:payload},true);
  }
  contacted=true;
  const result=await deps.fetch(provider==='resend'?'https://api.resend.com/emails':'https://api.brevo.com/v3/smtp/email',{method:'POST',headers:provider==='resend'?{'Authorization':`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`classpulse-report/${job.id}`}:{'api-key':key!,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const data=await result.json().catch(()=>null),messageId=provider==='resend'?data?.id:data?.messageId;
  if(result.ok&&typeof messageId==='string'){
   await rpc('classpulse_finish_report_email',{target_job:job.id,token:job.attempt_token,result_status:'accepted',message_id:messageId,error_text:null},true);
   return reply({status:'accepted'});
  }
  const outcome=result.status>=400&&result.status<500&&![408,409].includes(result.status)?'failed':'unknown';
  await rpc('classpulse_finish_report_email',{target_job:job.id,token:job.attempt_token,result_status:outcome,message_id:null,error_text:`Email provider returned HTTP ${result.status}`},true);
  return reply({status:outcome,error:outcome==='failed'?'Email service refused the message. Check sender setup and quota.':'Email outcome needs review before retrying.'});
 }catch(error){
  const outcome=contacted?'unknown':'failed';if(job?.claimed){try{await rpc('classpulse_finish_report_email',{target_job:job.id,token:job.attempt_token,result_status:outcome,message_id:null,error_text:contacted?'Connection lost after contacting provider. Review before retry.':error instanceof Error?error.message:'Email preparation failed.'},true);}catch{}}
  return reply({status:outcome,error:contacted?'Email outcome needs review before retrying.':error instanceof Error?error.message:'Could not prepare email.'},job?.claimed?200:400);
 }
}
