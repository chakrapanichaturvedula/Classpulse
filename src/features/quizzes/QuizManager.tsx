import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { editQuestions, newQuestion, serializeQuestions, type EditorQuestion, type QuestionKind, type QuizDocument } from './model';

type Folder={id:string;name:string;parent_id:string|null};
type LibraryQuiz={id:string;title:string;folder_id:string|null};
type Version={quiz_id:string;version_number:number;status:string};
function Action({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:0.45}]}><Text style={[s.buttonText,secondary&&{color:'#263B4B'}]}>{title}</Text></Pressable>;
}
function Choice({title,selected,onPress,disabled=false}:{title:string;selected:boolean;onPress:()=>void;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.choice,selected&&{backgroundColor:'#263B4B'},disabled&&{opacity:0.5}]}><Text style={{color:selected?'white':'#263B4B',fontWeight:'600'}}>{title}</Text></Pressable>;
}
export function QuizManager({teacherId,onDirtyChange}:{teacherId:string;onDirtyChange:(dirty:boolean)=>void}) {
 const [folders,setFolders]=useState<Folder[]>([]),[quizzes,setQuizzes]=useState<LibraryQuiz[]>([]),[versions,setVersions]=useState<Version[]>([]);
 const [search,setSearch]=useState(''),[folderForm,setFolderForm]=useState(false);
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
 function newQuiz(){if(dirty){setError('Save your draft or discard edits before opening another quiz.');return;}setDocument(null);setTitle('');setFolder(filter==='all'||filter==='all-quizzes'||filter==='unfiled'?null:filter);setQuestions([]);setEditorOpen(true);setDirty(false);setError('');setNotice('');}
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
 function saveAndExit(){void run(async()=>{if(dirty||!document)await saveDraft();await loadLibrary();setEditorOpen(false);setNotice('Quiz saved.');});}
 function backToLibrary(){if(dirty){setError('Save your quiz or discard edits before returning to the library.');return;}setEditorOpen(false);setError('');setNotice('');}
 function createFolder(){void run(async()=>{
  if(!folderName.trim())throw new Error('Enter a folder name.');
  const {error}=await supabase!.from('quiz_folders').insert({teacher_id:teacherId,name:folderName.trim(),parent_id:parent});
  if(error)throw new Error(error.code==='23505'?'A folder with that name already exists here.':'Could not create the folder.');
  setFolderName('');await loadLibrary();setFolderForm(false);setNotice('Folder created.');
 });}
 function renameFolder(){void run(async()=>{
  if(!renameText.trim())throw new Error('Enter a folder name.');
  const {error}=await supabase!.from('quiz_folders').update({name:renameText.trim()}).eq('id',folderToRename).eq('teacher_id',teacherId);
  if(error)throw new Error(error.code==='23505'?'A folder with that name already exists here.':'Could not rename the folder.');
  setFolderToRename(null);await loadLibrary();setNotice('Folder renamed.');
 });}
 function discard(){void run(async()=>{if(document)await readQuiz(document.quiz_id);else{setEditorOpen(false);setQuestions([]);setDirty(false);}setNotice('Unsaved edits discarded.');});}
 const orderedFolders=[...folders].sort((a,b)=>path(a.id).localeCompare(path(b.id)));
 const needle=search.trim().toLowerCase();
 const here=filter==='all'||filter==='all-quizzes'||filter==='unfiled'?null:filter;
 const visibleFolders=orderedFolders.filter(f=>needle?path(f.id).toLowerCase().includes(needle):filter!=='all-quizzes'&&filter!=='unfiled'&&f.parent_id===here);
 const visibleQuizzes=quizzes.filter(q=>needle?`${q.title} ${q.folder_id?path(q.folder_id):''}`.toLowerCase().includes(needle):filter==='all-quizzes'||q.folder_id===here);
 return <View style={s.section}>
  {!!error&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
  {!editorOpen&&<>
   <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>Library</Text><View style={s.row}><Action title="Refresh" disabled={busy} secondary onPress={()=>void run(loadLibrary)}/><Action title="New Folder" disabled={busy||!ready} secondary onPress={()=>{setParent(here);setFolderName('');setFolderForm(true);}}/><Action title="Add Quiz" disabled={busy||!ready} onPress={newQuiz}/></View></View>
   <View style={s.libraryTools}><View style={s.row}><Choice title="Personal" selected={filter==='all'} onPress={()=>{setFilter('all');setSearch('');}}/><Choice title="All quizzes" selected={filter==='all-quizzes'} onPress={()=>{setFilter('all-quizzes');setSearch('');}}/>{here&&<Action title="‹ Back" disabled={busy} secondary onPress={()=>{setFilter(folders.find(f=>f.id===here)?.parent_id??'all');setSearch('');}}/>}</View><TextInput accessibilityLabel="Search quizzes and folders" placeholder="Search quizzes and folders" placeholderTextColor="#667582" value={search} onChangeText={setSearch} style={[s.input,{width:280,maxWidth:'100%'}]}/></View>
   <View style={s.toolbar}><Text style={s.label}>{needle?'Search results':here?`Personal / ${path(here)}`:filter==='all-quizzes'?'All quizzes':'Personal'}</Text>{here&&<Action title="Rename folder" disabled={busy} secondary onPress={()=>{setFolderToRename(here);setRenameText(folders.find(f=>f.id===here)?.name??'');}}/>}</View>
   <View style={s.list}>
    <View style={s.listHeader}><Text style={[s.label,{flex:1}]}>NAME</Text><Text style={s.typeHeader}>TYPE</Text></View>
    {visibleFolders.map(f=><Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`Open folder: ${path(f.id)}`} disabled={busy} onPress={()=>{setFilter(f.id);setSearch('');}} style={s.listRow}><Text style={s.fileIcon}>▸</Text><View style={{flex:1,gap:4}}><Text style={s.itemName}>{f.name}</Text>{!!needle&&<Text style={s.body}>{path(f.id)}</Text>}</View><Text style={s.typeText}>Folder</Text></Pressable>)}
    {visibleQuizzes.map(q=><Pressable key={q.id} accessibilityRole="button" accessibilityLabel={`Open quiz: ${q.title}`} disabled={busy} onPress={()=>openQuiz(q.id)} style={s.listRow}><Text style={s.fileIcon}>≡</Text><View style={{flex:1,gap:4}}><Text style={s.itemName}>{q.title}</Text>{(needle||filter==='all-quizzes')&&<Text style={s.body}>{q.folder_id?path(q.folder_id):'Personal'}</Text>}</View><Text style={s.typeText}>Quiz</Text></Pressable>)}
    {ready&&!visibleFolders.length&&!visibleQuizzes.length&&<Text style={[s.body,{padding:20}]}>{needle?'No matching quizzes or folders.':'This folder is empty. Add a quiz or create a folder.'}</Text>}
    {!ready&&!error&&<Text style={[s.body,{padding:20}]}>Loading library…</Text>}
   </View>
  </>}
  <Modal visible={folderForm||!!folderToRename} transparent animationType="fade" onRequestClose={()=>{if(!busy){setFolderForm(false);setFolderToRename(null);}}}>
   <View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><Text style={s.subtitle}>{folderToRename?'Rename folder':'New Folder'}</Text><Text style={s.body}>{folderToRename?'Choose a folder name.':`Create in ${parent?path(parent):'Personal'}`}</Text>
    <TextInput accessibilityLabel={folderToRename?'Rename quiz folder':'New quiz folder name'} style={s.input} autoFocus value={folderToRename?renameText:folderName} onChangeText={folderToRename?setRenameText:setFolderName} placeholder="Folder name" maxLength={120} editable={!busy}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={s.row}><Action title="Cancel" disabled={busy} secondary onPress={()=>{setFolderForm(false);setFolderToRename(null);setError('');}}/><Action title={busy?'Saving…':folderToRename?'Save':'Create'} disabled={busy||!ready} onPress={folderToRename?renameFolder:createFolder}/></View>
   </View></View>
  </Modal>
  {editorOpen&&<View style={s.card}>
   <View style={s.toolbar}><Action title="‹ Library" secondary disabled={busy} onPress={backToLibrary}/><Text accessibilityRole="header" style={s.subtitle}>{document?'Edit quiz':'New quiz'}{dirty?' · Unsaved changes':''}</Text><Action title="Save and Exit" disabled={busy} onPress={saveAndExit}/></View>
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
const s=StyleSheet.create({toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'},libraryTools:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'},list:{borderTopWidth:1,borderTopColor:'#E4E9EE'},listHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},listRow:{flexDirection:'row',alignItems:'center',gap:16,minHeight:56,paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},fileIcon:{fontSize:20,color:'#263B4B',width:20},itemName:{fontSize:15,color:'#263B4B'},typeHeader:{width:65,color:'#667582',fontSize:12},typeText:{width:65,color:'#667582',fontSize:13},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.25)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:440,backgroundColor:'white',padding:24,borderRadius:8,gap:16},section:{gap:18},title:{color:'#263B4B',fontSize:28,fontWeight:'700'},subtitle:{color:'#263B4B',fontSize:18,fontWeight:'600'},label:{color:'#263B4B',fontWeight:'600',fontSize:13},body:{color:'#667582',fontSize:14,lineHeight:23},error:{color:'#A13624',lineHeight:23},row:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,padding:20,gap:16},question:{backgroundColor:'#FFFFFF',padding:18,borderRadius:4,gap:14},input:{borderWidth:1,borderColor:'#CDD6DE',borderRadius:4,padding:11,fontSize:16,color:'#263B4B',minHeight:40},button:{backgroundColor:'#0088B0',paddingVertical:10,paddingHorizontal:14,borderRadius:4,alignSelf:'flex-start'},secondary:{backgroundColor:'#F0F7FA'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#F0F7FA',paddingVertical:9,paddingHorizontal:12,borderRadius:4}});