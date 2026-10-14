import React,{useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {supabase} from '../../lib/supabase';
export type LibraryItem={id:string;name:string;kind:'quiz'|'folder';parent:string|null};
type Folder={id:string;name:string;parent_id:string|null};
export function LibraryActions({item,folders,path,ready,onClose,onSaved}:{item:LibraryItem|null;folders:Folder[];path:(id:string)=>string;ready:boolean;onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
 const [action,setAction]=useState<'menu'|'rename'|'move'|'delete'>('menu'),[name,setName]=useState(item?.name??''),[destination,setDestination]=useState<string|null>(item?.parent??null),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function close(){if(!busy)onClose();}
 function blocked(id:string){if(item?.kind!=='folder')return false;const seen=new Set<string>();let f=folders.find(f=>f.id===id);while(f&&!seen.has(f.id)){if(f.id===item.id)return true;seen.add(f.id);f=folders.find(row=>row.id===f?.parent_id);}return false;}
 async function save(){if(busy||!item)return;setBusy(true);setError('');try{
  const {error}=await supabase!.rpc('classpulse_library_action',{item_kind:item.kind,target_item:item.id,action_name:action,new_name:action==='rename'?name.trim():null,destination:action==='move'?destination:null,expected_name:item.name});
  if(error)throw new Error(error.code==='23505'?'A folder with this name already exists at the destination. Rename it first.':error.code==='P0001'?error.message:'Run the library actions setup in Supabase, then refresh Library.');
  await onSaved(action==='delete'?`${item.kind==='quiz'?'Quiz':'Folder and its contents'} moved to Deleted. Saved reports are kept.`:action==='move'?'Item moved.':'Item renamed.');onClose();
 }catch(e){setError(e instanceof Error?e.message:'Could not save. Please refresh and try again.');}finally{setBusy(false);}}
 function button(label:string,onPress:()=>void,disabled=false){return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,disabled&&{opacity:0.4}]}><Text style={s.link}>{label}</Text></Pressable>;}
 return <Modal visible={!!item} transparent animationType="fade" onRequestClose={close}><View style={s.overlay}><View accessibilityViewIsModal style={s.dialog}>
  <View style={s.header}><Text accessibilityRole="header" style={s.title}>{action==='menu'?item?.name:action==='rename'?'Rename':action==='move'?'Move to…':'Delete'}{action!=='menu'&&` ${item?.kind}`}</Text>{button('Close',close,busy)}</View>
  {action==='menu'?<View style={{gap:6}}>{button('Rename',()=>{setName(item?.name??'');setAction('rename');})}{button('Move to…',()=>setAction('move'))}{button('Delete',()=>setAction('delete'))}</View>:<>
   {action==='rename'&&<TextInput accessibilityLabel={`Rename ${item?.kind}`} value={name} onChangeText={setName} style={s.input} editable={!busy} maxLength={item?.kind==='quiz'?200:120}/>}
   {action==='move'&&<><Text style={s.body}>{item?.name}</Text><TextInput accessibilityLabel="Search destination folders" placeholder="Search folders" placeholderTextColor="#667582" value={search} onChangeText={setSearch} style={s.input}/><ScrollView style={{maxHeight:280}}>{button(`${destination===null?'✓ ':''}Personal`,()=>setDestination(null),busy)}{folders.filter(f=>!blocked(f.id)&&path(f.id).toLowerCase().includes(search.trim().toLowerCase())).map(f=><Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`Move destination: ${path(f.id)}`} accessibilityState={{selected:destination===f.id}} disabled={busy} onPress={()=>setDestination(f.id)} style={[s.button,destination===f.id&&{backgroundColor:'#D4EDF5'}]}><Text style={s.link}>{destination===f.id?'✓ ':''}{path(f.id)}</Text></Pressable>)}</ScrollView><Text style={s.body}>Destination: {destination?path(destination):'Personal'}</Text></>}
   {action==='delete'&&<><Text style={s.body}>Move “{item?.name}” to Deleted?</Text><Text style={s.body}>{item?.kind==='folder'?'This includes its subfolders and quizzes. Restoring the folder restores the items deleted with it.':'You can restore this quiz from the Deleted tab.'} Saved reports and student answers are kept.</Text><Text style={s.body}>End any running quiz before deleting it or its folder.</Text></>}
   {!ready&&<Text style={s.error}>Run the library actions setup in Supabase, then refresh Library.</Text>}
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
   <View style={s.header}>{button('Cancel',close,busy)}{button(busy?'Saving…':action==='delete'?'Confirm delete':'Save',()=>void save(),busy||!ready||(action==='rename'&&!name.trim()))}</View>
  </>}
 </View></View></Modal>;
}
const s=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(38,59,75,0.3)',alignItems:'center',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:560,maxHeight:'90%',backgroundColor:'white',padding:24,borderRadius:8,gap:18},header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12},title:{fontSize:20,fontWeight:'600',color:'#263B4B',flexShrink:1},body:{fontSize:14,color:'#667582',lineHeight:23},link:{color:'#0088B0',fontSize:15,fontWeight:'600'},button:{paddingVertical:12,paddingHorizontal:14,backgroundColor:'#E5F7FC',borderRadius:4,marginBottom:6},input:{borderWidth:1,borderColor:'#CDD6DE',padding:12,borderRadius:4,fontSize:16,color:'#263B4B'},error:{color:'#A13624',lineHeight:22}});
