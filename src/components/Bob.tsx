import React,{useEffect,useState} from 'react';
import {AccessibilityInfo,Animated} from 'react-native';
/** Presentation-only movement; respects the device's reduced-motion preference. */
export function Bob({children}:{children:React.ReactNode}){
 const [y]=useState(()=>new Animated.Value(0));
 useEffect(()=>{let mounted=true;let loop:Animated.CompositeAnimation|undefined;const configure=(reduced:boolean)=>{loop?.stop();y.setValue(0);if(mounted&&!reduced){loop=Animated.loop(Animated.sequence([Animated.timing(y,{toValue:-3,duration:800,useNativeDriver:true}),Animated.timing(y,{toValue:0,duration:800,useNativeDriver:true})]));loop.start()}};AccessibilityInfo.isReduceMotionEnabled().then(configure);const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',configure);return()=>{mounted=false;sub.remove();loop?.stop()}},[y]);
 return <Animated.View style={{transform:[{translateY:y}]}}>{children}</Animated.View>;
}
