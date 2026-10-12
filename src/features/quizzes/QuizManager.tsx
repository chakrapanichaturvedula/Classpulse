import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { editQuestions, newQuestion, serializeQuestions, type EditorQuestion, type QuestionKind, type QuizDocument } from './model';

type Folder={id:string;name:string;parent_id:string|null};
type LibraryQuiz={id:string;title:string;folder_id:string|null};
type Version={quiz_id:string;version_number:number;status:string};
function Action({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:0.45}]}><Text style={[s.buttonText,secondary&&{color:'#193C38'}]}>{title}</Text></Pressable>;
}
function Choice({title,selected,onPress,disabled=false}:{title:string;selected:boolean;onPress:()=>void;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.choice,selected&&{backgroundColor:'#193C38'},disabled&&{opacity:0.5}]}><Text style={{color:selected?'white':'#193C38',fontWeight:'600'}}>{title}</Text></Pressable>;
}
export function QuizManager({teacherId,onDirtyChange}:{teacherId:string;onDirtyChange:(dirty:boolean)=>void}) {
 const [folders,setFolders]=useState<Folder[]>([]),[quizzes,setQuizzes]=useState<LibraryQuiz[]>([]),[versions,setVersions]=useState<Version[]>([]);
 const [filter,setFilter]=useState<string>('all'),[folderName,setFolderName]=useState(''),[parent,setParent]=useState<string|null>(null);
 const [folderToRename,setFolderToRename]=useState<string|null>(null),[renameText,setRenameText]=useState('');
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const working=useRef(false), alive=useRef(true);
 const [editorOpen,setEditorOpen]=useState(false),[document,setDocument]=useState<QuizDocument|null>(null),[title,setTitle]=useState(''),[folder,setFolder]=useState<string|null>(null),[questions,setQuestions]=useState<EditorQuestion[]>([]),[dirty,setDirty]=useState(false);
 useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>{
  if(Platform.OS!=='web'||!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 function path(id:string):string {
  const parts:string[]=[],seen=new Set<string>();let current:Folder|undefined=folders.find(f=>f.id===id);
  while(current&&!seen.has(current.id)){parts.unshift(current.name);seen.add(current.id);current=folders.find(f=>f.id===current!.parent_id);}
  return parts.join(' / ');
 }
 async function loadLibrary() {
  const results=await Promise.all([
   supabase!.from('quiz_folders').select('id,name,parent_id').eq('teacher_id',teacherId).order('name'),
   supabase!.from('quizzes').select('id,title,folder_id').eq('teacher_id',teacherId).order('created_at',{ascending:false}),
   supabase!.from('quiz_versions').select('quiz_id,version_number,status').eq('teacher_id',teacherId).order('version_number',{ascending:false}),
  ]);
  if(!alive.current)return;
  if(results.some(r=>r.error)){setReady(false);throw new Error('Quiz library could not load. Install the Step 4 Supabase setup, then retry.');}
  setFolders(results[0].data??[]);setQuizzes(results[1].data??[]);setVersions(results[2].data??[]);setReady(true);
 }
 async function run(action:()=>Promise<void>) {
  if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');
  try{await action();}catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not save. Please try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void run(loadLibrary);return()=>{alive.current=false;};},[teacherId]);
 function restore(doc:QuizDocument) {setDocument(doc);setTitle(doc.title);setFolder(doc.folder_id);setQuestions(editQuestions(doc.questions));setEditorOpen(true);setDirty(false);}
 async function readQuiz(id:string){const {data,error}=await supabase!.rpc('classpulse_get_quiz',{target_quiz:id});if(error)throw new Error('Could not open this quiz. Please retry.');if(alive.current)restore(data as QuizDocument);}
 function newQuiz(){if(dirty){setError('Save your draft or discard edits before opening another quiz.');return;}setDocument(null);setTitle('');setFolder(filter==='all'||filter==='unfiled'?null:filter);setQuestions([]);setEditorOpen(true);setDirty(false);setError('');setNotice('');}
 function openQuiz(id:string){if(dirty){setError('Save your draft or discard edits before opening another quiz.');return;}void run(()=>readQuiz(id));}
 function updateQuestion(index:number,patch:Partial<EditorQuestion>){setQuestions(value=>value.map((q,i)=>i===index?{...q,...patch}:q));setDirty(true);}
 function move(index:number,offset:number){setQuestions(value=>{const next=[...value];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});setDirty(true);}
 async function saveDraft():Promise<QuizDocument>{
  if(!title.trim())throw new Error('Enter a quiz title.');
  const payload=serializeQuestions(questions);
  const {data,error}=await supabase!.rpc('classpulse_save_quiz',{target_quiz:document?.quiz_id??null,target_folder:folder,quiz_title:title.trim(),input_questions:payload,expected_version:document?.version_id??null,expected_revision:document?.revision??null});
  if(error)throw new Error(error.code==='P0001'?error.message:'Could not save the draft. Please retry.');
  const saved=data as QuizDocument;if(alive.current)restore(saved);return saved;
 }
 function save(){void run(async()=>{
  if(dirty||!document)await saveDraft();
  await loadLibrary();setNotice('Quiz saved. Choose a class and room in the Launch tab when you want to use it.');
 });}
 function createFolder(){void run(async()=>{
  if(!folderName.trim())throw new Error('Enter a folder name.');
  const {error}=await supabase!.from('quiz_folders').insert({teacher_id:teacherId,name:folderName.trim(),parent_id:parent});
  if(error)throw new Error(error.code==='23505'?'A folder with that name already exists here.':'Could not create the folder.');
  setFolderName('');await loadLibrary();setNotice('Folder created.');
 });}
 function renameFolder(){void run(async()=>{
  if(!renameText.trim())throw new Error('Enter a folder name.');
  const {error}=await supabase!.from('quiz_folders').update({name:renameText.trim()}).eq('id',folderToRename).eq('teacher_id',teacherId);
  if(error)throw new Error(error.code==='23505'?'A folder with that name already exists here.':'Could not rename the folder.');
  setFolderToRename(null);await loadLibrary();setNotice('Folder renamed.');
 });}
 function discard(){void run(async()=>{if(document)await readQuiz(document.quiz_id);else{setEditorOpen(false);setQuestions([]);setDirty(false);}setNotice('Unsaved edits discarded.');});}
 const orderedFolders=[...folders].sort((a,b)=>path(a.id).localeCompare(path(b.id)));
 return <View style={s.section}>
  <Text accessibilityRole="header" style={s.title}>Your quiz library</Text><Text style={s.body}>Organize by year, subject, or section. Save quizzes here; choose a class and room in the Launch tab to use one.</Text>
  {!!error&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
  <View style={s.row}><Action title={busy?'Please wait…':'Refresh library'} disabled={busy} secondary onPress={()=>void run(loadLibrary)}/><Action title="New quiz" disabled={busy||!ready} onPress={newQuiz}/></View>
  <View style={s.card}><Text style={s.subtitle}>Folders and subfolders</Text><TextInput accessibilityLabel="New quiz folder name" style={s.input} value={folderName} onChangeText={setFolderName} placeholder="e.g. First Year or Finance" placeholderTextColor="#61736E" editable={!busy&&ready} maxLength={120}/><Text style={s.label}>Create inside</Text><View style={s.row}><Choice title="Top level" selected={parent===null} disabled={busy} onPress={()=>setParent(null)}/>{orderedFolders.map(f=><Choice key={f.id} title={path(f.id)} selected={parent===f.id} disabled={busy} onPress={()=>setParent(f.id)}/>)}</View><Action title="Create folder" disabled={busy||!ready} onPress={createFolder}/>
   {filter!=='all'&&filter!=='unfiled'&&<Action title="Rename selected folder" disabled={busy} secondary onPress={()=>{setFolderToRename(filter);setRenameText(folders.find(f=>f.id===filter)?.name??'');}}/>}
   {folderToRename&&<View style={{gap:12}}><TextInput accessibilityLabel="Rename quiz folder" style={s.input} value={renameText} onChangeText={setRenameText} maxLength={120} editable={!busy}/><View style={s.row}><Action title="Save folder name" disabled={busy} onPress={renameFolder}/><Action title="Cancel folder rename" disabled={busy} secondary onPress={()=>setFolderToRename(null)}/></View></View>}
  </View>
  <Text style={s.label}>Browse a folder</Text><View style={s.row}><Choice title="All quizzes" selected={filter==='all'} onPress={()=>setFilter('all')}/><Choice title="Unfiled" selected={filter==='unfiled'} onPress={()=>setFilter('unfiled')}/>{orderedFolders.map(f=><Choice key={f.id} title={path(f.id)} selected={filter===f.id} onPress={()=>setFilter(f.id)}/>)}</View>
  {ready&&quizzes.filter(q=>filter==='all'||(filter==='unfiled'?q.folder_id===null:q.folder_id===filter)).map(q=>{const v=versions.find(v=>v.quiz_id===q.id);return <View key={q.id} style={s.card}><Text style={s.subtitle}>{q.title}</Text><Text style={s.body}>{q.folder_id?path(q.folder_id):'Unfiled'} · Version {v?.version_number} · Saved</Text><Action title={`Open quiz: ${q.title}`} disabled={busy} secondary onPress={()=>openQuiz(q.id)}/></View>;})}
  {ready&&!quizzes.some(q=>filter==='all'||(filter==='unfiled'?q.folder_id===null:q.folder_id===filter))&&<Text style={s.body}>No quizzes in this view yet.</Text>}
  {editorOpen&&<View style={s.card}>
   <Text accessibilityRole="header" style={s.subtitle}>{document?'Saved quiz':'New quiz'}{dirty?' · Unsaved changes':''}</Text>
   {document?.status==='published'&&<Text style={s.body}>This version is fixed for classroom use. Save your edits to prepare a new version without changing existing sessions.</Text>}
   <Text style={s.label}>Quiz title</Text><TextInput accessibilityLabel="Quiz title" style={s.input} value={title} onChangeText={value=>{setTitle(value);setDirty(true);}} maxLength={200} editable={!busy}/>
   <Text style={s.label}>Quiz folder</Text><View style={s.row}><Choice title="Unfiled" selected={folder===null} disabled={busy} onPress={()=>{setFolder(null);setDirty(true);}}/>{orderedFolders.map(f=><Choice key={f.id} title={path(f.id)} selected={folder===f.id} disabled={busy} onPress={()=>{setFolder(f.id);setDirty(true);}}/>)}</View>
   {questions.map((q,index)=><View key={q.key} style={s.question}>
    <Text style={s.subtitle}>Question {index+1} · {q.type==='multiple_choice'?'Multiple choice':q.type==='true_false'?'True / False':'Short answer'}</Text>
    <Text style={s.label}>Question prompt</Text><TextInput accessibilityLabel={`Question ${index+1} prompt`} style={[s.input,{minHeight:80}]} multiline value={q.prompt} onChangeText={value=>updateQuestion(index,{prompt:value})} maxLength={4000} editable={!busy}/>
    <Text style={s.label}>Points</Text><TextInput accessibilityLabel={`Question ${index+1} points`} style={s.input} keyboardType="decimal-pad" value={q.points} onChangeText={value=>updateQuestion(index,{points:value})} maxLength={8} editable={!busy}/>
    {q.type!=='short_answer'&&<><Text style={s.body}>Choose one correct answer.</Text>{q.options.map((label,optionIndex)=><View key={optionIndex} style={{gap:8}}>{q.type==='multiple_choice'?<TextInput accessibilityLabel={`Question ${index+1} option ${optionIndex+1}`} style={s.input} value={label} onChangeText={value=>updateQuestion(index,{options:q.options.map((old,i)=>i===optionIndex?value:old)})} maxLength={1000} editable={!busy}/>:<Text style={s.label}>{label}</Text>}<Choice title={`${q.correct_position===optionIndex+1?'✓ ':''}Correct answer: ${q.type==='true_false'?label:`option ${optionIndex+1}`}`} selected={q.correct_position===optionIndex+1} disabled={busy} onPress={()=>updateQuestion(index,{correct_position:optionIndex+1})}/></View>)}{q.type==='multiple_choice'&&<View style={s.row}><Action title="Add option" disabled={busy||q.options.length>=6} secondary onPress={()=>updateQuestion(index,{options:[...q.options,'']})}/><Action title="Remove last option" disabled={busy||q.options.length<=2} secondary onPress={()=>updateQuestion(index,{options:q.options.slice(0,-1),correct_position:q.correct_position===q.options.length?null:q.correct_position})}/></View>}</>}
    {q.type==='short_answer'&&<><Choice title={q.manual_grading?'✓ Teacher will grade manually':'Use manual grading'} selected={q.manual_grading} disabled={busy} onPress={()=>updateQuestion(index,{manual_grading:!q.manual_grading})}/><Text style={s.label}>Accepted answers — one per line</Text><TextInput accessibilityLabel={`Question ${index+1} accepted answers`} style={[s.input,{minHeight:80}]} multiline value={q.acceptedText} onChangeText={value=>updateQuestion(index,{acceptedText:value})} editable={!busy&&!q.manual_grading} maxLength={10000}/><Text style={s.body}>Automatic matching will ignore letter case and surrounding spaces. Manual grading does not need an accepted answer.</Text></>}
    <View style={s.row}><Action title="Move up" disabled={busy||index===0} secondary onPress={()=>move(index,-1)}/><Action title="Move down" disabled={busy||index===questions.length-1} secondary onPress={()=>move(index,1)}/><Action title={`Remove question ${index+1}`} disabled={busy} secondary onPress={()=>{setQuestions(value=>value.filter((_,i)=>i!==index));setDirty(true);}}/></View>
   </View>)}
   <View style={s.row}>{(['multiple_choice','true_false','short_answer'] as QuestionKind[]).map(kind=><Action key={kind} title={`Add ${kind==='multiple_choice'?'multiple choice':kind==='true_false'?'true/false':'short answer'}`} secondary disabled={busy||questions.length>=100} onPress={()=>{setQuestions(value=>[...value,newQuestion(kind)]);setDirty(true);}}/>)}</View>
   <Text style={s.body}>You can save incomplete quizzes. Launch checks prompts and correct answers before preparing the classroom session. Save before leaving this editor.</Text>
   <View style={s.row}><Action title="Save quiz" disabled={busy||(!dirty&&!!document)} onPress={save}/><Action title="Discard unsaved edits" disabled={busy||!dirty} secondary onPress={discard}/></View>
  </View>}
 </View>;
}
const s=StyleSheet.create({section:{gap:18},title:{color:'#193C38',fontSize:27,fontWeight:'700'},subtitle:{color:'#193C38',fontSize:20,fontWeight:'600'},label:{color:'#193C38',fontWeight:'600',fontSize:13},body:{color:'#61736E',fontSize:14,lineHeight:23},error:{color:'#A13624',lineHeight:23},row:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{backgroundColor:'white',borderWidth:1,borderColor:'#DFE6DD',borderRadius:20,padding:22,gap:16},question:{backgroundColor:'#F6F5EF',padding:18,borderRadius:14,gap:14},input:{borderWidth:1,borderColor:'#BBCAC0',borderRadius:10,padding:14,fontSize:16,color:'#193C38',minHeight:48},button:{backgroundColor:'#256B5B',padding:14,borderRadius:10,alignSelf:'flex-start'},secondary:{backgroundColor:'#EAF1E8'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#EAF1E8',padding:12,borderRadius:10}});