const N = 12; // spheres sent to the shader at once (nearest to the camera)
const S = 0.42; // spacing between days along the archive, in screen heights
const SPAN = 1900; // depth of a day walk in CSS px (from title to player)
const PERSP = 1100; // CSS perspective of the day stage, must match .stage in style.css
// "fly to an object" inside a day: the card comes forward, straightens and fills most of the screen
const FOCUS_Z = 140; // px in front of the camera plane where a focused card stops (the wall sits at -260)
const FOCUS_FILL_W = 0.82, // share of the screen width / free height the focused card may take
  FOCUS_FILL_H = 0.78;
const FOCUS_ZOOM_MAX = 2.2; // extra zoom with the wheel (PC) or double tap (phone)
const FOCUS_DOCK_PX = 190; // screen height kept free for the title and the dock
const DISSOLVE_SEC = 1.15, // a deleted day's sphere dissolving
  DISSOLVE_REDUCED_SEC = 0.35;
const DIVE_IN_SEC = 1.9,
  DIVE_OUT_SEC = 1.4,
  DIVE_REDUCED_SEC = 0.5;
// adaptive resolution: keep ~60 fps, never drop below a readable quality
const RES_CHECK_SEC = 1.5,
  RES_MIN = 0.58,
  RES_MAX = 0.9,
  SLOW_FRAME_MS = 24,
  FAST_FRAME_MS = 15;
