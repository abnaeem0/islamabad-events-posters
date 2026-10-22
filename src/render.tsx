import React from 'react';
import {renderToString} from 'react-dom/server';
import Noticeboard from './Noticeboard';
export function render(snapshot:any){return renderToString(<Noticeboard initialItems={snapshot.items} initialStatus={snapshot.status} initialLoaded={true}/>);}
