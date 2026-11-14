import {View,Text,StyleSheet} from 'react-native';
import Svg,{Rect} from 'react-native-svg';
import {Bob} from './Bob';
import {c} from '../theme/copy';

// Original 33 × 18 sprite: stepped silhouette, four-tone shading, no smooth curves.
// Inspired by the limited palettes and tile art of classic Japanese console RPGs.
export const CLOUD_ROWS = [
 '...........ooooooo...............',
 '.........ooHHHHHHHoo.............',
 '........oHHHHHHHHHHHo............',
 '.......oHHHHHHHHHHHHHo...........',
 '....ooooHHHHHHHHHHHHHoooo........',
 '..ooHHHHHHHHHHHHHHHHHHHHHoo......',
 '.oHHHHHHHHHHHHHHHHHHHHHHHHHo.....',
 '.oHHHHHHHHHHHHHHHHHHHHHHHHHoooo..',
 'oHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHo.',
 'oHHHHHHHLLLLHHHHHHHHHHHHHHHHHHHo.',
 'oHHHHHLLLLLLLLHHHHHHHLLLLHHHHHHHo',
 'oLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo',
 '.oLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo.',
 '..ooSSLLLLLLLLLLLLLLLLLLLLLLLoo..',
 '....ooSSSSSSSSSSSSSSSSSSSSSoo....',
 '......ooooooooooooooooooooo......',
 '.........SS....SSSS....SS........',
 '...............SS................',
];
const palette:Record<string,string>={o:'#3b5276',H:'#f2f4dc',L:'#b9d6dc',S:'#7da1bc'};
export function PixelCloud({large=false}:{large?:boolean}){
 const scale=large?3:2;
 return <View accessible accessibilityLabel={c.fogDescription} style={{width:33*scale,height:18*scale,alignItems:'center',justifyContent:'center'}}><Bob><Svg width={33*scale} height={18*scale} viewBox="0 0 33 18">{CLOUD_ROWS.flatMap((row,y)=>[...row].map((ch,x)=>ch==='.'?null:<Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]}/>))}</Svg></Bob>{large&&<Text style={styles.question}>?</Text>}</View>;
}
const styles=StyleSheet.create({question:{position:'absolute',fontFamily:'PressStart2P_400Regular',fontSize:12,lineHeight:18,color:'#3b5276',top:20,textShadowColor:'#f2f4dc',textShadowOffset:{width:1,height:1},textShadowRadius:0}});
