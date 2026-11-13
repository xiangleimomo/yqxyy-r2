const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor(name='div'){
    this.name=name; this.parentNode=null; this.children=[];this.attributes={};
    this.classNames=new Set();this.handlers={};this.style={};this.controls=true;
    this.classList={
      add:(...names)=>names.forEach(n=>this.classNames.add(n)),
      remove:(...names)=>names.forEach(n=>this.classNames.delete(n)),
      contains:name=>this.classNames.has(name),
      toggle:(name,on)=>{if(on)this.classNames.add(name);else this.classNames.delete(name);}
    };
  }
  get isConnected(){return this.isDocumentRoot || !!this.parentNode?.isConnected;}
  appendChild(node){
    if(node.parentNode){const i=node.parentNode.children.indexOf(node);node.parentNode.children.splice(i,1);}
    node.parentNode=this;this.children.push(node);
  }
  replaceWith(node){
    const parent=this.parentNode,i=parent.children.indexOf(this);
    parent.children[i]=node;node.parentNode=parent;this.parentNode=null;
  }
  remove(){
    if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null;}
  }
  addEventListener(name,callback){(this.handlers[name]||=[]).push(callback);}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
  matches(){return false;}
  closest(){return null;}
  querySelector(){return null;}
}
function fixture(agent='Mozilla/5.0 (Linux; Android 13) AppleWebKit YQXYYAndroid/1.1'){
  const body=new Node('body');body.isDocumentRoot=true;
  const html=new Node('html');html.isDocumentRoot=true;
  const win={navigator:{userAgent:agent,maxTouchPoints:3},location:{href:'https://yqxyy-r2.netlify.app/'},
    matchMedia:()=>({matches:true}),listeners:{},addEventListener(name,fn){(this.listeners[name]||=[]).push(fn);}};
  const doc={body,documentElement:html,fullscreenElement:null,createComment:name=>new Node(name),
    createElement:name=>new Node(name),addEventListener(){}};
  const container=new Node('container'),stage=new Node('stage'),player=new Node('video'),trigger=new Node('button');
  body.appendChild(container);container.appendChild(stage);stage.appendChild(player);stage.appendChild(trigger);
  vm.runInNewContext(fs.readFileSync('js/mobile-caption-fullscreen.js','utf8'),{window:win,document:doc});
  const api=win.SFCaptionFullscreen.attach({stage,player,trigger,showControls(){}});
  return {win,doc,container,stage,player,api};
}
test('installed Android app keeps HTML captions and requests native rotation',async()=>{
  const x=fixture();
  assert.equal(x.doc.documentElement.classList.contains('sf-android-app'),true);
  await x.api.toggle();
  assert.equal(x.stage.parentNode,x.doc.body);
  assert.equal(x.stage.classList.contains('subtitle-page-fullscreen'),true);
  assert.equal(x.player.controls,false);
  assert.equal(x.win.location.href,'yqxyy-app://fullscreen/enter');
  for(const listener of x.win.listeners['sf-android-back'])listener();
  assert.equal(x.stage.parentNode,x.container);
  assert.equal(x.win.location.href,'yqxyy-app://fullscreen/exit');
});
test('ordinary Android browser does not invoke installed-app rotation',async()=>{
  const x=fixture('Mozilla/5.0 (Linux; Android 13) Chrome/124.0 Mobile');
  await x.api.toggle();
  assert.equal(x.doc.documentElement.classList.contains('sf-android-app'),false);
  assert.equal(x.win.location.href,'https://yqxyy-r2.netlify.app/');
  await x.api.toggle();
});
test('Android native handler validates main-frame scheme and trusted origin',()=>{
  const java=fs.readFileSync('android/app/src/main/java/com/yqxyy/english/MainActivity.java','utf8');
  const css=fs.readFileSync('css/unified-player.css','utf8');
  assert.match(java,/request\.isForMainFrame\(\)/);
  assert.match(java,/isTrustedAppPage\(\)/);
  assert.match(java,/SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
  assert.match(java,/sf-android-back/);
  assert.match(css,/sf-android-app[\s\S]*sf-desktop-player-controls/);
  assert.match(css,/sf-android-app[\s\S]*video-caption/);
});
