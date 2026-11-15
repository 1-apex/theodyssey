import Svg,{Rect} from 'react-native-svg';
import pixels from '../../assets/sprites/lovable-pixels.json';
export const palette=pixels.palette;
export const colors=pixels.colors;
export {pixels};
export function PixelSprite({rows,size=4,title}:{rows:string[];size?:number;title?:string}){return <Svg viewBox={`0 0 ${rows[0].length} ${rows.length}`} width={rows[0].length*size} height={rows.length*size} accessibilityLabel={title} accessible={!!title}>{rows.flatMap((row,y)=>[...row].map((ch,x)=>ch==='.'?null:<Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={palette[ch as keyof typeof palette]??'transparent'}/>))}</Svg>}
