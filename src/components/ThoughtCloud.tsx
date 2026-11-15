import React,{useMemo,useState} from 'react';
import {LayoutChangeEvent,StyleSheet,View} from 'react-native';
import Svg,{Path} from 'react-native-svg';
import {T} from './ui';
import {colors} from './PixelSprite';
import {storyteller} from '../theme/copy';

const PIXEL=5;
type Point=[number,number];
type CloudPaths={white:string;black:string;width:number;height:number};
/** Rasterize the rounded reference silhouette onto a crisp, uniform pixel grid. */
function makeCloud(width:number,height:number):CloudPaths {
 const columns=Math.floor(width/PIXEL);
 const rows=Math.ceil(height/PIXEL);
 const w=(columns-2)*PIXEL,h=(rows-2)*PIXEL;
 const x=(fraction:number)=>w*fraction;
 let start:Point=[x(.16),34];
 const points:Point[]=[start];
 const curves:number[][]=[
  [x(.18),12,x(.31),9,x(.40),20],
  [x(.46),-4,x(.68),-2,x(.74),28],
  [x(.91),17,w,37,w,h*.53],
  [w,h-12,x(.87),h+1,x(.77),h-16],
  [x(.69),h+5,x(.50),h-1,x(.46),h-15],
  [x(.35),h+2,x(.22),h-2,x(.18),h-22],
  [x(.04),h-8,0,h-29,0,h*.60],
  [0,42,x(.08),30,x(.16),34],
 ];
 for(const [ax,ay,bx,by,cx,cy] of curves){
  for(let step=1;step<=24;step++){
   const t=step/24,u=1-t;
   points.push([u**3*start[0]+3*u*u*t*ax+3*u*t*t*bx+t**3*cx,
    u**3*start[1]+3*u*u*t*ay+3*u*t*t*by+t**3*cy]);
  }
  start=[cx,cy];
 }
 const grid=Array.from({length:rows+8},()=>Array<number>(columns).fill(0));
 for(let row=1;row<rows-1;row++){
  const cy=(row-.5)*PIXEL;
  const intersections:number[]=[];
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const [ax,ay]=points[j],[bx,by]=points[i];
   if((ay>cy)!==(by>cy))intersections.push(ax+(cy-ay)*(bx-ax)/(by-ay));
  }
  intersections.sort((a,b)=>a-b);
  for(let col=1;col<columns-1;col++){
   const cx=(col-.5)*PIXEL;
   for(let i=0;i+1<intersections.length;i+=2){
    if(cx>=intersections[i]&&cx<=intersections[i+1])grid[row][col]=1;
   }
  }
 }
 // Add one solid pixel of outline around the silhouette, leaving the text area empty.
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  if(grid[row][col]===0&&[grid[row-1]?.[col],grid[row+1]?.[col],grid[row][col-1],grid[row][col+1]].includes(1))grid[row][col]=2;
 }
 const dot=[[0,2,2,2,0],[2,1,1,1,2],[2,1,1,1,2],[2,1,1,1,2],[0,2,2,2,0]];
 const dotX=Math.floor(columns*.56)-2;
 dot.forEach((line,y)=>line.forEach((cell,x)=>{grid[rows+2+y][dotX+x]=cell}));
 let white='',black='';
 grid.forEach((line,y)=>line.forEach((cell,x)=>{
  if(!cell)return;
  const square=`M${x*PIXEL} ${y*PIXEL}h${PIXEL}v${PIXEL}h-${PIXEL}Z`;
  if(cell===1)white+=square;else black+=square;
 }));
 return {white,black,width:columns*PIXEL,height:(rows+8)*PIXEL};
}
export function ThoughtCloud({children}:{children:string}){
 const [size,setSize]=useState({width:0,height:0});
 const measure=(event:LayoutChangeEvent)=>{const {width,height}=event.nativeEvent.layout;setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height})};
 const cloud=useMemo(()=>size.width>0?makeCloud(size.width,size.height):null,[size]);
 return <View accessible accessibilityLabel={`${storyteller.conversation}: ${children}`} style={styles.wrapper}>
  {cloud&&<Svg pointerEvents="none" accessible={false} style={styles.svg} width={cloud.width} height={cloud.height} viewBox={`0 0 ${cloud.width} ${cloud.height}`}><Path d={cloud.white} fill="#fff"/><Path d={cloud.black} fill="#111"/></Svg>}
  <View onLayout={measure} style={styles.content}><T style={styles.text}>{children}</T></View>
  <View style={styles.tailSpace}/>
 </View>;
}
const styles=StyleSheet.create({wrapper:{width:'100%',alignItems:'center',position:'relative',marginBottom:12},svg:{position:'absolute',top:0},content:{width:'100%',minHeight:108,justifyContent:'center',alignItems:'center',paddingHorizontal:54,paddingVertical:42},text:{color:colors.ink,fontSize:17,lineHeight:26,textAlign:'center'},tailSpace:{height:42}});
