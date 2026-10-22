export function listingArea(item: {area?:string;address?:string}):string {
 const explicit=(item.area||'').trim();
 if(explicit)return /^[A-I]\s*[-–]\s*\d{1,2}(?:\s*\/\s*[1-4])?$/i.test(explicit)?explicit.toUpperCase().replace(/\s/g,'').replace('–','-').split('/')[0]:explicit;
 const matches=(item.address||'').match(/\b[A-I]\s*[-–]\s*\d{1,2}(?:\s*\/\s*[1-4])?\b/gi)||[];
 const sectors=[...new Set(matches.map(s=>s.toUpperCase().replace(/\s/g,'').replace('–','-').split('/')[0]))];
 return sectors.length===1?sectors[0]:'';
}
