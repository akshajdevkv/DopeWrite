'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {PanelLeftClose,PanelLeftOpen} from 'lucide-react';

const preferenceKey='dopewrite.sidebar.collapsed';
export default function WorkspaceShell({children,className=''}:{children:ReactNode;className?:string}){
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem(preferenceKey)==='true')}catch{/* Storage may be unavailable in private browsers. */}},[]);
 function toggle(){
  const next=!collapsed;setCollapsed(next);
  try{localStorage.setItem(preferenceKey,String(next))}catch{/* The toggle still works without persistence. */}
 }
 return <div className={`shell ${className} ${collapsed?'sidebar-collapsed':''}`}>
  <button className="sidebar-collapse-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={toggle}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>
  {children}
 </div>;
}
