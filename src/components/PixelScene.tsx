import React from 'react';
import {View,Text,StyleSheet} from 'react-native';
import Svg,{Path,Rect,Defs,RadialGradient,Stop} from 'react-native-svg';
import {LinearGradient} from 'expo-linear-gradient';
import {PixelSprite,pixels,colors} from './PixelSprite';
import {Bob} from './Bob';
import {c} from '../theme/copy';

import {PixelCloud as Cloud} from './PixelCloud';
export {PixelCloud as Cloud} from './PixelCloud';
export function Island({temple=false,size=4}:{temple?:boolean;size?:number}){return <PixelSprite rows={temple?pixels.ITHACA:pixels.ISLAND} size={size}/>}
export function Ship({size=4}:{size?:number}){return <Bob><PixelSprite rows={pixels.SHIP} size={size} title={c.shipLabel}/></Bob>}
export function Waves({y,width=400}:{y:number;width?:number}){return <Path d={Array.from({length:Math.ceil(width/16)},(_,i)=>`M${i*16} ${y}a8 8 0 0 1 16 0`).join(' ')} fill="none" stroke={colors.foam} strokeWidth={2} opacity={.5}/>}
export function SeaLines(){return <View pointerEvents="none" style={StyleSheet.absoluteFill}><Svg width="100%" height="100%"><Defs><RadialGradient id="glow" cx="50%" cy="0%" rx="70%" ry="65%"><Stop offset="0" stopColor={colors['ocean-light']} stopOpacity={.35}/><Stop offset="1" stopColor={colors['ocean-light']} stopOpacity={0}/></RadialGradient></Defs><Rect width="100%" height="100%" fill="url(#glow)"/></Svg>{Array.from({length:90},(_,i)=><View key={i} style={{position:'absolute',top:i*24+22,left:0,right:0,height:2,backgroundColor:colors.foam,opacity:.06}}/>)}</View>}
export function Stars(){return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({length:28},(_,i)=><View key={i} style={{position:'absolute',left:`${(i*37)%100}%`,top:`${(i*53)%45}%`,width:3,height:3,backgroundColor:colors.parchment,opacity:i%3===0?1:.5}}/>)}</View>}
export function Border(){return <Svg width="100%" height={12}><Path d={Array.from({length:40},(_,i)=>`M${i*12} 0h4v8h4V4h4v8h-12z`).join(' ')} fill={colors.gold} opacity={.8}/></Svg>}
export function HomeArt(){return <View style={{height:224,marginVertical:32}}><View style={{position:'absolute',left:24,top:56,opacity:.8}}><Island size={3}/></View><View style={{position:'absolute',right:16,top:24,opacity:.7}}><Island size={3} temple/></View><View style={{position:'absolute',bottom:40,left:'50%',marginLeft:-56}}><Ship size={7}/></View><Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 224" preserveAspectRatio="none"><Waves y={200}/><Waves y={224}/></Svg></View>}
// Islands zigzag up the map from the harbor at the bottom to Ithaca at the top.
const XS=[70,28,66,38];
function positionsFor(total:number){return Array.from({length:total},(_,i)=>({x:XS[i%4],y:total===1?40:78-i*(66/(total-1))}))}
export interface MapStage{order:number;title:string;cleared:boolean}
/**
 * total: real number of stages. stages: the ones this crew may see (fog hides the rest).
 * currentOrder: the stage being sailed for. shipAt: order of the island the ship is at, 0 for the harbor.
 */
export function VoyageMap({total,stages,currentOrder,shipAt,harbor}:{total:number;stages:MapStage[];currentOrder:number;shipAt:number;harbor:string}){
 const positions=positionsFor(total);
 const height=Math.max(540,150+total*95);
 const byOrder=new Map(stages.map(st=>[st.order,st]));
 const visible=positions.filter((_,i)=>byOrder.has(i+1));
 const boat=shipAt<=0?{x:50,y:93}:positions[Math.min(shipAt,total)-1];
 return <View style={[styles.map,{height}]}><LinearGradient colors={[colors['ocean-deep'],colors.ocean]} style={StyleSheet.absoluteFill}/><SeaLines/><Stars/><Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 540" preserveAspectRatio="none"><Waves y={124}/><Waves y={259}/><Waves y={394}/><Path d={'M200 502.2'+visible.map(p=>`L${p.x*4} ${p.y*5.4}`).join('')} stroke={colors.sand} strokeWidth={3} strokeDasharray="2 2" fill="none"/></Svg>{positions.map((p,i)=>{const st=byOrder.get(i+1);return <View key={i} style={{position:'absolute',left:`${p.x}%`,top:`${p.y}%`,width:128,marginLeft:-64,marginTop:-27,alignItems:'center'}}>{st===undefined?<Cloud large/>:<><Island temple={i===total-1}/><Text numberOfLines={2} style={[styles.label,!st.cleared&&st.order===currentOrder&&{backgroundColor:colors.gold,color:colors.ink}]}>{`${st.cleared?'✓ ':''}${st.title}`}</Text></>}</View>})}<View style={{position:'absolute',left:`${boat.x}%`,top:`${boat.y}%`,marginLeft:-24,marginTop:-28}}><Ship size={3}/></View><Text numberOfLines={1} style={[styles.label,{position:'absolute',bottom:30,alignSelf:'center',color:colors.sand}]}>{harbor}</Text></View>;
}
export function ArrivalArt(){return <View style={{height:240,overflow:'hidden'}}><Stars/><View style={{position:'absolute',top:48,left:'50%',marginLeft:-64}}><Island size={8} temple/></View><View style={{position:'absolute',bottom:24,left:32}}><Ship size={4}/></View><Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 240" preserveAspectRatio="none"><Waves y={232}/></Svg></View>}
const styles=StyleSheet.create({map:{height:540,margin:6,backgroundColor:colors['ocean-deep'],boxShadow:`0 0 0 3px ${colors.ink},0 0 0 6px ${colors['gold-dark']}`,overflow:'hidden'},label:{fontFamily:'PressStart2P_400Regular',fontSize:8,lineHeight:11,color:colors.parchment,backgroundColor:colors.ink+'b3',textAlign:'center',paddingHorizontal:4,marginTop:4},question:{position:'absolute',alignSelf:'center',top:28,fontFamily:'PressStart2P_400Regular',fontSize:14,color:colors['ocean-deep']}});
