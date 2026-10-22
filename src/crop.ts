import jpeg from 'jpeg-js';
import { decode as decodePng } from 'fast-png';
export function cropPoster(bytes:Uint8Array,mime:string,box:number[]){
 if(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n)||n<0||n>1000)||box[2]<=box[0]||box[3]<=box[1])throw new Error('Invalid crop');
 let width:number,height:number,data:Uint8Array;
 if(mime==='image/jpeg'){const img=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:5,maxMemoryUsageInMB:60});({width,height,data}=img);}
 else if(mime==='image/png'){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<24||v.getUint32(16)*v.getUint32(20)>5000000)throw new Error('Image too large');
  const img=decodePng(bytes);width=img.width;height=img.height;
  if(img.depth!==8||![3,4].includes(img.channels))throw new Error('Use a JPEG or RGB PNG poster');
  data=new Uint8Array(width*height*4);for(let i=0;i<width*height;i++){for(let k=0;k<3;k++)data[i*4+k]=img.data[i*img.channels+k];data[i*4+3]=img.channels===4?img.data[i*4+3]:255;}
 }else throw new Error('Use a JPEG or PNG screenshot');
 const x=Math.floor(box[0]*width/1000),y=Math.floor(box[1]*height/1000),right=Math.ceil(box[2]*width/1000),bottom=Math.ceil(box[3]*height/1000),w=right-x,h=bottom-y;
 if(w<100||h<100)throw new Error('Crop too small');
 const out=new Uint8Array(w*h*4);for(let row=0;row<h;row++)out.set(data.subarray(((y+row)*width+x)*4,((y+row)*width+right)*4),row*w*4);
 return jpeg.encode({width:w,height:h,data:out},88).data;
}
