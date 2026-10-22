import React from 'react';
import {hydrateRoot} from 'react-dom/client';
import Noticeboard from './Noticeboard';
const snapshot=JSON.parse(document.getElementById('snapshot')!.textContent!);
hydrateRoot(document.getElementById('root')!,<Noticeboard initialItems={snapshot.items} initialStatus={snapshot.status} initialLoaded={true}/>);
