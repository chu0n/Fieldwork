// This server exposes only the packaged app, never the working folder or imported data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function createAppServer(html){
  const body=Buffer.from(html);
  return createServer((request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{'Allow':'GET, HEAD'});response.end();return;}
    let pathname;try{pathname=new URL(request.url,'http://localhost').pathname;}catch{response.writeHead(400);response.end();return;}
    if(pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
    if(!['/','/index.html'].includes(pathname)){response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':body.length});
    response.end(request.method==='HEAD'?undefined:body);
  });
}
function privateAddress(ip){
  const parts=ip.split('.').map(Number);
  return parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(parts[0]===10||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31);
}
export function localAddresses(){return Object.entries(networkInterfaces()).flatMap(([name,addresses])=>(addresses||[]).filter(a=>a.family==='IPv4'&&!a.internal&&privateAddress(a.address)).map(a=>({name,address:a.address}))).sort((a,b)=>Number(/wi-?fi|wireless/i.test(b.name))-Number(/wi-?fi|wireless/i.test(a.name)));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  const choices=localAddresses(),host=get('--host')||choices[0]?.address||'127.0.0.1',port=Number(get('--port')??4175);
  if((host!=='127.0.0.1'&&!privateAddress(host))||!Number.isInteger(port)||port<0||port>65535)throw new Error('Use a private IPv4 / 127.0.0.1 and a valid port.');
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8'),server=createAppServer(html);
  server.on('error',error=>{console.error('Could not start: '+error.message);process.exitCode=1;});
  server.listen(port,host,()=>{
    const actualPort=server.address().port;
    console.log(`\nChu0n's Fieldwork — open on iPhone\n\nSafari address: http://${host}:${actualPort}/\n\nKeep this window open. PC and iPhone must use the same Wi-Fi.\nOnly the app HTML is served; imported data stays in each browser.\nCtrl+C stops the server.\n`);
    if(host==='127.0.0.1')console.log('No LAN address selected. This address works only on this PC. Connect to Wi-Fi and restart.');
    if(choices.length>1)console.log('If unreachable, use the Wi-Fi address with: node serve-iphone.mjs --host <IPv4>\nInterfaces: '+choices.map(c=>`${c.name}: ${c.address}`).join(', '));
  });
  process.once('SIGINT',()=>server.close(()=>process.exit(0)));
}
