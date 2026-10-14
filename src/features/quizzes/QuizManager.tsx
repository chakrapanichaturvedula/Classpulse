import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { downloadQuizPdf } from './downloadQuizPdf';
import {LibraryActions,type LibraryItem} from './LibraryActions';
import { QuestionCard } from './QuestionCard';
import {QuizWordFiles} from './QuizWordFiles';
import { QuizExcelFiles } from './QuizExcelFiles';
import type {QuizImport} from './excel';
import { supabase } from '../../lib/supabase';
import { editQuestions, newQuestion, serializeQuestions, type EditorQuestion, type QuestionKind, type QuizDocument } from './model';

type Folder={id:string;name:string;parent_id:string|null;deletion_batch?:string};
type LibraryQuiz={id:string;title:string;folder_id:string|null;deletion_batch?:string};
type Version={quiz_id:string;version_number:number;status:string};
function Action({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:0.45}]}><Text style={[s.buttonText,secondary&&{color:'#263B4B'}]}>{title}</Text></Pressable>;
}
function Choice({title,selected,onPress,disabled=false}:{title:string;selected:boolean;onPress:()=>void;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.choice,selected&&{backgroundColor:'#263B4B'},disabled&&{opacity:0.5}]}><Text style={{color:selected?'white':'#263B4B',fontWeight:'600'}}>{title}</Text></Pressable>;
}
export function QuizManager({teacherId,onDirtyChange}:{teacherId:string;onDirtyChange:(dirty:boolean)=>void}) {
 const [folders,setFolders]=useState<Folder[]>([]),[quizzes,setQuizzes]=useState<LibraryQuiz[]>([]),[versions,setVersions]=useState<Version[]>([]);
 const [actionItem,setActionItem]=useState<LibraryItem|null>(null),[actionsReady,setActionsReady]=useState(false),[deletedView,setDeletedView]=useState(false),[deletedFolders,setDeletedFolders]=useState<Folder[]>([]),[deletedQuizzes,setDeletedQuizzes]=useState<LibraryQuiz[]>([]);
 const [pdfQuiz,setPdfQuiz]=useState<LibraryQuiz|null>(null),[withAnswers,setWithAnswers]=useState(false);
 const [addOpen,setAddOpen]=useState(false),[editingKey,setEditingKey]=useState<string|null>(null),[folderPicker,setFolderPicker]=useState(false);
 const [importKind,setImportKind]=useState<'excel'|'word'>('excel');
 const [importOpen,setImportOpen]=useState(false),[importPreview,setImportPreview]=useState<QuizImport|null>(null),[importTitle,setImportTitle]=useState('');
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
   supabase!.from('quizzes').select('id,title,folder_id').eq('teacher_id',teacherId).eq('source_kind','library').order('created_at',{ascending:false}),
   supabase!.from('quiz_versions').select('quiz_id,version_number,status').eq('teacher_id',teacherId).order('version_number',{ascending:false}),
  ]);
  if(!alive.current)return;
  if(results.some(r=>r.error)){setReady(false);throw new Error('Quiz library could not load. Install the Step 4 Supabase setup, then retry.');}
  const deleted=await supabase!.rpc('classpulse_deleted_library');
  if(!alive.current)return;setActionsReady(!deleted.error);setDeletedFolders(deleted.data?.folders??[]);setDeletedQuizzes(deleted.data?.quizzes??[]);
  if(!['all','all-quizzes','unfiled'].includes(filter)&&!(results[0].data??[]).some(f=>f.id===filter))setFilter('all');
  setFolders(results[0].data??[]);setQuizzes(results[1].data??[]);setVersions(results[2].data??[]);setReady(true);
 }
 async function run(action:()=>Promise<void>) {
  if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');
  try{await action();}catch(error){if(alive.current)setError(error instanceof Error?error.message:'Could not save. Please try again.');}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void run(loadLibrary);return()=>{alive.current=false;};},[teacherId]);
 function restore(doc:QuizDocument) {setFolderPicker(false);setEditingKey(null);setDocument(doc);setTitle(doc.title);setFolder(doc.folder_id);setQuestions(editQuestions(doc.questions));setEditorOpen(true);setDirty(false);}
 async function readQuiz(id:string){const {data,error}=await supabase!.rpc('classpulse_get_quiz',{target_quiz:id});if(error)throw new Error('Could not open this quiz. Please retry.');if(alive.current)restore(data as QuizDocument);}
 async function exportPdf(){if(!pdfQuiz)return;const {data,error}=await supabase!.rpc('classpulse_get_quiz',{target_quiz:pdfQuiz.id});if(error||!data)throw new Error('Could not load the saved quiz for export. Please retry.');await downloadQuizPdf(data as QuizDocument,withAnswers);if(alive.current){setPdfQuiz(null);setNotice('PDF downloaded. Open it to view or print.');}}
 function newQuiz(){if(dirty){setError('Save your draft or discard edits before opening another quiz.');return;}setAddOpen(false);setFolderPicker(false);setEditingKey(null);setDocument(null);setTitle('Untitled Quiz');setFolder(filter==='all'||filter==='all-quizzes'||filter==='unfiled'?null:filter);setQuestions([]);setEditorOpen(true);setDirty(false);setError('');setNotice('');}
 function importQuiz(kind:'excel'|'word'='excel'){if(dirty){setError('Save or discard your current quiz before importing.');return;}setAddOpen(false);setImportKind(kind);setImportPreview(null);setImportTitle('');setImportOpen(true);setError('');}
 function useImport(){if(!importPreview||importPreview.errors.length||!importTitle.trim())return;setFolderPicker(false);setEditingKey(null);setDocument(null);setTitle(importTitle.trim());setFolder(filter==='all'||filter==='all-quizzes'||filter==='unfiled'?null:filter);setQuestions(editQuestions(importPreview.questions));setEditorOpen(true);setDirty(true);setImportOpen(false);setNotice('Imported into the editor. Review your questions, then Save and Exit.');}
 function openQuiz(id:string){if(dirty){setError('Save your draft or discard edits before opening another quiz.');return;}void run(()=>readQuiz(id));}
 function updateQuestion(index:number,patch:Partial<EditorQuestion>){setQuestions(value=>value.map((q,i)=>i===index?{...q,...patch}:q));setDirty(true);}
 function move(index:number,offset:number){setQuestions(value=>{const next=[...value];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});setDirty(true);}
 function addQuestion(kind:QuestionKind){if(questions.length>=100)return;const question=newQuestion(kind);setQuestions(value=>[...value,question]);setEditingKey(question.key);setDirty(true);}
 function duplicateQuestion(index:number){if(questions.length>=100){setError('Use at most 100 questions.');return;}const original=questions[index],copy={...original,key:newQuestion(original.type).key,options:[...original.options]};setQuestions(value=>[...value.slice(0,index+1),copy,...value.slice(index+1)]);setEditingKey(copy.key);setDirty(true);}
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
 function openActions(item:LibraryItem){setError('');setActionItem(item);}
 async function afterAction(message:string){await loadLibrary();if(here&&!folders.some(f=>f.id===here))setFilter('all');setNotice(message);}
 function restoreItem(kind:'quiz'|'folder',id:string){void run(async()=>{const {error}=await supabase!.rpc('classpulse_library_action',{item_kind:kind,target_item:id,action_name:'restore'});if(error)throw new Error(error.code==='P0001'?error.message:'Could not restore this item. Please refresh.');await loadLibrary();setNotice('Item restored.');});}
 const orderedFolders=[...folders].sort((a,b)=>path(a.id).localeCompare(path(b.id)));
 const needle=search.trim().toLowerCase();
 const here=filter==='all'||filter==='all-quizzes'||filter==='unfiled'?null:filter;
 const visibleFolders=orderedFolders.filter(f=>needle?path(f.id).toLowerCase().includes(needle):filter!=='all-quizzes'&&filter!=='unfiled'&&f.parent_id===here);
 const visibleQuizzes=quizzes.filter(q=>needle?`${q.title} ${q.folder_id?path(q.folder_id):''}`.toLowerCase().includes(needle):filter==='all-quizzes'||q.folder_id===here);
 return <View style={s.section}>
  {!!error&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
  {!editorOpen&&<>
   <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>Library</Text><View style={s.row}><Action title="Refresh" disabled={busy} secondary onPress={()=>void run(loadLibrary)}/><Action title="New Folder" disabled={busy||!ready||deletedView} secondary onPress={()=>{setParent(here);setFolderName('');setFolderForm(true);}}/><Action title="Add Quiz" disabled={busy||!ready||deletedView} onPress={()=>setAddOpen(true)}/></View></View>
   <View style={s.row}><Choice title="Quizzes" selected={!deletedView} onPress={()=>{setDeletedView(false);setSearch('');}}/><Choice title="Deleted" selected={deletedView} onPress={()=>{setDeletedView(true);setSearch('');}}/></View>
   {!deletedView&&<View style={s.libraryTools}><View style={s.row}><Choice title="Personal" selected={filter==='all'} onPress={()=>{setFilter('all');setSearch('');}}/><Choice title="All quizzes" selected={filter==='all-quizzes'} onPress={()=>{setFilter('all-quizzes');setSearch('');}}/>{here&&<Action title="‹ Back" disabled={busy} secondary onPress={()=>{setFilter(folders.find(f=>f.id===here)?.parent_id??'all');setSearch('');}}/>}</View><TextInput accessibilityLabel="Search quizzes and folders" placeholder="Search quizzes and folders" placeholderTextColor="#667582" value={search} onChangeText={setSearch} style={[s.input,{width:280,maxWidth:'100%'}]}/></View>}
   {!deletedView&&<View style={s.toolbar}><Text style={s.label}>{needle?'Search results':here?`Personal / ${path(here)}`:filter==='all-quizzes'?'All quizzes':'Personal'}</Text>{here&&<Action title="Rename folder" disabled={busy} secondary onPress={()=>{setFolderToRename(here);setRenameText(folders.find(f=>f.id===here)?.name??'');}}/>}</View>}
   {!deletedView&&<View style={s.list}>
    <View style={s.listHeader}><Text style={[s.label,{flex:1}]}>NAME</Text><Text style={s.typeHeader}>TYPE</Text></View>
    {visibleFolders.map(f=><View key={f.id} style={s.listRow}><Text style={s.fileIcon}>▸</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open folder: ${path(f.id)}`} disabled={busy} onPress={()=>{setFilter(f.id);setSearch('');}} style={{flex:1,gap:4}}><Text style={s.itemName}>{f.name}</Text>{!!needle&&<Text style={s.body}>{path(f.id)}</Text>}</Pressable><Text style={s.typeText}>Folder</Text><Pressable accessibilityRole="button" accessibilityLabel={`Folder actions: ${f.name}`} disabled={busy} onPress={()=>openActions({id:f.id,name:f.name,kind:'folder',parent:f.parent_id})} style={{padding:12}}><Text style={{fontSize:24,color:'#0088B0'}}>⋯</Text></Pressable></View>)}
    {visibleQuizzes.map(q=><View key={q.id} style={s.listRow}><Text style={s.fileIcon}>≡</Text><Pressable accessibilityRole="button" accessibilityLabel={`Open quiz: ${q.title}`} disabled={busy} onPress={()=>openQuiz(q.id)} style={{flex:1,gap:4}}><Text style={s.itemName}>{q.title}</Text>{(needle||filter==='all-quizzes')&&<Text style={s.body}>{q.folder_id?path(q.folder_id):'Personal'}</Text>}</Pressable><Text style={s.typeText}>Quiz</Text><Pressable accessibilityRole="button" accessibilityLabel={`Download PDF: ${q.title}`} disabled={busy} onPress={()=>{setWithAnswers(false);setError('');setPdfQuiz(q);}} style={s.secondary}><Text style={{color:'#0088B0',padding:10,fontWeight:'600'}}>PDF ↓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Quiz actions: ${q.title}`} disabled={busy} onPress={()=>openActions({id:q.id,name:q.title,kind:'quiz',parent:q.folder_id})} style={{padding:12}}><Text style={{fontSize:24,color:'#0088B0'}}>⋯</Text></Pressable></View>)}
    {ready&&!visibleFolders.length&&!visibleQuizzes.length&&<Text style={[s.body,{padding:20}]}>{needle?'No matching quizzes or folders.':'This folder is empty. Add a quiz or create a folder.'}</Text>}
    {!ready&&!error&&<Text style={[s.body,{padding:20}]}>Loading library…</Text>}
   </View>}
   {deletedView&&<View style={s.list}><Text style={[s.body,{padding:18}]}>Restore a folder to restore the quizzes and subfolders deleted with it. Saved reports are kept separately in Reports.</Text>{!actionsReady&&<Text style={[s.error,{padding:18}]}>Run the library actions setup in Supabase, then Refresh.</Text>}
    {deletedFolders.filter(f=>f.deletion_batch===f.id).map(f=><View key={f.id} style={s.listRow}><Text style={[s.itemName,{flex:1}]}>{f.name}</Text><Text style={s.typeText}>Folder</Text><Action title={`Restore ${f.name}`} disabled={busy} secondary onPress={()=>restoreItem('folder',f.id)}/></View>)}
    {deletedQuizzes.filter(q=>q.deletion_batch===q.id).map(q=><View key={q.id} style={s.listRow}><Text style={[s.itemName,{flex:1}]}>{q.title}</Text><Text style={s.typeText}>Quiz</Text><Action title={`Restore ${q.title}`} disabled={busy} secondary onPress={()=>restoreItem('quiz',q.id)}/></View>)}
    {actionsReady&&!deletedFolders.some(f=>f.deletion_batch===f.id)&&!deletedQuizzes.some(q=>q.deletion_batch===q.id)&&<Text style={[s.body,{padding:18}]}>No deleted quizzes or folders.</Text>}
   </View>}
  </>}
  {actionItem&&<LibraryActions key={actionItem.kind+actionItem.id} item={actionItem} folders={folders} path={path} ready={actionsReady} onClose={()=>setActionItem(null)} onSaved={afterAction}/>}
  <Modal visible={!!pdfQuiz} transparent animationType="fade" onRequestClose={()=>{if(!busy)setPdfQuiz(null);}}><View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><Text style={s.subtitle}>Download quiz PDF</Text><Text style={s.body}>{pdfQuiz?.title}</Text><Text style={s.small}>Exports the latest saved quiz. Download the question paper for students or keep the answer key for teachers.</Text><Choice title="Question paper - without answers" selected={!withAnswers} disabled={busy} onPress={()=>setWithAnswers(false)}/><Choice title="Answer key - with answers" selected={withAnswers} disabled={busy} onPress={()=>setWithAnswers(true)}/>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}<View style={s.row}><Action title="Cancel" secondary disabled={busy} onPress={()=>setPdfQuiz(null)}/><Action title={busy?'Preparing PDF…':'Download PDF'} disabled={busy} onPress={()=>void run(exportPdf)}/></View></View></View></Modal>
  <Modal visible={addOpen} transparent animationType="fade" onRequestClose={()=>setAddOpen(false)}><View style={s.overlay}><View accessibilityViewIsModal style={[s.dialog,{maxWidth:560}]}><View style={s.toolbar}><Text style={s.subtitle}>Add Quiz</Text><Pressable accessibilityRole="button" accessibilityLabel="Close Add Quiz" onPress={()=>setAddOpen(false)}><Text style={{fontSize:26,color:'#667582'}}>×</Text></Pressable></View>
   <Text style={s.label}>Import Questions</Text><Pressable accessibilityRole="button" accessibilityLabel="Import questions from Excel template" onPress={()=>importQuiz('excel')} style={s.method}><Text style={s.methodIcon}>▦</Text><View style={{flex:1,gap:6}}><Text style={s.methodTitle}>Excel Template</Text><Text style={s.body}>Download a template, fill it in, and import your questions.</Text></View></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Import questions from Word document" onPress={()=>importQuiz('word')} style={s.method}><Text style={s.methodIcon}>≡</Text><View style={{flex:1,gap:6}}><Text style={s.methodTitle}>Word Document</Text><Text style={s.body}>Upload a formatted .docx quiz and review its questions and answer key.</Text></View></Pressable><Text style={s.label}>Start From Scratch</Text><Pressable accessibilityRole="button" accessibilityLabel="Blank Quiz" onPress={newQuiz} style={s.method}><Text style={s.methodIcon}>＋</Text><View style={{flex:1,gap:6}}><Text style={s.methodTitle}>Blank Quiz</Text><Text style={s.body}>Build a quiz with multiple choice, true/false and short answers.</Text></View></Pressable>
  </View></View></Modal>
  <Modal visible={importOpen} transparent animationType="fade" onRequestClose={()=>setImportOpen(false)}>
   <View style={s.overlay}><View accessibilityViewIsModal style={[s.dialog,{maxWidth:740,maxHeight:'90%'}]}><Text style={s.subtitle}>{importKind==='word'?'Import Word quiz':'Import Excel quiz'}</Text><ScrollView style={{maxHeight:520}} contentContainerStyle={{gap:16}}>{React.createElement(importKind==='word'?QuizWordFiles:QuizExcelFiles,{key:importOpen?'open':'closed',disabled:busy,onBegin:()=>setImportPreview(null),onRead:(preview:QuizImport,name:string)=>{setImportPreview(preview);setImportTitle(name);}})}
    {importPreview&&<><Text style={s.label}>Quiz title</Text><TextInput accessibilityLabel="Imported quiz title" style={s.input} value={importTitle} onChangeText={setImportTitle} maxLength={200}/><Text style={s.body}>Destination: {here?path(here):'Personal'}. You can change the folder in the editor.</Text><Text style={s.subtitle}>Preview · {importPreview.questions.length} valid questions</Text>
     {importPreview.errors.slice(0,25).map((message,i)=><Text key={i} accessibilityRole="alert" style={s.error}>{message}</Text>)}{importPreview.errors.length>25&&<Text style={s.error}>{importPreview.errors.length-25} more errors. Fix the file and upload it again.</Text>}
     {importPreview.questions.map((q,i)=><View key={i} style={{gap:5,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E4E9EE'}}><Text style={s.label}>{i+1}. {q.prompt}</Text><Text style={s.body}>{q.type==='multiple_choice'?'Multiple choice':q.type==='true_false'?'True / False':'Short answer'} · {q.points} points</Text>{q.options.map((option,j)=><Text key={j} style={s.body}>{String.fromCharCode(65+j)}. {option}{q.correct_position===j+1?' ✓':''}</Text>)}{q.type==='short_answer'&&<Text style={s.body}>{q.manual_grading?'Teacher grades manually':`Accepted answers: ${q.accepted_answers.join(', ')}`}</Text>}</View>)}
    </>}
   </ScrollView><View style={s.row}><Action title="Cancel" secondary onPress={()=>setImportOpen(false)}/><Action title="Open in editor" disabled={!importPreview||!!importPreview.errors.length||!importTitle.trim()} onPress={useImport}/></View></View></View>
  </Modal>
  <Modal visible={folderForm||!!folderToRename} transparent animationType="fade" onRequestClose={()=>{if(!busy){setFolderForm(false);setFolderToRename(null);}}}>
   <View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}><Text style={s.subtitle}>{folderToRename?'Rename folder':'New Folder'}</Text><Text style={s.body}>{folderToRename?'Choose a folder name.':`Create in ${parent?path(parent):'Personal'}`}</Text>
    <TextInput accessibilityLabel={folderToRename?'Rename quiz folder':'New quiz folder name'} style={s.input} autoFocus value={folderToRename?renameText:folderName} onChangeText={folderToRename?setRenameText:setFolderName} placeholder="Folder name" maxLength={120} editable={!busy}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={s.row}><Action title="Cancel" disabled={busy} secondary onPress={()=>{setFolderForm(false);setFolderToRename(null);setError('');}}/><Action title={busy?'Saving…':folderToRename?'Save':'Create'} disabled={busy||!ready} onPress={folderToRename?renameFolder:createFolder}/></View>
   </View></View>
  </Modal>
  {editorOpen&&<View style={s.editor}>
   <View style={s.toolbar}><Action title="‹ Library" secondary disabled={busy} onPress={backToLibrary}/><Text style={s.body}>{folder?path(folder):'Personal'}{dirty?' · Unsaved changes':''}</Text><Action title="Save and Exit" disabled={busy} onPress={saveAndExit}/></View>
   <TextInput accessibilityLabel="Quiz title" style={s.quizTitle} value={title} onChangeText={value=>{setTitle(value);setDirty(true);}} selectTextOnFocus placeholder="Untitled Quiz" maxLength={200} editable={!busy}/>
   {document?.status==='published'&&<Text style={s.body}>Edits will be saved as a new version. Earlier classroom results are preserved.</Text>}
   <View style={s.toolbar}><Text style={s.small}>{questions.length} {questions.length===1?'question':'questions'}</Text><Action title={folderPicker?'Hide folders':'Change folder'} secondary disabled={busy} onPress={()=>setFolderPicker(value=>!value)}/></View>
   {folderPicker&&<View style={s.row}><Choice title="Personal" selected={folder===null} disabled={busy} onPress={()=>{setFolder(null);setDirty(true);setFolderPicker(false);}}/>{orderedFolders.map(f=><Choice key={f.id} title={path(f.id)} selected={folder===f.id} disabled={busy} onPress={()=>{setFolder(f.id);setDirty(true);setFolderPicker(false);}}/>)}</View>}
   {questions.map((q,index)=><QuestionCard key={q.key} question={q} index={index} editing={editingKey===q.key} disabled={busy} last={index===questions.length-1} onChange={patch=>updateQuestion(index,patch)} onEdit={()=>setEditingKey(q.key)} onDone={()=>setEditingKey(null)} onRemove={()=>{setQuestions(value=>value.filter(item=>item.key!==q.key));if(editingKey===q.key)setEditingKey(null);setDirty(true);}} onMove={offset=>move(index,offset)} onDuplicate={()=>duplicateQuestion(index)}/>)}
   <View style={[s.addQuestions,questions.length>0&&{paddingVertical:24}]}><View style={{gap:14,alignItems:'center',flex:1,minWidth:240}}><Text style={s.subtitle}>Add Blank Question</Text><View style={{gap:10}}>{(['multiple_choice','true_false','short_answer'] as QuestionKind[]).map(kind=><Action key={kind} title={kind==='multiple_choice'?'☷ Multiple Choice':kind==='true_false'?'✓× True / False':'≡ Short Answer'} secondary disabled={busy||questions.length>=100} onPress={()=>addQuestion(kind)}/>)}</View></View>
    {!questions.length&&<View style={s.importPanel}><Text style={s.subtitle}>Import Questions</Text><Action title="Word Document" disabled={busy} onPress={()=>importQuiz('word')}/><Action title="Excel Template" disabled={busy} onPress={()=>importQuiz('excel')}/><Text style={[s.body,{textAlign:'center',maxWidth:290}]}>Start with questions prepared in the downloadable template.</Text></View>}
   </View>
   <View style={s.toolbar}><Text style={s.small}>Done closes a question card. Save and Exit saves the quiz.</Text><View style={s.row}><Action title="Save quiz" disabled={busy||(!dirty&&!!document)} onPress={save}/><Action title="Discard unsaved edits" disabled={busy||!dirty} secondary onPress={discard}/></View></View>
  </View>}

 </View>;
}
const s=StyleSheet.create({editor:{gap:18},quizTitle:{fontSize:32,fontWeight:'700',color:'#263B4B',borderWidth:1,borderColor:'#E4E9EE',borderRadius:7,padding:14,minHeight:64,maxWidth:680,backgroundColor:'white'},small:{fontSize:12,lineHeight:21,color:'#667582'},method:{flexDirection:'row',alignItems:'center',gap:18,borderWidth:1,borderColor:'#E4E9EE',borderRadius:6,padding:20},methodIcon:{fontSize:34,color:'#0088B0',width:40,textAlign:'center'},methodTitle:{fontSize:18,fontWeight:'600',color:'#0088B0'},addQuestions:{flexDirection:'row',flexWrap:'wrap',gap:28,paddingVertical:50,borderTopWidth:1,borderTopColor:'#E4E9EE'},importPanel:{flex:1,minWidth:240,alignItems:'center',gap:14,paddingHorizontal:20},toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'},libraryTools:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'},list:{borderTopWidth:1,borderTopColor:'#E4E9EE'},listHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},listRow:{flexDirection:'row',alignItems:'center',gap:16,minHeight:56,paddingHorizontal:16,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#E4E9EE'},fileIcon:{fontSize:20,color:'#263B4B',width:20},itemName:{fontSize:15,color:'#263B4B'},typeHeader:{width:65,color:'#667582',fontSize:12},typeText:{width:65,color:'#667582',fontSize:13},overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.25)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:440,backgroundColor:'white',padding:24,borderRadius:8,gap:16},section:{gap:18},title:{color:'#263B4B',fontSize:28,fontWeight:'700'},subtitle:{color:'#263B4B',fontSize:18,fontWeight:'600'},label:{color:'#263B4B',fontWeight:'600',fontSize:13},body:{color:'#667582',fontSize:14,lineHeight:23},error:{color:'#A13624',lineHeight:23},row:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{backgroundColor:'white',borderWidth:1,borderColor:'#E4E9EE',borderRadius:4,padding:20,gap:16},question:{backgroundColor:'#FFFFFF',padding:18,borderRadius:4,gap:14},input:{borderWidth:1,borderColor:'#CDD6DE',borderRadius:4,padding:11,fontSize:16,color:'#263B4B',minHeight:40},button:{backgroundColor:'#0088B0',paddingVertical:10,paddingHorizontal:14,borderRadius:4,alignSelf:'flex-start'},secondary:{backgroundColor:'#F0F7FA'},buttonText:{color:'white',fontWeight:'600'},choice:{backgroundColor:'#F0F7FA',paddingVertical:9,paddingHorizontal:12,borderRadius:4}});
