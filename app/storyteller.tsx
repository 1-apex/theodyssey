import {router} from 'expo-router';
import {useState} from 'react';
import {Image,KeyboardAvoidingView,Platform,Pressable,StyleSheet,TextInput,View} from 'react-native';
import {Bar,Button,Shell,T} from '@/components/ui';
import {Stars} from '@/components/PixelScene';
import {ThoughtCloud} from '@/components/ThoughtCloud';
import {colors} from '@/components/PixelSprite';
import {fonts} from '@/theme/typography';
import {app, storyteller as t} from '@/theme/copy';
import {avatarId,createOdyssey,toApiError} from '@/features/odyssey/api';

// Guided frontend conversation; the existing server-side Oracle generates the route.
export default function Storyteller(){
 const [answers,setAnswers]=useState<string[]>([]);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const total=6;
 const complete=answers.length===total;
 const message=answers.length===0?t.greeting:t.prompts[answers.length-1];
 const submit=()=>{
  const answer=input.trim();if(!answer||complete||busy)return;
  if(answers.length===2&&(!/^(?:[1-9]|1[0-9]|20)$/.test(answer))){setError(t.crewError);return}
  if(answers.length===5&&answer.length>24){setError(t.nameError);return}
  setError('');setAnswers([...answers,answer]);setInput('');
 };
 const summon=async()=>{
  if(busy||!complete)return;
  setBusy(true);setError('');
  try{
   const made=await createOdyssey({destination:answers[0],start:answers[1],crew_size:Number(answers[2]),duration:answers[3],travel_style:answers[4],nickname:answers[5],avatar_id:avatarId(0),visibility_mode:'fog',points_mode:'crew'});
   router.replace({pathname:'/odyssey/[id]/preview',params:{id:made.odyssey_id}});
  }catch(e){const code=toApiError(e).code;setError(app.errors[code]??app.errors.unknown)}finally{setBusy(false)}
 };
 return <Shell><Stars/><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.screen}>
  <Bar title={t.title} onBack={()=>router.back()}/>
  <View style={styles.header}><T style={styles.chapter}>{t.chapter}</T><T style={styles.progress}>{!complete?t.progress(answers.length+1,total):'✦'}</T></View>
  <View style={styles.scene}>
   <ThoughtCloud>{message}</ThoughtCloud>
   <Image source={require('../assets/characters/odysseus.png')} style={styles.character} resizeMode="contain" accessible accessibilityLabel={t.portrait}/>
  </View>
  <View style={styles.controls}>
   {!complete?<><View style={styles.inputRow}><TextInput accessibilityLabel={t.answerLabel} value={input} onChangeText={setInput} placeholder={answers.length===5?t.nicknamePlaceholder:t.placeholder} placeholderTextColor="#877a69" multiline maxLength={answers.length===5?24:answers.length===2?2:answers.length===3?60:answers.length===4?500:120} style={styles.input}/><Pressable accessibilityRole="button" accessibilityState={{disabled:!input.trim()}} disabled={!input.trim()} onPress={submit} style={[styles.send,!input.trim()&&styles.disabled]}><T style={styles.sendText}>{t.reply}</T></Pressable></View></>:<><Button title={busy?app.consulting:t.summon} onPress={()=>void summon()} disabled={busy}/><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setAnswers([]);setInput('');setError('')}}><T style={styles.restart}>{t.edit}</T></Pressable></>}
   {!!error&&<T accessibilityRole="alert" style={styles.error}>{error}</T>}<T style={styles.note}>{t.demo}</T>
  </View>
 </KeyboardAvoidingView></Shell>;
}
const styles=StyleSheet.create({screen:{flex:1,minHeight:650},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:14},chapter:{fontFamily:fonts.heading,fontSize:11,lineHeight:16,color:colors.sand},progress:{fontFamily:fonts.heading,fontSize:11,lineHeight:16,color:colors.gold},scene:{alignItems:'center',justifyContent:'center',flex:1},character:{width:'100%',maxWidth:360,height:290,marginTop:0},controls:{marginTop:10},inputRow:{flexDirection:'row',gap:9,alignItems:'stretch'},input:{flex:1,minHeight:66,maxHeight:130,borderWidth:3,borderColor:colors.ink,backgroundColor:colors.parchment,paddingHorizontal:12,paddingVertical:10,color:colors.ink,fontFamily:fonts.body,fontSize:16,lineHeight:23,textAlignVertical:'top'},send:{minWidth:78,borderWidth:3,borderColor:colors.ink,backgroundColor:colors.gold,alignItems:'center',justifyContent:'center',paddingHorizontal:10},sendText:{fontFamily:fonts.heading,color:colors.ink,fontSize:14,lineHeight:20},disabled:{opacity:.5},restart:{color:colors.sand,fontSize:13,textAlign:'center',padding:12},error:{color:'#ffcf91',fontSize:14,lineHeight:22,textAlign:'center',marginTop:8},note:{fontSize:11,lineHeight:17,color:colors.foam,textAlign:'center',opacity:.75}});
