// Carousel slides join one listing automatically only on a strict match: same account, same caption opening, near in time.
const assert=require('node:assert/strict'),{harness}=require('./harness.cjs');
const h=harness(),{run,context,rows}=h;run('withDataLock_(setupPipeline_)');
const caption='Join us this Saturday for a sunset pottery evening by the lake with tea and music';
let answer,n=0;context.geminiRequest_=()=>({text:JSON.stringify(answer)});
const item=(title,extra={})=>({listing_kind:'event',title,start_date:'2099-10-20',venue:'Lake View Park',source_account:'@clayhouse',confidence:'high',uncertain_fields:[],...extra});
function shot(id,events,{account='@clayhouse',cap=caption,name}={}){const f=h.file(id,[++n,n+1,n+2,n+3]);if(name)f.getName=()=>name;answer={events,post_account:account,caption_start:cap};context.f=f;run('processOneFile_(f)');run('withDataLock_(refreshEventViews_)');}
const group=id=>rows('Events').find(r=>r.original_image_file_id===id).group_id;
shot('s1',[item('Sunset Pottery Evening')]);
shot('s2',[item('Pottery evening details',{start_date:null})]);
shot('long',[item('Sunset pottery by the lake')]);
assert.equal(group('s2'),group('s1'),'Second slide joins');assert.equal(group('long'),group('s1'),'Caption screenshot joins');
assert.equal(rows('Events').find(r=>r.original_image_file_id==='s2').match_status,'companion');
shot('other-account',[item('Sunset Pottery Evening copy')],{account:'@someoneelse'});
assert.equal(rows('Events').find(r=>r.original_image_file_id==='other-account').match_status==='companion',false,'Different account is not auto-linked');
shot('other-caption',[item('Another class')],{cap:'Our new weekend batch of wheel throwing classes starts next month for beginners'});
assert.notEqual(group('other-caption'),group('s1'),'Different caption stays separate');
shot('late',[item('Late slide')],{name:'Screenshot_20261015_130405_late.jpg'});
assert.notEqual(rows('Events').find(r=>r.original_image_file_id==='late').match_status,'companion','Two hours later is not auto-linked');
shot('newdate',[item('Sunset Pottery Evening',{start_date:'2099-11-05'})]);
assert.notEqual(rows('Events').find(r=>r.original_image_file_id==='newdate').match_status,'companion','Different date is never auto-linked');
shot('short',[item('Short caption')],{cap:'Sunset pottery'});
assert.notEqual(rows('Events').find(r=>r.original_image_file_id==='short').match_status,'companion','Too few caption words');
shot('multi',[item('Pottery A'),item('Pottery B')]);
assert(rows('Events').filter(r=>r.original_image_file_id==='multi').every(r=>r.match_status!=='companion'),'A screenshot with several listings is not auto-linked');
console.log('PASS: carousel slides auto-link on same account + caption + time; different account, caption, time, date, short captions and multi-listing screenshots do not.');
