import React,{createContext,useContext,useState} from 'react';
import {c} from './theme/copy';
type Voyage={avatar:number;setAvatar:(v:number)=>void;joined:boolean;setJoined:(v:boolean)=>void;extra:boolean;setExtra:(v:boolean)=>void;prompt:string;setPrompt:(v:string)=>void;name:string;setName:(v:string)=>void;fog:boolean;setFog:(v:boolean)=>void;stage:number;setStage:(v:number)=>void};
const Context=createContext<Voyage|null>(null);
export function VoyageProvider({children}:{children:React.ReactNode}){const [avatar,setAvatar]=useState(0),[joined,setJoined]=useState(false),[extra,setExtra]=useState(false);const [prompt,setPrompt]=useState(c.example),[name,setName]=useState(''),[fog,setFog]=useState(false),[stage,setStage]=useState(0);return <Context.Provider value={{avatar,setAvatar,joined,setJoined,extra,setExtra,prompt,setPrompt,name,setName,fog,setFog,stage,setStage}}>{children}</Context.Provider>}
export function useVoyage(){const context=useContext(Context);if(!context)throw new Error('VoyageProvider missing');return context}
