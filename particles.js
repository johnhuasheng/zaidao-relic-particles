// 粒子着色器：视频渲染（main.js）与交互演示（ppt/ppt.js）共用
export const vertexShader = /* glsl */ `
    uniform float uP, uTime, uRotF, uRotT, uWobF, uWobT, uSize, uFade;
    uniform vec3 uOffF, uOffT, uWobW, uTurbW;
    uniform vec2 uRB; // 山河谷底的河：x=流速，y=波动角频率
    attribute vec3 aFrom, aTo, aCF, aCT, aNF, aNT; attribute vec4 aR; attribute float aKey;
    varying vec3 vCol;
    vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
    vec3 riverA(vec3 q){
      float s = fract(q.x + uTime*0.03);
      float x = -8.5 + 17.0*s;
      float y = 0.15 + 0.9*sin(x*0.52 + uTime*0.45) + 0.28*sin(x*1.3 - uTime*0.7);
      float w = 0.22 + 0.1*sin(x*0.8 + uTime*0.4);
      float tw = x*0.7 + uTime*0.9;
      vec3 p = vec3(x, y, 0.6*sin(x*0.35));
      p += vec3(0.0, cos(tw), sin(tw)) * q.y * w + vec3(0.0, 0.0, q.z*0.12);
      p.y += 0.03*sin(uTime*3.0 + fract(q.x*7919.0)*628.0);
      return p;
    }
    vec3 riverB(vec3 q){
      float s = fract(q.x + uTime*uRB.x);
      float x = -9.5 + 19.0*s;
      float z = 2.2 + 1.3*sin(x*0.42 + 0.8);
      float w = 0.28 + 0.12*sin(x*0.6);
      return vec3(x, -2.55 + q.z*0.05 + 0.04*sin(x*3.0 + uTime*uRB.y + q.y*5.0), z + q.y*w);
    }
    vec3 resolve(vec3 q, float rot, vec3 off){
      if (q.x > 1500.0) return riverB(q - vec3(2000.0,0.0,0.0));
      if (q.x > 500.0) return riverA(q - vec3(1000.0,0.0,0.0));
      return rotY(q, rot) + off;
    }
    float shade(vec3 n, float rot){
      if (dot(n,n) < 0.25) return 1.0;
      vec3 w = rotY(n, rot);
      float rim = 1.0 - abs(w.z);
      float lam = max(0.0, dot(w, normalize(vec3(-0.5, 0.6, 0.65))));
      return 0.4 + 0.5*lam + 0.7*rim*rim;
    }
    void main(){
      float sp = 0.5;
      float p = clamp((uP - aKey*sp)/(1.0-sp), 0.0, 1.0);
      float e = p*p*(3.0-2.0*p);
      e = e*e*(3.0-2.0*e);
      vec3 a = resolve(aFrom, uRotF, uOffF);
      vec3 b = resolve(aTo, uRotT, uOffT);
      vec3 pos = mix(a, b, e);
      float m = sin(3.14159*e);
      vec3 sw = vec3(sin(pos.y*1.1 + uTime*uTurbW.x + aR.y*6.28), sin(pos.z*1.3 + uTime*uTurbW.y + aR.z*6.28), sin(pos.x*0.8 + uTime*uTurbW.z + aR.w*6.28)); // uTurbW：过渡湍流角频率
      pos += sw*m*0.8 + (aR.yzw - 0.5)*m*0.9;
      float wob = mix(uWobF, uWobT, e);
      pos += vec3(sin(uTime*uWobW.x + aR.y*40.0), sin(uTime*uWobW.y + aR.z*40.0), sin(uTime*uWobW.z + aR.w*40.0)) * wob; // uWobW：漂动角频率（PPT 循环片段取周期整数倍）
      vec3 col = mix(aCF*shade(aNF, uRotF), aCT*shade(aNT, uRotT), e);
      col *= 0.82 + 0.18*sin(uTime*2.2 + aR.y*60.0);
      float spark = step(0.988, aR.w);
      col *= 1.0 + spark*1.6;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * (0.55 + 0.75*aR.z) * (1.0 + spark*1.2) * (1.0 + m*0.5) / -mv.z;
      vCol = col * uFade;
    }`;
export const fragmentShader = /* glsl */ `
    varying vec3 vCol;
    void main(){
      vec2 d = gl_PointCoord - 0.5; float r = length(d);
      if (r > 0.5) discard;
      float a = pow(1.0 - r*2.0, 1.7);
      gl_FragColor = vec4(vCol * a * 0.55, 1.0);
    }`;