// Per mood: [pulse speed, pulse size, tremor, edge sharpness, bob height, inner flow speed, inner warp]
export const KIND = {
  calm: [0.7, 0.04, 0, 2.3, 0.008, 0.6, 0.1],
  bright: [3.2, 0.07, 0.01, 2.0, 0.03, 1.3, 0.16],
  tense: [7, 0.035, 0.03, 4.2, 0, 2.7, 0.2],
  melancholy: [0.45, 0.03, 0, 1.8, 0.006, 0.35, 0.09],
  nebula: [0.3, 0.05, 0, 1.15, 0.012, 0.4, 0.14],
};
const FS = `precision highp float;
#define N ${N}
uniform vec2 uRes;
uniform float uT,uScroll,uZ,uSel,uPaper,uWarp,uSpd,uDepth,uInt,uBeat;
uniform vec4 uB[N],uM[N];
uniform vec3 uC[N],uC2[N],uC3[N];
uniform float uV[N],uD[N],uS[N],uG[N];
uniform vec3 uDrop;
uniform vec2 uLook;
uniform vec3 uS0,uS1,uS2,uTint,uTint2;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+7.1;a*=.5;}return v;}
vec3 pal(float k){return mix(mix(uS0,uS1,smoothstep(0.,.5,k)),uS2,smoothstep(.45,1.,k));}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p=p*2.02+3.1;a*=.5;}return v;}
float fbm3l(vec3 p){return .66*n3(p)+.34*n3(p*2.03+3.1);}
vec3 interior(vec2 p,float t,vec3 outC){
 vec3 rd=normalize(vec3(p,-1.2));
 rd.yz=rot(-uLook.y*.3)*rd.yz;
 rd.xz=rot(uLook.x*.45+t*.015)*rd.xz;
 vec3 ro=vec3(0.,0.,-uDepth*.6);
 float b=dot(ro,rd),c=dot(ro,ro)-1.;
 float th=-b+sqrt(max(b*b-c,0.));
 vec3 hp=ro+rd*th;
 float cg=clamp(dot(rd,hp),0.,1.),gr=1.-cg;
 vec3 q3=hp*1.05;q3.xz=rot(t*.018*uSpd)*q3.xz;
 vec3 wq=q3+(.5+uWarp*2.*uInt+uBeat*.3)*(vec3(fbm3l(q3*1.3+vec3(0.,t*.03*uSpd,0.)),fbm3l(q3*1.3+7.2),fbm3l(q3*1.3-5.4))-.5);
 float f=fbm3(wq*1.35);
 vec3 wc=pal(smoothstep(.28,.72,f));
 float band=sin(f*10.+fbm3l(wq*1.9+2.)*4.+t*.22*uSpd)*.5+.5;
 float sheen=(pow(band,9.)*.3+pow(band,36.)*.28)*(1.+uBeat*.8);
 float light=(.18+.82*pow(cg,1.7)+.1*(hp.y*.5+.5))*(1.+uBeat*.2);
 vec3 wall=wc*light;
 wall+=mix(wc,vec3(1.),.55)*sheen*light;
 float thin=smoothstep(.56,.8,fbm3l(wq*.85+3.3));
 wall=mix(wall,outC+wc*.12,thin*.32);
 vec3 film=.5+.5*cos(6.2831*(gr*1.15+vec3(0.,.33,.67))+t*.12);
 wall+=film*pow(gr,5.)*.2;
 wall=mix(wall,pal(.5)*.55+outC*.45,(1.-exp(-th*.3))*.22);
 return wall;
}
float bok(vec2 p,float sc,float t){vec2 g=p*sc+vec2(t*.012,t*.007);vec2 id=floor(g),f=fract(g)-.5;float r=h(id);vec2 o=vec2(h(id+1.7),h(id+9.2))-.5;float d=length(f-o*.6);float rad=.09+.12*r;return smoothstep(rad,rad*.3,d)*step(.62,r)*(.55+.45*sin(t*.5+r*40.));}
void main(){
 vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;float t=uT;
 float ang=uLook.x*.05*(1.-uZ);p=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*p;
 if(uZ>.995){
  vec3 oc=vec3(.02,.022,.04)+uTint*.04;
  if(uPaper>0.)oc=mix(oc,(vec3(.95,.915,.85)-.06*fbm(p*1.6))*.94,uPaper);
  vec3 iv=interior(p,t,oc);
  iv+=pal(.3)*exp(-dot(p,p)*3.)*.12*(1.-uPaper);
  iv+=uTint*(bok(p*(1.+uDepth*1.2)+3.1,7.,t)*.09+bok(p*(1.+uDepth*2.4)+7.7,3.5,t)*.08)*(1.-.6*uPaper);
  iv*=1.-.3*dot(p,p)*(1.-.5*uPaper);
  iv=mix((1.-exp(-iv*1.5))*.74,iv,uPaper);
  gl_FragColor=vec4(iv*(1.-.4*dot(p,p)*(1.-.45*uPaper)),1.);return;
 }
 vec2 pp=p*(1.-.32*uDepth);
 float wa=uZ*uWarp*uInt;
 vec2 q=pp;
 vec2 wv=wa>.001?wa*vec2(fbm(pp*2.2+vec2(0.,t*.05*uSpd))-.5,fbm(pp*2.2+vec2(5.2,-t*.04*uSpd))-.5)*2.:vec2(0.);
 vec3 L=vec3(0.);float A=0.,E=0.,ws=0.;
 // LiquidMerge: spheres with uG>0 are not drawn one by one but summed into one field, like drops of water:
 // where two come close their fields add up and a bridge forms; many in one place become one big drop
 vec3 MC=vec3(0.);float MF=0.,MV=0.;
 for(int i=0;i<N;i++){
  float fi=float(i);vec4 b=uB[i],m=uM[i];float sd=uS[i];float ph=sd*1.7;
  float zi=uD[i];float sc=1.4/(1.4+zi*1.3);
  vec2 c=vec2(b.x-uScroll-uLook.x*.2,b.y+b.w*sin(t*m.x*.6+ph)-uLook.y*.12)*sc;
  float r=b.z*sc*(1.+uInt*(m.y*sin(t*m.x+ph)+m.z*(n(vec2(t*9.,sd))-.5)*2.));
  float sel=step(abs(fi-uSel),.5);float k=uZ*sel;
  c=mix(c,vec2(0.),k);r*=1.+k*k*13.;
  float fade=(1.-uZ*(1.-sel))*uV[i];
  float blur=clamp(abs(zi-.1)*1.5,0.,.9)*(1.-k);
  vec2 qi=q+wv*sel;
  vec2 dv=(qi-c)/max(r,.001);
  // the falling drop of the entry ritual: stretched along its fall
  if(abs(fi-uDrop.x)<.5)dv*=vec2(1./uDrop.y,1./uDrop.z);
  float dl=length(dv);
  // skip pixels this blob provably cannot reach (same test as below, from an upper bound of w):
  // shape factor <=1.24 so d>=dl/1.24, edge factor >=1.05, size factor <=1.7  =>  w <= 1.7*exp(-.68*dl*dl)
  if(fade<=0.||1.7*exp(-.68*dl*dl)*fade<.004)continue;
  vec2 dir=dv/max(dl,1e-4);
  float an=atan(dir.y,dir.x);
  float cs=.55+min(m.x,7.)*.12;
  float shp=1.+(.085*sin(an*2.+sd*2.7+t*.31*cs)+.06*sin(an*3.+sd*5.1-t*.26*cs)+.035*sin(an*5.+sd*1.3+t*.47*cs)
   +.12*(n(dir*1.3+sd*3.7+vec2(t*.1*cs,-t*.075*cs))-.5))*smoothstep(0.,.35,dl);
  dv/=shp;float d=length(dv);
  float w=exp(-d*d*mix(m.w,1.05,blur))*(1.-.45*clamp(zi,0.,1.))*(1.+.3*(1.-zi)*(1.-k));
  if(w*fade<.004)continue;
  ws+=w*fade*(1.-k);
  float wsn=w+((fbm(dv*2.1+sd*7.3)-.5)*.2+(fbm(dv*6.3+sd*3.1)-.5)*.06)*(1.-blur*.7);
  float cr=smoothstep(.3,.46,wsn);
  float ai=mix((1.-exp(-w*1.4))*.5,1.,cr);
  ai=mix(ai,1.,k)*fade;
  float ei=cr*(1.-smoothstep(.46,.95,wsn))*(1.-k);
  float hh=sqrt(max(0.,1.-d*d));
  vec3 sp=vec3(dv,hh);sp.xz=rot(t*(.05+m.x*.03)+sd*1.3)*sp.xz;sp.yz=rot(.4+sd*.7)*sp.yz;
  vec3 s3=sp*1.45+sd*4.1;
  float f1=fbm3(s3+fbm3(s3*1.6+2.)*1.1);
  vec3 col=mix(mix(uC[i],uC2[i],smoothstep(.4,.62,f1)),uC3[i],smoothstep(.52,.72,fbm3(s3*1.25+9.)));
  vec3 nrm=normalize(vec3(dv,hh+.25));
  float lit=dot(nrm,normalize(vec3(-.45,.6,.65)))*.5+.5;
  col*=mix(.72+.58*lit,1.,max(k,blur*.6));
  if(sel>.5)col=mix(col,pal(clamp(fbm(qi*.8+vec2(t*.03*uSpd,-t*.02*uSpd))*1.5-.3,0.,1.)),uZ);
  col=mix(col,mix(col,uTint2,.35),clamp(zi,0.,1.)*.5);
  col*=1.-.2*ei;
  float g=uG[i],aj=ai*(1.-g);
  L=mix(L,col,aj);E=mix(E,ei,aj);A=A+aj*(1.-A);
  float wg=w*g;MF+=wg;MV+=wg*fade;MC+=col*wg;}
 if(MF>.003){
  float wsm=MF+(fbm(q*3.4+vec2(t*.02,0.))-.5)*.16*min(1.,MF*2.5);
  float crm=smoothstep(.3,.46,wsm);
  float aim=mix((1.-exp(-MF*1.4))*.5,1.,crm)*(MV/MF);
  float eim=crm*(1.-smoothstep(.46,.95,wsm));
  vec3 cm=MC/MF*(1.-.2*eim);
  L=mix(L,cm,aim);E=mix(E,eim,aim);A=A+aim*(1.-A);}
 vec3 col=L/max(A,1e-4);
 float gran=fbm(gl_FragCoord.xy*.5);
 float a=mix(A,1.,uZ);
 float edge=E*(1.-uZ);
 col*=.92+.16*gran;
 float haze=smoothstep(-.55,.55,p.y);
 vec3 base=mix(vec3(.014,.018,.042),vec3(.05,.055,.105),haze);
 base+=uTint*.11*smoothstep(.3,.9,fbm(p*1.3+vec2(t*.01,0.)))*(1.-haze*.5);
 base+=uTint2*.08*smoothstep(.4,.9,fbm(p*1.7+7.+vec2(0.,t*.008)));
 base+=uTint*.05*(1.-length(p-vec2(0.,-.55)));
 vec3 halo=col*(1.-exp(-ws*.35))*.13;
 base+=uTint*(bok(p*(1.+uDepth*.5)+vec2(uScroll*.3,0.),5.,t)*.12+bok(p*(1.+uDepth*1.1)+3.1+vec2(uScroll*.6,0.),8.,t)*.08)*(.35+.65*uZ);
 base+=uTint*(bok(p*(1.+uDepth*2.2)+7.7,3.,t)*.1)*uZ;
 vec3 dark=base+halo+col*a*.92+col*a*a*a*.2+(col*.7+.3)*edge*.22*(1.-uZ);
 dark*=1.-.5*uZ*(1.-.3*smoothstep(.6,0.,length(p)));
 vec3 o=dark,bgP=vec3(0.);
 if(uPaper>0.){ // paper look is computed only while the paper theme is (partly) on
  bgP=vec3(.95,.915,.85)-.06*fbm(p*1.6)-.05*fbm(p*4.)-.03*fbm(p*vec2(6.,40.));
  bgP=mix(bgP,bgP*(.72+.5*uTint),.55*smoothstep(1.3,0.,length(p-vec2(-.55,-.35))*1.15));
  bgP=mix(bgP,bgP*(.8+.4*uTint2),.35*smoothstep(1.2,0.,length(p-vec2(.65,.4))*1.2));
  // paper: a transparent watercolour wash, lighter pigment, slightly denser at the dried edge
  float lum=dot(col,vec3(.299,.587,.114));
  vec3 pc=min(mix(col,vec3(1.),.18+.32*(1.-smoothstep(.25,.7,lum)))*1.08,vec3(1.));
  vec3 paper=mix(bgP,pc,a*.7);
  paper*=mix(vec3(1.),pc,.16*a);
  paper=mix(paper,paper*.86,edge*(1.-uZ));
  paper+=(gran-.5)*.05*a;
  paper*=1.-.1*uZ;
  o=mix(dark,paper,uPaper);
 }
 o*=1.-.4*dot(p,p)*(1.-.45*uPaper);
 float R=pow(clamp((uZ-.22)/.78,0.,1.),1.25)*1.65,lp=length(p);
 float m=smoothstep(R+.22,R-.12,lp);
 if(uZ>.001&&m>.001){
  vec3 outC=mix(vec3(.02,.022,.04)+uTint*.04,bgP*.94,uPaper);
  vec3 inn=interior(p,t,outC);
  inn+=pal(.3)*exp(-dot(p,p)*3.)*.12*(1.-uPaper);
  inn+=uTint*(bok(p*(1.+uDepth*1.2)+3.1,7.,t)*.09+bok(p*(1.+uDepth*2.4)+7.7,3.5,t)*.08)*(1.-.6*uPaper);
  inn*=1.-.3*dot(p,p)*(1.-.5*uPaper);
  inn=mix((1.-exp(-inn*1.5))*.74,inn,uPaper);
  inn*=1.-.4*dot(p,p)*(1.-.45*uPaper);
  float ring=exp(-pow((lp-R)/.07,2.))*smoothstep(.15,.45,uZ)*(1.-uZ);
  o=mix(o,inn,m)+(pal(fract(lp*1.2+t*.08))*.5+.15)*ring*.18*(1.-.6*uPaper);
 }
 gl_FragColor=vec4(o,1.);}`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = x => x * x * (3 - 2 * x);
const easeIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const rgb = hex => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
/* MoodTone: the colour of a sphere speaks of its mood. The day's own colours (from its events and photos)
   stay recognisable, but each mood pulls them towards its tone:
     calm       — warm amber, softer saturation, gentle light
     bright     — juicier and lighter
     tense      — colder, towards blue, a little darker
     melancholy — towards violet, muted and dimmer */
const MOOD_TONE = {
  calm: { hue: 32, pull: 0.35, sat: 0.85, light: [0.56, 0.74] },
  bright: { hue: null, pull: 0, sat: 1.25, light: [0.6, 0.8] },
  tense: { hue: 222, pull: 0.4, sat: 1.0, light: [0.4, 0.62] },
  melancholy: { hue: 268, pull: 0.38, sat: 0.65, light: [0.42, 0.62] },
};
function toHsl([r, g, b]) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function toRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m];
}
function moodTone(c, kind) {
  const t = MOOD_TONE[kind];
  if (!t) return c;
  let [h, s, l] = toHsl(c);
  if (t.hue != null) {
    const dh = ((t.hue - h + 540) % 360) - 180; // the shorter way round the colour wheel
    h = (h + dh * t.pull + 360) % 360;
  }
  s = Math.min(0.95, s * t.sat);
  l = Math.max(t.light[0], Math.min(t.light[1], l));
  return toRgb([h, s, l]);
}
// the same tone as a #rrggbb string (month nebulae are mixed from their days' toned colours)
export function moodToneHex(hex, kind) {
  return (
    '#' +
    moodTone(rgb(hex), kind)
      .map(v =>
        Math.round(Math.max(0, Math.min(1, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const PHONE_W = 700, // narrower than this counts as a phone
  PHONE_SPHERE_SHRINK = 1.5, // spheres are this many times smaller there
  TOUCH_SWIPE_GAIN = 1.8, // a finger moves the archive and the day this much further than a mouse drag
  TOUCH_DEPTH_PX = 240; // finger travel (px) for the whole way through a day (420 with a mouse)
const MERGE_RATE = 2.2; // how fast spheres melt together or apart (per second)
// height and depth of a slot in the line of spheres (gentle waves, so the line never looks ruled)
function place(slot) {
  return {
    y: 0.09 * Math.sin(slot * 1.7) + 0.05 * Math.sin(slot * 0.6 + 1),
    zd: 0.35 * Math.sin(slot * 2.1 + 1.3) + 0.3 * Math.sin(slot * 0.73 + 0.4) + 0.25,
  };
}
// critically damped spring (smoothDamp)
function damp(s, target, time, dt) {
  const om = 2 / Math.max(0.0001, time),
    x = om * dt,
    e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = s.v - target,
    tmp = (s.vel + om * ch) * dt;
  s.vel = (s.vel - om * tmp) * e;
  s.v = target + (ch + tmp) * e;
  return s.v;
}
const spr = v => ({ v, vel: 0 });
// Writes a style only when its value changed (an unchanged transform costs nothing per frame).
const styleCache = new WeakMap();
function setStyle(el, prop, val) {
  let c = styleCache.get(el);
  if (!c) styleCache.set(el, (c = {}));
  if (c[prop] === val) return;
  c[prop] = val;
  el.style.setProperty(prop, val);
}

export class Engine {
  constructor(cv, o) {
    this.cv = cv;
    this.o = o;
    const gl = (this.gl = cv.getContext('webgl', {
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    }));
    const sh = (t, s) => {
      const x = gl.createShader(t);
      gl.shaderSource(x, s);
      gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x));
      return x;
    };
    const pr = (this.pr = gl.createProgram());
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, 'a');
    gl.enableVertexAttribArray(al);
    gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    this.loc = {};
    [
      'uRes',
      'uT',
      'uScroll',
      'uZ',
      'uSel',
      'uPaper',
      'uWarp',
      'uSpd',
      'uDepth',
      'uInt',
      'uBeat',
      'uB',
      'uM',
      'uC',
      'uC2',
      'uC3',
      'uV',
      'uD',
      'uS',
      'uG',
      'uDrop',
      'uLook',
      'uS0',
      'uS1',
      'uS2',
      'uTint',
      'uTint2',
    ].forEach(k => (this.loc[k] = gl.getUniformLocation(pr, k)));
    this.uB = new Float32Array(N * 4);
    this.uM = new Float32Array(N * 4);
    this.uC = new Float32Array(N * 3);
    this.uC2 = new Float32Array(N * 3);
    this.uC3 = new Float32Array(N * 3);
    this.uV = new Float32Array(N);
    this.uD = new Float32Array(N);
    this.uS = new Float32Array(N);
    this.uG = new Float32Array(N);
    this.mergeDays = false; // days melt together like drops (leaving or entering a month)
    this.drp = null; // the entry ritual's falling drop
    this.days = [];
    this.state = 'archive';
    this.selIdx = -1;
    this.win = 0;
    this.sc = spr(0);
    this.scrollT = 0;
    this.dp = spr(0);
    this.depthT = 0;
    this.lx = spr(0);
    this.ly = spr(0);
    this.lookT = [0, 0];
    this.zp = 0;
    this.zDir = 0;
    this.z = 0;
    this.paper = 0;
    this.paperT = 0;
    this.T = 0;
    this.hov = -1;
    this.hv = new Float32Array(1000);
    this.labelK = 1; // dates under the spheres fade in and out as a whole
    this.labelT = 1;
    this.scrollTime = 0; // a longer glide for the scroll when set (seconds)
    // a live pinch: 0 = the month as it is, 1 = all its days pulled into one nebula
    this.pull = 0;
    this.pullLive = false;
    this.pullAt = null; // where a pinch pulls the days: {x, y, zd}
    this.tint = [1, 0.76, 0.5];
    this.tint2 = [0.9, 0.55, 0.4];
    this.items = [];
    this.labels = [];
    this.fItem = null; // focused card (or null)
    this.fOn = false; // true while flying to / looking at it, false while flying back
    this.fk = spr(0); // 0 = normal walk, 1 = card in front of the camera
    this.fzm = spr(1); // extra zoom of the focused card
    this.fZoom = 1;
    this.filter = null;
    this.vis = [];
    this.world = document.getElementById('world');
    this.rs = 0.7;
    this.ft = 16;
    this.last = 0;
    this._input();
    this.resize();
    addEventListener('resize', () => this.resize());
    requestAnimationFrame(t => this.frame(t));
  }
  get scroll() {
    return this.sc.v;
  }
  set scroll(v) {
    this.sc.v = v;
    this.sc.vel = 0;
  }
  get depth() {
    return this.dp.v;
  }
  get look() {
    return [this.lx.v, this.ly.v];
  }
  resize() {
    this.W = innerWidth;
    this.H = innerHeight;
    // on a phone the spheres are measured against a tall screen and look huge: draw them smaller
    const k = this.W < PHONE_W ? 1 / PHONE_SPHERE_SHRINK : 1;
    if (this.base && this.sizeK && k !== this.sizeK) this.base.forEach(b => (b.r *= k / this.sizeK));
    this.sizeK = k;
    const d = Math.min(1.5, devicePixelRatio || 1) * this.rs;
    this.cv.width = Math.max(2, Math.round(this.W * d));
    this.cv.height = Math.max(2, Math.round(this.H * d));
  }
  setPaper(v) {
    this.paperT = v ? 1 : 0;
  }
  get TOT() {
    // the last slot: days are one slot each, months group several spheres into one slot
    const last = this.base && this.base.length ? Math.max(...this.base.map(b => b.slot)) : 0;
    return Math.max(0.001, last * S);
  }
  // index of the sphere whose slot is nearest to a scroll position
  _idxAt(sc) {
    let best = 0,
      bd = 1e9;
    (this.base || []).forEach((b, i) => {
      const d = Math.abs(b.slot * S - sc);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  // where a day's sphere is on screen right now (for the entry ritual)
  screenOf(id) {
    const i = this.days.findIndex(d => d.id === id);
    if (i < 0) return null;
    const b = this.base[i];
    const [x, y, r] = this._proj(b.x, b.y, b.r * b.rsc, b.zd);
    return { x, y, r };
  }
  // every sphere flows into one point and melts there (leaving a month); by default the screen's centre
  // rs: the size they keep there (0 = melt away completely)
  gather(pred, at, rs = 0) {
    const p = at || { x: this.scroll, y: 0, zd: 0.3 };
    for (const [i, b] of (this.base || []).entries()) {
      if (pred && !pred(this.days[i])) continue;
      b.tx = p.x;
      b.ty = p.y;
      b.tzd = p.zd;
      b.rsT = rs;
    }
  }
  // days melt together like drops of water (on), or become separate spheres again (off), smoothly
  setMerge(on) {
    this.mergeDays = on;
    (this.base || []).forEach((b, i) => {
      if (!this.days[i].nebula) b.gT = on ? 1 : 0;
    });
  }
  /* Entry ritual, part one: the day's own sphere pulls into a drop and falls to the water line, stretching
     with its speed (screen coordinates: to = {x, y, r}). Resolves when it touches the water. */
  drop(id, to, dur) {
    const i = this.days.findIndex(d => d.id === id);
    if (i < 0) return Promise.resolve();
    const b = this.base[i];
    const [x, y, r] = this._proj(b.x, b.y, b.r * b.rsc, b.zd);
    return new Promise(done => (this.drp = { i, t: 0, dur, from: { x, y, r }, to, done, sx: 1, sy: 1, now: { x, y, r, speed: 0 } }));
  }
  dropScreen() {
    return this.drp ? this.drp.now : null;
  }
  _dropStep(dt) {
    const p = this.drp,
      b = this.base[p.i];
    if (!b) return (this.drp = null);
    p.t += dt;
    const k = Math.min(1, p.t / p.dur),
      ez = v => (v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2),
      // pull into a drop quickly, then fall the whole way with gravity (k² = constant acceleration)
      shrink = ez(clamp(k / 0.3, 0, 1)),
      fall = clamp((k - 0.1) / 0.9, 0, 1),
      sx = p.from.x + (p.to.x - p.from.x) * ez(clamp(k / 0.5, 0, 1)),
      sy = p.from.y + (p.to.y - p.from.y) * fall * fall,
      sr = p.from.r + (p.to.r - p.from.r) * shrink;
    p.now = { x: sx, y: sy, r: sr, speed: fall };
    p.sx = 1 - 0.22 * fall;
    p.sy = 1 + 0.55 * fall;
    // screen -> world, at the sphere's own depth
    const sc = 1.4 / (1.4 + b.zd * 1.3),
      [lx, ly] = this.look;
    b.x = (sx - this.W / 2) / (sc * this.H) + this.scroll + lx * 0.2;
    b.y = (this.H / 2 - sy) / (sc * this.H) + ly * 0.12;
    b.dropR = sr / (sc * this.H);
    if (k >= 1) {
      this.drp = null;
      b.dropR = null;
      p.done();
    }
  }
  // the height and depth a slot gets in the line of spheres
  place(slot) {
    return place(slot);
  }

  setDays(days, keepId, opts = {}) {
    const selId = this.selIdx >= 0 && this.days[this.selIdx] ? this.days[this.selIdx].id : null;
    const was = new Map((this.base || []).map((b, i) => [this.days[i] && this.days[i].id, b]));
    // hover glow, visibility and the hovered sphere are kept per sphere, not per place in the list:
    // the list is re-sorted here, and a value left at an index would jump to another sphere
    const oldIds = this.days.map(d => d.id),
      hvOf = new Map(oldIds.map((id, i) => [id, this.hv[i]])),
      vvOf = new Map(oldIds.map((id, i) => [id, this.vv && this.vv[i]])),
      hovId = this.hov >= 0 ? oldIds[this.hov] : null;
    this.days = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    // opts.scrollTo: index (in the new sorted list) to centre the camera on; spawned spheres can start there
    const scTo =
      opts.scrollSlot != null
        ? opts.scrollSlot * S
        : opts.scrollTo != null && this.days[opts.scrollTo]
          ? (this.days[opts.scrollTo].slot != null ? this.days[opts.scrollTo].slot : opts.scrollTo) * S
          : null;
    const shift = scTo != null && opts.keepScreen ? scTo - this.scroll : 0;
    this.labels.forEach(l => l.remove());
    this.labels = [];
    const box = document.getElementById('labels');
    const M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    this.base = this.days.map((d, i) => {
      const k = KIND[d.mood.kind] || KIND.calm,
        col = d.mood.colors.map(c => moodTone(rgb(c), d.mood.kind));
      const e = document.createElement('div');
      e.className = 'blab';
      e.textContent =
        d.label != null ? d.label : +d.date.slice(8) + ' ' + M[+d.date.slice(5, 7) - 1] + ' ' + d.date.slice(0, 4);
      e._d = e.textContent;
      if (d.noLabel) e.style.display = 'none';
      box.appendChild(e);
      this.labels.push(e);
      const seed = ([...d.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7) / 9973) * 40;
      // a sphere sits in a slot (one per day, or one per month for the spheres of a nebula) plus an offset
      const slot = d.slot != null ? d.slot : i,
        tx = (d.at ? d.at.x : slot * S) + (d.dx || 0),
        // d.at: an exact place (where a month gathers), otherwise the slot's own height and depth
        tzd = (d.at ? d.at.zd : place(slot).zd) + (d.dz || 0),
        ty = (d.at ? d.at.y : place(slot).y) + (d.dy || 0),
        old = was.get(d.id),
        sp = !old && opts.spawn;
      // d.keep: stay exactly where it is on screen (a sphere that only melts away)
      const keep = d.keep && old;
      return {
        seed,
        slot,
        tx: keep ? old.x + shift : tx,
        ty: keep ? old.y : ty,
        tzd: keep ? old.zd : tzd,
        x: old ? old.x + shift : sp ? (sp.atScroll ? (scTo != null ? scTo : this.scroll) : tx) : tx,
        zd: old ? old.zd : sp ? (sp.zd != null ? sp.zd : tzd) : tzd,
        y: old ? old.y : sp ? (sp.y != null ? sp.y : ty) : ty,
        rsc: old ? old.rsc : sp && sp.rs != null ? sp.rs : 1,
        // a "ghost" melts away (a nebula giving way to its days); spawned spheres may start one after another
        rsT: d.ghost ? 0 : 1,
        wait: old ? old.wait || 0 : d.wait != null ? d.wait : sp && sp.stagger ? i * sp.stagger : 0,
        r: (0.2 + 0.015 * (d.mood.kind === 'bright' ? 1 : 0) + (d.pinned ? 0.03 : 0)) * (d.rs || 1) * (this.sizeK || 1),
        k,
        c1: col[0],
        c2: col[1] || col[0],
        c3: col[2] || col[0],
        role: d.pullRole || '', // 'day' is pulled in by a pinch, 'neb' grows with it
        // LiquidMerge: a month's nebula is always one liquid drop; days only while they gather or split
        gT: d.nebula || this.mergeDays ? 1 : 0,
        g: old ? old.g : d.nebula || this.mergeDays ? 1 : 0,
      };
    });
    this.days.forEach((d, i) => {
      this.hv[i] = hvOf.get(d.id) || 0;
      if (this.vv) this.vv[i] = vvOf.get(d.id);
    });
    if (this.vv) this.vv.length = this.days.length;
    this.hov = hovId ? this.days.findIndex(d => d.id === hovId) : -1;
    this.setFilter(this.filter);
    if (selId) this.selIdx = this.days.findIndex(d => d.id === selId);
    if (scTo != null) this.scroll = this.scrollT = scTo;
    if (keepId) {
      const i = this.days.findIndex(d => d.id === keepId);
      if (i >= 0) {
        this.scrollT = this.base[i].slot * S;
        if (opts.scroll == null) this.scroll = this.scrollT;
      }
    }
    // only the target is clamped: if the last day was removed, the camera glides back instead of jumping
    this.scrollT = clamp(this.scrollT, 0, this.TOT);
    if (this.dying && !this.days.some(d => d.id === this.dying.id)) this.dying = null;
  }
  // deleting a day: its sphere swells a little, shrinks and fades; onDone fires when it is gone
  dissolve(id, onDone) {
    const i = this.days.findIndex(d => d.id === id);
    if (i < 0) return onDone && onDone();
    const reduce = this.o.settings().reduce;
    this.dying = { id, t: 0, dur: reduce ? DISSOLVE_REDUCED_SEC : DISSOLVE_SEC, onDone };
    const b = this.base[i];
    const [x, y, pr] = this._proj(b.x, b.y, b.r, b.zd);
    this.o.onDissolve && this.o.onDissolve({ x, y, r: pr, colors: this.days[i].mood.colors.map(c => moodToneHex(c, this.days[i].mood.kind)), reduce });
  }
  _life(i) {
    const dy = this.dying;
    // 0 = alive, 1 = fully dissolved
    if (!dy || !this.days[i] || this.days[i].id !== dy.id) return 0;
    return clamp(dy.t / dy.dur, 0, 1);
  }
  setFilter(fn) {
    this.filter = fn;
    this.vis = this.days.map(d => (!fn || fn(d) ? 1 : 0.1));
  }
  // dates under the spheres: show or hide them all, smoothly
  showLabels(on) {
    this.labelT = on ? 1 : 0;
    if (!on) this.labelK = 0;
  }
  goTo(i) {
    const b = this.base && this.base[clamp(i, 0, this.days.length - 1)];
    this.scrollT = b ? b.slot * S : 0;
  }
  setScroll01(f) {
    if (this.state === 'archive') this.scrollT = clamp(f, 0, 1) * this.TOT;
  }
  setDepth(f) {
    if (this.state === 'day') this.depthT = clamp(f, 0, 1);
  }
  setItems(list) {
    this.items = list;
    this.fItem = null;
    this.fOn = false;
    this.fk.v = this.fk.vel = 0;
    const coarse = matchMedia('(pointer: coarse)').matches;
    for (const o of list) {
      if (!o.pin) continue; // photos and notes can be looked at closely
      o.focusable = o.interactive = true;
      let down = null,
        lastTap = 0;
      o.el.addEventListener('pointerdown', e => {
        down = { x: e.clientX, y: e.clientY };
      });
      o.el.addEventListener('pointerup', e => {
        if (!down) return;
        const dx = e.clientX - down.x,
          dy = e.clientY - down.y;
        down = null;
        if (e.target.closest && e.target.closest('button')) return; // e.g. "read aloud" on a note
        const looking = this.fOn && this.fItem === o;
        if (Math.hypot(dx, dy) > 10) {
          if (looking && dy > 50) this.unfocus(); // swipe down puts the card back
          return;
        }
        if (!looking) return this.focus(o);
        if (!coarse) return this.unfocus(); // PC: click the card again to put it back
        const now = performance.now(); // phone: double tap zooms in and out
        if (now - lastTap < 320) {
          this.fZoom = this.fZoom > 1.2 ? 1 : 1.8;
          lastTap = 0;
        } else lastTap = now;
      });
    }
  }
  get focused() {
    return this.fOn;
  }
  focus(o) {
    if (this.state !== 'day' || !o || !o.focusable) return;
    if (this.fItem && this.fItem !== o) this.fItem.el.classList.remove('focus');
    this.fItem = o;
    this.fOn = true;
    this.fZoom = 1;
    o.el.classList.add('focus');
    this.o.onFocus && this.o.onFocus(true);
  }
  unfocus() {
    if (!this.fOn) return;
    this.fOn = false;
    this.fZoom = 1;
    this.o.onFocus && this.o.onFocus(false);
  }

  open(day) {
    const i = this.days.findIndex(d => d.id === day.id);
    if (i < 0) return;
    this.selIdx = i;
    this.zDir = 1;
    this.state = 'diving';
    this.scrollT = i * S;
    this.dp.v = 0;
    this.dp.vel = 0;
    this.depthT = 0;
    this.o.onState('diving');
  }
  close() {
    if (this.state !== 'day' && this.state !== 'diving') return;
    this.unfocus();
    this.zDir = -1;
    this.state = 'leaving';
    this.depthT = 0;
    this.o.onState('leaving');
  }

  _winStart() {
    return clamp(this._idxAt(this.scroll) - 5, 0, Math.max(0, this.days.length - N));
  }
  _proj(x, y, r, zd) {
    const sc = 1.4 / (1.4 + zd * 1.3),
      H = this.H,
      W = this.W,
      [lx, ly] = this.look;
    return [(x - this.scroll - lx * 0.2) * sc * H + W / 2, H / 2 - (y - ly * 0.12) * sc * H, r * sc * H, sc];
  }
  _pos(k) {
    return this._proj(this.uB[k * 4], this.uB[k * 4 + 1], this.uB[k * 4 + 2], this.uD[k]);
  }
  _pick(x, y) {
    let b = -1,
      bz = 1e9;
    for (let k = 0; k < N; k++) {
      if (this.uV[k] < 0.5) continue;
      const [px, py, r] = this._pos(k),
        d = Math.hypot(x - px, y - py);
      if (d < r * 0.9 && this.uD[k] < bz) {
        bz = this.uD[k];
        b = k;
      }
    }
    return b < 0 || !this.order ? -1 : this.order[b];
  }

  _input() {
    const cv = this.cv;
    let drag = null,
      moved = false;
    const pts = new Map();
    let pinch0 = 0;
    const spread = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const endPinch = id => {
      pts.delete(id);
      if (pinch0 && pts.size < 2) {
        pinch0 = 0;
        this.o.onPinchEnd && this.o.onPinchEnd();
      }
    };
    cv.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && this.state === 'archive' && this.o.onPinch) {
        // two fingers: no scrolling and no tap while pinching
        pinch0 = spread();
        drag = null;
        moved = true;
        this.o.onPinchStart && this.o.onPinchStart();
        return;
      }
      if (pts.size > 1) return;
      drag = { x: e.clientX, y: e.clientY, s: this.scrollT, d: this.depthT, touch: e.pointerType === 'touch' };
      moved = false;
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = 'grabbing';
    });
    addEventListener('pointermove', e => {
      this.lookT = [(e.clientX / this.W - 0.5) * 2, (e.clientY / this.H - 0.5) * 2];
    });
    cv.addEventListener('pointermove', e => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch0 && pts.size === 2) {
        // fingers moving together: 0 at the start, 1 when the spread has shrunk to 55 %
        this.o.onPinch(clamp((pinch0 - spread()) / (pinch0 * 0.45), 0, 1), true);
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (this.state === 'day' && !this.fOn) this.depthT = clamp(drag.d - dy / (drag.touch ? TOUCH_DEPTH_PX : 420), 0, 1);
        else if (this.state === 'archive')
          this.scrollT = clamp(drag.s - (dx / this.H) * 1.1 * (drag.touch ? TOUCH_SWIPE_GAIN : 1), 0, this.TOT);
      } else if (this.state === 'archive') {
        const i = this._pick(e.clientX, e.clientY);
        if (i !== this.hov) {
          this.hov = i;
          this.o.onHover && this.o.onHover(i >= 0 ? this.days[i] : null);
        }
        cv.style.cursor = i >= 0 ? 'pointer' : 'grab';
      }
    });
    cv.addEventListener('pointercancel', e => endPinch(e.pointerId));
    cv.addEventListener('pointerup', e => {
      const wasPinch = !!pinch0;
      endPinch(e.pointerId);
      if (wasPinch || pts.size) {
        drag = null;
        return;
      }
      // looking at a card: a tap on the background or a swipe down puts it back
      if (drag && this.state === 'day' && this.fOn && (!moved || e.clientY - drag.y > 50)) this.unfocus();
      if (drag && !moved && this.state === 'archive') {
        const i = this._pick(e.clientX, e.clientY);
        if (i >= 0) this.o.onOpen(this.days[i]);
      }
      drag = null;
      cv.style.cursor = 'grab';
    });
    addEventListener(
      'wheel',
      e => {
        if (e.target.closest && e.target.closest('.sheet,.modal,.menu')) return;
        e.preventDefault();
        const dl = (e.deltaMode === 1 ? 16 : 1) * (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
        // ctrl + wheel (and a touchpad pinch) zooms out of a month instead of scrolling
        if (e.ctrlKey && this.state === 'archive' && this.o.onPinch) return this.o.onPinch(dl, false);
        if (this.state === 'day' && this.fOn) {
          // wheel zooms the focused card; zooming out past its normal size puts it back
          if (dl > 0 && this.fZoom <= 1.001) this.unfocus();
          else this.fZoom = clamp(this.fZoom * (dl < 0 ? 1.08 : 0.92), 1, FOCUS_ZOOM_MAX);
        } else if (this.state === 'day') this.depthT = clamp(this.depthT + dl * 0.00075, 0, 1);
        else if (this.state === 'archive') this.scrollT = clamp(this.scrollT + dl * 0.0019, 0, this.TOT);
      },
      { passive: false },
    );
    addEventListener('keydown', e => {
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const k = e.key;
      if (this.state === 'day') {
        if (this.fOn && /^Arrow/.test(k)) this.unfocus();
        if (k === 'ArrowDown' || k === 'ArrowRight') this.depthT = clamp(this.depthT + 0.1, 0, 1);
        if (k === 'ArrowUp' || k === 'ArrowLeft') this.depthT = clamp(this.depthT - 0.1, 0, 1);
      } else if (this.state === 'archive') {
        if (k === 'ArrowRight') this.scrollT = clamp(this.scrollT + S, 0, this.TOT);
        if (k === 'ArrowLeft') this.scrollT = clamp(this.scrollT - S, 0, this.TOT);
        if (k === 'Enter' && this.days.length) this.o.onOpen(this.days[this._idxAt(this.scroll)]);
      }
    });
  }

  // performance options from the settings: a lower ceiling for the background's resolution, 30 fps
  setPerf({ resMax = RES_MAX, fps30 = false } = {}) {
    this.perf = { resMax, fps30 };
    if (this.rs > resMax) {
      this.rs = resMax;
      this.resize();
    }
  }
  _adapt(dt) {
    this.ft = this.ft * 0.95 + dt * 1000 * 0.05;
    if (!this._at) this._at = 0;
    this._at += dt;
    if (this._at < RES_CHECK_SEC) return;
    this._at = 0;
    const old = this.rs;
    if (document.hidden || this.state === 'diving' || this.state === 'leaving') return;
    if (this.ft > SLOW_FRAME_MS && this.rs > RES_MIN) this.rs = Math.max(RES_MIN, this.rs - 0.07);
    else if (this.ft < FAST_FRAME_MS && this.rs < (this.perf ? this.perf.resMax : RES_MAX))
      this.rs = Math.min(this.perf ? this.perf.resMax : RES_MAX, this.rs + 0.05);
    if (old !== this.rs) this.resize();
  }

  frame(ts) {
    // 30 fps option: skip every other frame (the clock keeps real time, so motion speed is unchanged)
    if (this.perf && this.perf.fps30 && ts - (this._drawn || 0) < 30) {
      requestAnimationFrame(t => this.frame(t));
      return;
    }
    this._drawn = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000 || 0.016);
    this.last = ts;
    this._adapt(dt);
    const set = this.o.settings(),
      sp = set.reduce ? 0.12 : set.speed,
      it = set.reduce ? 0.4 : set.intensity,
      rm = set.reduce;
    this.T += dt * sp;
    damp(this.sc, this.scrollT, rm ? 0.12 : this.scrollTime || 0.42, dt);
    this.labelK += (this.labelT - this.labelK) * Math.min(1, dt * 3);
    damp(this.dp, this.depthT, rm ? 0.15 : 0.55, dt);
    damp(this.lx, rm ? 0 : this.lookT[0], 0.75, dt);
    damp(this.ly, rm ? 0 : this.lookT[1], 0.75, dt);
    this.paper += (this.paperT - this.paper) * Math.min(1, dt * 2.5);
    if (this.base) {
      const g = Math.min(1, dt * (rm ? 12 : 2.6)),
        pk = this.pull,
        // under the fingers the spheres follow quickly; letting go, they ease back
        gp = Math.min(1, dt * (this.pullLive ? 12 : 5));
      for (const b of this.base) {
        if (b.wait > 0) {
          b.wait -= dt;
          continue;
        }
        if (b.role === 'day') {
          const k = pk * pk * (3 - 2 * pk),
            at = this.pullAt || { x: this.scroll, y: 0, zd: 0.3 };
          b.x += (b.tx + (at.x - b.tx) * k - b.x) * gp;
          b.y += (b.ty + (at.y - b.ty) * k - b.y) * gp;
          b.zd += (b.tzd + (at.zd - b.tzd) * k - b.zd) * gp;
          b.rsc += (b.rsT * (1 - 0.8 * k) - b.rsc) * gp;
          continue;
        }
        if (b.role === 'neb') {
          b.x += (b.tx - b.x) * g;
          b.y += (b.ty - b.y) * g;
          b.zd += (b.tzd - b.zd) * g;
          b.rsc += (b.rsT * Math.max(0, pk - 0.15) * 1.18 - b.rsc) * gp;
          continue;
        }
        b.x += (b.tx - b.x) * g;
        b.y += (b.ty - b.y) * g;
        b.zd += (b.tzd - b.zd) * g;
        b.rsc += (b.rsT - b.rsc) * g;
      }
      for (const b of this.base) b.g += (b.gT - b.g) * Math.min(1, dt * MERGE_RATE);
      if (this.drp) this._dropStep(dt);
    }
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur + 0.05) {
        const done = this.dying.onDone;
        this.dying.t = this.dying.dur; // stay invisible until the day is really removed
        this.dying.onDone = null;
        if (done) done();
      }
    }
    // land exactly on 0 or 1 so the shader can skip the unused theme entirely
    if (Math.abs(this.paperT - this.paper) < 0.002) this.paper = this.paperT;
    if (this.zDir) {
      this.zp = clamp(
        this.zp + (this.zDir * dt) / (rm ? DIVE_REDUCED_SEC : this.zDir > 0 ? DIVE_IN_SEC : DIVE_OUT_SEC),
        0,
        1,
      );
      this.z = easeIO(this.zp);
      if (this.zDir > 0 && this.zp >= 1) {
        this.zDir = 0;
        this.state = 'day';
        this.o.onState('day');
      }
      if (this.zDir < 0 && this.zp <= 0) {
        this.zDir = 0;
        this.state = 'archive';
        this.selIdx = -1;
        this.o.onState('archive');
      }
    }
    if (this.state === 'archive') this.win = this._winStart();
    const n = this.days.length,
      zz = this.z;
    const idx = [];
    for (let k = 0; k < N; k++) if (this.base && this.base[this.win + k]) idx.push(this.win + k);
    if (this.selIdx >= 0 && !idx.includes(this.selIdx) && this.base[this.selIdx]) {
      idx.shift();
      idx.push(this.selIdx);
    }
    idx.sort((a, b) => (a === this.selIdx) - (b === this.selIdx) || this.base[b].zd - this.base[a].zd);
    this.order = idx;
    const sel = this.selIdx >= 0 ? idx.indexOf(this.selIdx) : -1;
    if (!this.vv) this.vv = [];
    for (let k = 0; k < N; k++) {
      const i = idx[k],
        b = i !== undefined && this.base[i];
      if (!b) {
        this.uB[k * 4 + 2] = 0.01;
        this.uV[k] = 0;
        this.uG[k] = 0;
        continue;
      }
      this.hv[i] += ((i === this.hov && this.state === 'archive' ? 1 : 0) - this.hv[i]) * Math.min(1, dt * 7);
      this.uD[k] = b.zd;
      this.uS[k] = b.seed;
      this.uB[k * 4] = b.x;
      this.uB[k * 4 + 1] = b.y;
      const dk = this._life(i),
        dsz = dk ? (1 + 0.18 * Math.sin(Math.PI * Math.min(1, dk * 1.6))) * (1 - dk * dk) : 1;
      this.uB[k * 4 + 2] = b.dropR != null ? b.dropR : b.r * b.rsc * (1 + 0.1 * sm(this.hv[i])) * dsz;
      this.uB[k * 4 + 3] = b.dropR != null ? 0 : b.k[4];
      this.uG[k] = b.g;
      this.uM[k * 4] = b.k[0];
      this.uM[k * 4 + 1] = b.k[1];
      this.uM[k * 4 + 2] = b.k[2];
      this.uM[k * 4 + 3] = b.k[3];
      this.uC.set(b.c1, k * 3);
      this.uC2.set(b.c2, k * 3);
      this.uC3.set(b.c3, k * 3);
      const vt = this.vis[i] ?? 1;
      this.vv[i] = this.vv[i] === undefined ? vt : this.vv[i] + (vt - this.vv[i]) * Math.min(1, dt * 5);
      this.uV[k] = this.vv[i] * (dk ? 1 - Math.pow(dk, 1.4) : 1);
    }
    this.masks = idx.map((i, k) => {
      const b = this.base[i],
        blur = clamp(Math.abs(b.zd - 0.1) * 1.5, 0, 0.9);
      const bob = b.k[4] * Math.sin(this.T * b.k[0] * 0.6 + b.seed * 1.7);
      const [x, y, pr] = this._proj(b.x, b.y + bob, b.r * b.rsc * (1 + 0.1 * sm(this.hv[i])), b.zd);
      return { i, x, y, r: pr * Math.sqrt(0.97 / (b.k[3] + (1.05 - b.k[3]) * blur)), a: this.uV[k] };
    });
    const cur = this.selIdx >= 0 ? this.base[this.selIdx] : null;
    // background tint follows the two spheres around the camera (by their slots, so months work too)
    const near = n ? this._idxAt(this.scroll) : 0,
      side = n && this.base[near].slot * S > this.scroll ? -1 : 1,
      other = clamp(near + side, 0, Math.max(0, n - 1)),
      span = n ? Math.abs(this.base[other].slot - this.base[near].slot) * S : 0,
      f = near,
      i0 = near,
      i1 = other,
      ft = span > 0 ? clamp(Math.abs(this.scroll - this.base[near].slot * S) / span, 0, 1) : 0;
    const tg1 = n ? [0, 1, 2].map(j => this.base[i0].c1[j] * (1 - ft) + this.base[i1].c1[j] * ft) : this.tint;
    const tg2 = n ? [0, 1, 2].map(j => this.base[i0].c2[j] * (1 - ft) + this.base[i1].c2[j] * ft) : this.tint2;
    this.tint = this.tint.map((v, j) => v + (tg1[j] - v) * Math.min(1, dt * 2.5));
    this.tint2 = this.tint2.map((v, j) => v + (tg2[j] - v) * Math.min(1, dt * 2.5));
    const [lx, ly] = this.look;
    const gl = this.gl,
      L = this.loc,
      ref = cur || (n ? this.base[Math.round(f)] : null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.uniform2f(L.uRes, this.cv.width, this.cv.height);
    gl.uniform1f(L.uT, this.T);
    gl.uniform1f(L.uScroll, this.scroll);
    gl.uniform1f(L.uZ, zz);
    gl.uniform1f(L.uSel, sel);
    gl.uniform1f(L.uPaper, this.paper);
    gl.uniform1f(L.uDepth, this.depth * zz);
    gl.uniform1f(L.uInt, it);
    // music inside a day: the sphere breathes with the song's bass (0 everywhere else)
    gl.uniform1f(L.uBeat, this.state === 'day' && !rm && this.o.beat ? this.o.beat(dt) : 0);
    gl.uniform1f(L.uWarp, cur ? cur.k[6] : 0.1);
    gl.uniform1f(L.uSpd, cur ? cur.k[5] : 0.6);
    gl.uniform4fv(L.uB, this.uB);
    gl.uniform4fv(L.uM, this.uM);
    gl.uniform3fv(L.uC, this.uC);
    gl.uniform3fv(L.uC2, this.uC2);
    gl.uniform3fv(L.uC3, this.uC3);
    gl.uniform1fv(L.uV, this.uV);
    gl.uniform1fv(L.uG, this.uG);
    const dropK = this.drp ? idx.indexOf(this.drp.i) : -1;
    gl.uniform3f(L.uDrop, dropK, this.drp ? this.drp.sx : 1, this.drp ? this.drp.sy : 1);
    gl.uniform1fv(L.uD, this.uD);
    gl.uniform1fv(L.uS, this.uS);
    gl.uniform2f(L.uLook, lx * (1 - zz * 0.3), ly * (1 - zz * 0.3));
    gl.uniform3fv(L.uS0, ref ? ref.c1 : [1, 0.76, 0.5]);
    gl.uniform3fv(L.uS1, ref ? ref.c2 : [0.9, 0.55, 0.4]);
    gl.uniform3fv(L.uS2, ref ? ref.c3 : [0.95, 0.88, 0.75]);
    gl.uniform3fv(L.uTint, this.tint);
    gl.uniform3fv(L.uTint2, this.tint2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const W = this.W;
    this.labels.forEach((e, i) => {
      const b = this.base[i],
        [x, y0, pr, sc] = this._proj(b.x, b.y, b.r, b.zd);
      if (Math.abs(x - W / 2) > W * 0.62 || zz > 0.6) {
        if (e._o !== 0) {
          setStyle(e, 'opacity', '0');
          e._o = 0;
        }
        return;
      }
      const op =
        (1 - zz / 0.6) *
        this.labelK *
        (1 - this.pull) *
        (1 - this._life(i)) *
        (this.hov === i ? 1 : 0.62) *
        (this.vis[i] ?? 1) *
        clamp(1.25 - b.zd * 0.6, 0.35, 1);
      setStyle(
        e,
        'transform',
        `translate3d(${x.toFixed(1)}px,${(y0 + pr * 0.95).toFixed(1)}px,0) translate(-50%,0) scale(${(0.75 + 0.4 * sc).toFixed(3)})`,
      );
      setStyle(e, 'opacity', String(op));
      e._o = op;
      const t = this.hov === i ? this.days[i].userTitle || this.days[i].title : '';
      if (e._t !== t) {
        e._t = t;
        e.textContent = e._d;
        if (t) {
          const s = document.createElement('span');
          s.textContent = t;
          e.appendChild(s);
        }
      }
    });

    this._items(zz, dt);
    this.o.onFrame({
      f: clamp(this.scroll / this.TOT, 0, 1),
      depth: this.depth,
      state: this.state,
      z: zz,
      tint: this.tint,
      scroll: this.scroll,
      lx,
      ly,
      dt,
      t: this.T,
    });
    requestAnimationFrame(t => this.frame(t));
  }

  _items(zz, dt) {
    if (!this.world) return;
    const show = sm(clamp((zz - 0.55) / 0.45, 0, 1));
    const [lx, ly] = this.look,
      dv = this.depth,
      u = Math.min(1, this.W / 1000);
    setStyle(
      this.world,
      'transform',
      `rotateX(${(ly * 5).toFixed(2)}deg) rotateY(${(-lx * 9).toFixed(2)}deg) translateZ(${(dv * SPAN).toFixed(1)}px)`,
    );
    const T = this.T,
      W = this.W,
      H = this.H;
    // "wall of memories": passed cards settle into a grid between the title and the mini player.
    // The grid is planned for every card of the day, so cards never move once they've landed,
    // and each card is scaled to fit its own cell, so nothing overlaps.
    if (!this._szT || (this._szT -= dt) <= 0) {
      this._szT = 0.5;
      for (const o of this.items) {
        o.w = o.el.offsetWidth || o.w || 340;
        o.h = o.el.offsetHeight || o.h || 280;
      }
    }
    const pins = this.items.filter(o => o.pin),
      player = this.items.find(o => o.player);
    // mini player over the dock: on a phone it takes almost the full width so the name and buttons stay readable
    const ms = player ? clamp((W - (W < 700 ? 24 : 40)) / (player.w || 440), 0.5, 1) * (W < 700 ? 0.98 : 0.78) : 0;
    const top = -H * 0.45 + (W < 700 ? 170 : 112),
      mini = player ? (player.h || 150) * ms + 16 : 0;
    const bottom = H * 0.55 - 100 - mini,
      left = -W / 2 + 22,
      aw = W - 44,
      ah = Math.max(80, bottom - top);
    const n = pins.length;
    if (n) {
      // justified rows (like the Photos app): every card in a row gets the same height,
      // widths follow each card's own proportions, rows are centred and never overlap
      const GAP = W < 700 ? 12 : 18,
        ar = pins.map(o => o.w / o.h);
      const layout = rowH => {
        const rows = [];
        let cur = [],
          sumW = 0;
        pins.forEach((o, k) => {
          const w = ar[k] * rowH;
          if (cur.length && sumW + GAP * cur.length + w > aw) {
            rows.push(cur);
            cur = [];
            sumW = 0;
          }
          cur.push(k);
          sumW += w;
        });
        if (cur.length) rows.push(cur);
        return rows;
      };
      let lo = 40,
        hi = Math.min(ah, 360),
        rows = layout(lo);
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2,
          r = layout(mid);
        if (r.length * mid + (r.length - 1) * GAP <= ah) {
          lo = mid;
          rows = r;
        } else hi = mid;
      }
      const rowH = lo,
        totalH = rows.length * rowH + (rows.length - 1) * GAP;
      let y = top + (ah - totalH) / 2;
      rows.forEach(row => {
        const widths = row.map(k => ar[k] * rowH),
          rw = widths.reduce((a, b) => a + b, 0) + GAP * (row.length - 1);
        let x = left + (aw - rw) / 2;
        row.forEach((k, j) => {
          const o = pins[k];
          // the wall sits deeper (z < 0); scale position and size back up so on screen it lands exactly on the grid
          o.sz = -260 - k * 2;
          const kz = (PERSP - o.sz) / PERSP;
          o.sx = (x + widths[j] / 2) * kz;
          o.sy = (y + rowH / 2) * kz;
          o.ss = (rowH / o.h) * kz;
          x += widths[j] + GAP;
        });
        y += rowH + GAP;
      });
    }
    // while a card is flying through the middle, the wall steps back a little so the two never fight
    let focus = 0;
    for (const o of this.items)
      if (!o.pinTitle && !o.player) {
        const r = o.z - dv;
        if (r > -0.02 && r < 0.3) focus = Math.max(focus, 1 - Math.abs(r - 0.1) / 0.2);
      }
    this._focus = (this._focus || 0) + (clamp(focus, 0, 1) - (this._focus || 0)) * Math.min(1, dt * 5);
    if (player) {
      player.sx = 0;
      player.sy = H * 0.55 - 100 - mini / 2;
      player.ss = ms;
      player.sz = 10;
    }
    const lerp = (a, b, k) => a + (b - a) * k;
    damp(this.fk, this.fOn ? 1 : 0, this.o.settings().reduce ? 0.12 : 0.42, dt);
    damp(this.fzm, this.fZoom, 0.25, dt);
    if (!this.fOn && this.fItem && this.fk.v < 0.02) {
      this.fItem.el.classList.remove('focus');
      this.fItem = null;
    }
    const fk = this.fItem ? sm(clamp(this.fk.v, 0, 1)) : 0;
    for (const o of this.items) {
      const rel = o.z - dv;
      const fadeIn = 1 - sm(clamp((rel - 0.2) / 0.16, 0, 1));
      const canPin = o.pin || o.pinTitle || o.player;
      const pin = canPin ? sm(clamp(((o.player ? 0.1 : 0.03) - rel) / (o.player ? 0.08 : 0.16), 0, 1)) : 0;
      const fadeOut = canPin ? 1 : sm(clamp((rel + 0.16) / 0.14, 0, 1));
      const wallDim = o.pin ? 1 - 0.55 * this._focus * pin : 1;
      let op = fadeIn * fadeOut * show * (1 - 0.1 * pin) * wallDim;
      if (op < 0.003) {
        if (o._v) {
          o.el.style.visibility = 'hidden';
          o._v = false;
        }
        continue;
      }
      if (!o._v) {
        o.el.style.visibility = 'visible';
        o._v = true;
      }
      const bob = Math.sin(T * 0.7 + o.ph) * 10,
        sway = Math.sin(T * 0.45 + o.ph * 1.3);
      const face = clamp(rel / 0.3, 0, 1);
      let ry = o.ry * (0.35 + 0.65 * face) + sway * 2.5,
        rx = o.rx + Math.sin(T * 0.5 + o.ph) * 1.5,
        rz = o.rz + sway * 1.2;
      const big = o.pin ? u * 1.32 : u;
      // on a narrow (phone) screen two neighbouring cards can't sit side by side without overlapping,
      // so they part vertically instead: the left one rises, the right one sinks
      const narrow = W < 700;
      // |o.x| is 200, 230 or 260 (by card order): on a phone that becomes left / centre / right,
      // so cards on the same side that follow each other don't stack exactly behind one another
      let x = narrow ? (o.x ? ((Math.abs(o.x) - 230) / 30) * W * 0.2 : 0) : o.x * u,
        y = o.y * u + (narrow ? Math.sign(o.x) * H * 0.17 : 0) + bob,
        z = -o.z * SPAN,
        s = big;
      if (pin > 0) {
        const tx = o.pinTitle ? 0 : o.sx,
          ty = o.pinTitle ? -H * 0.45 + (W < 700 ? 82 : 50) : o.sy,
          // the day title at the top of the wall: bigger on phones, where 0.34 made it hard to read
          ts = o.pinTitle ? (W < 700 ? Math.min(0.52, (W - 32) / 680) : 0.42) : o.ss;
        const settle = o.player ? 0 : 0.2;
        x = lerp(x, tx, pin);
        y = lerp(y, ty + bob * settle, pin);
        z = lerp(z, -dv * SPAN + (o.pinTitle ? 0 : o.sz), pin);
        s = lerp(s, ts, pin);
        ry = lerp(ry, o.player ? 0 : sway * 1.2, pin);
        rx = lerp(rx, 0, pin);
        rz = lerp(rz, o.player ? 0 : (o.srz || 0) + sway * 0.5, pin);
      }
      if (fk > 0) {
        if (o === this.fItem) {
          // fly in front of the camera, face it, fit the free part of the screen
          const kz = (PERSP - FOCUS_Z) / PERSP,
            fit = Math.min((W * FOCUS_FILL_W) / (o.w || 340), ((H - FOCUS_DOCK_PX) * FOCUS_FILL_H) / (o.h || 280));
          x = lerp(x, 0, fk);
          y = lerp(y, -30 * kz, fk);
          z = lerp(z, -dv * SPAN + FOCUS_Z, fk);
          s = lerp(s, fit * kz * this.fzm.v, fk);
          rx = lerp(rx, 0, fk);
          ry = lerp(ry, 0, fk);
          rz = lerp(rz, 0, fk);
          op = lerp(op, 1, fk);
        } else op *= 1 - 0.78 * fk; // everything else steps back into the dusk
      }
      setStyle(
        o.el,
        'transform',
        `translate(-50%,-50%) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(3)})`,
      );
      setStyle(o.el, 'opacity', op.toFixed(3));
      if (o.interactive) setStyle(o.el, 'pointer-events', op > 0.6 ? 'auto' : 'none');
    }
  }
}
