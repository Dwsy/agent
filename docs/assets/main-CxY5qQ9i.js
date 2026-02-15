(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function t(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(r){if(r.ep)return;r.ep=!0;const o=t(r);fetch(r.href,o)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const j=globalThis,ce=j.ShadowRoot&&(j.ShadyCSS===void 0||j.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,de=Symbol(),me=new WeakMap;let Pe=class{constructor(e,t,i){if(this._$cssResult$=!0,i!==de)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(ce&&e===void 0){const i=t!==void 0&&t.length===1;i&&(e=me.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&me.set(t,e))}return e}toString(){return this.cssText}};const He=s=>new Pe(typeof s=="string"?s:s+"",void 0,de),v=(s,...e)=>{const t=s.length===1?s[0]:e.reduce((i,r,o)=>i+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+s[o+1],s[0]);return new Pe(t,s,de)},Ye=(s,e)=>{if(ce)s.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const i=document.createElement("style"),r=j.litNonce;r!==void 0&&i.setAttribute("nonce",r),i.textContent=t.cssText,s.appendChild(i)}},ge=ce?s=>s:s=>s instanceof CSSStyleSheet?(e=>{let t="";for(const i of e.cssRules)t+=i.cssText;return He(t)})(s):s;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:We,defineProperty:qe,getOwnPropertyDescriptor:Ve,getOwnPropertyNames:Ke,getOwnPropertySymbols:Xe,getPrototypeOf:Je}=Object,$=globalThis,fe=$.trustedTypes,Ze=fe?fe.emptyScript:"",se=$.reactiveElementPolyfillSupport,B=(s,e)=>s,H={toAttribute(s,e){switch(e){case Boolean:s=s?Ze:null;break;case Object:case Array:s=s==null?s:JSON.stringify(s)}return s},fromAttribute(s,e){let t=s;switch(e){case Boolean:t=s!==null;break;case Number:t=s===null?null:Number(s);break;case Object:case Array:try{t=JSON.parse(s)}catch{t=null}}return t}},pe=(s,e)=>!We(s,e),be={attribute:!0,type:String,converter:H,reflect:!1,useDefault:!1,hasChanged:pe};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),$.litPropertyMetadata??($.litPropertyMetadata=new WeakMap);let F=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=be){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const i=Symbol(),r=this.getPropertyDescriptor(e,i,t);r!==void 0&&qe(this.prototype,e,r)}}static getPropertyDescriptor(e,t,i){const{get:r,set:o}=Ve(this.prototype,e)??{get(){return this[t]},set(a){this[t]=a}};return{get:r,set(a){const d=r==null?void 0:r.call(this);o==null||o.call(this,a),this.requestUpdate(e,d,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??be}static _$Ei(){if(this.hasOwnProperty(B("elementProperties")))return;const e=Je(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(B("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(B("properties"))){const t=this.properties,i=[...Ke(t),...Xe(t)];for(const r of i)this.createProperty(r,t[r])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[i,r]of t)this.elementProperties.set(i,r)}this._$Eh=new Map;for(const[t,i]of this.elementProperties){const r=this._$Eu(t,i);r!==void 0&&this._$Eh.set(r,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const r of i)t.unshift(ge(r))}else e!==void 0&&t.push(ge(e));return t}static _$Eu(e,t){const i=t.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(t=>t(this))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Ye(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(t=>{var i;return(i=t.hostConnected)==null?void 0:i.call(t)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(t=>{var i;return(i=t.hostDisconnected)==null?void 0:i.call(t)})}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){var o;const i=this.constructor.elementProperties.get(e),r=this.constructor._$Eu(e,i);if(r!==void 0&&i.reflect===!0){const a=(((o=i.converter)==null?void 0:o.toAttribute)!==void 0?i.converter:H).toAttribute(t,i.type);this._$Em=e,a==null?this.removeAttribute(r):this.setAttribute(r,a),this._$Em=null}}_$AK(e,t){var o,a;const i=this.constructor,r=i._$Eh.get(e);if(r!==void 0&&this._$Em!==r){const d=i.getPropertyOptions(r),c=typeof d.converter=="function"?{fromAttribute:d.converter}:((o=d.converter)==null?void 0:o.fromAttribute)!==void 0?d.converter:H;this._$Em=r;const h=c.fromAttribute(t,d.type);this[r]=h??((a=this._$Ej)==null?void 0:a.get(r))??h,this._$Em=null}}requestUpdate(e,t,i,r=!1,o){var a;if(e!==void 0){const d=this.constructor;if(r===!1&&(o=this[e]),i??(i=d.getPropertyOptions(e)),!((i.hasChanged??pe)(o,t)||i.useDefault&&i.reflect&&o===((a=this._$Ej)==null?void 0:a.get(e))&&!this.hasAttribute(d._$Eu(e,i))))return;this.C(e,t,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:r,wrapped:o},a){i&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,a??t??this[e]),o!==!0||a!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),r===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var i;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[o,a]of this._$Ep)this[o]=a;this._$Ep=void 0}const r=this.constructor.elementProperties;if(r.size>0)for(const[o,a]of r){const{wrapped:d}=a,c=this[o];d!==!0||this._$AL.has(o)||c===void 0||this.C(o,void 0,a,c)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(i=this._$EO)==null||i.forEach(r=>{var o;return(o=r.hostUpdate)==null?void 0:o.call(r)}),this.update(t)):this._$EM()}catch(r){throw e=!1,this._$EM(),r}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach(i=>{var r;return(r=i.hostUpdated)==null?void 0:r.call(i)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(e){}firstUpdated(e){}};F.elementStyles=[],F.shadowRootOptions={mode:"open"},F[B("elementProperties")]=new Map,F[B("finalized")]=new Map,se==null||se({ReactiveElement:F}),($.reactiveElementVersions??($.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const L=globalThis,ve=s=>s,Y=L.trustedTypes,ye=Y?Y.createPolicy("lit-html",{createHTML:s=>s}):void 0,Oe="$lit$",x=`lit$${Math.random().toFixed(9).slice(2)}$`,Me="?"+x,Qe=`<${Me}>`,S=document,z=()=>S.createComment(""),I=s=>s===null||typeof s!="object"&&typeof s!="function",he=Array.isArray,et=s=>he(s)||typeof(s==null?void 0:s[Symbol.iterator])=="function",re=`[ 	
\f\r]`,D=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,we=/-->/g,xe=/>/g,k=RegExp(`>|${re}(?:([^\\s"'>=/]+)(${re}*=${re}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),$e=/'/g,ke=/"/g,De=/^(?:script|style|textarea|title)$/i,tt=s=>(e,...t)=>({_$litType$:s,strings:e,values:t}),l=tt(1),C=Symbol.for("lit-noChange"),u=Symbol.for("lit-nothing"),_e=new WeakMap,_=S.createTreeWalker(S,129);function Be(s,e){if(!he(s)||!s.hasOwnProperty("raw"))throw Error("invalid template strings array");return ye!==void 0?ye.createHTML(e):e}const st=(s,e)=>{const t=s.length-1,i=[];let r,o=e===2?"<svg>":e===3?"<math>":"",a=D;for(let d=0;d<t;d++){const c=s[d];let h,g,p=-1,y=0;for(;y<c.length&&(a.lastIndex=y,g=a.exec(c),g!==null);)y=a.lastIndex,a===D?g[1]==="!--"?a=we:g[1]!==void 0?a=xe:g[2]!==void 0?(De.test(g[2])&&(r=RegExp("</"+g[2],"g")),a=k):g[3]!==void 0&&(a=k):a===k?g[0]===">"?(a=r??D,p=-1):g[1]===void 0?p=-2:(p=a.lastIndex-g[2].length,h=g[1],a=g[3]===void 0?k:g[3]==='"'?ke:$e):a===ke||a===$e?a=k:a===we||a===xe?a=D:(a=k,r=void 0);const w=a===k&&s[d+1].startsWith("/>")?" ":"";o+=a===D?c+Qe:p>=0?(i.push(h),c.slice(0,p)+Oe+c.slice(p)+x+w):c+x+(p===-2?d:w)}return[Be(s,o+(s[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]};class G{constructor({strings:e,_$litType$:t},i){let r;this.parts=[];let o=0,a=0;const d=e.length-1,c=this.parts,[h,g]=st(e,t);if(this.el=G.createElement(h,i),_.currentNode=this.el.content,t===2||t===3){const p=this.el.content.firstChild;p.replaceWith(...p.childNodes)}for(;(r=_.nextNode())!==null&&c.length<d;){if(r.nodeType===1){if(r.hasAttributes())for(const p of r.getAttributeNames())if(p.endsWith(Oe)){const y=g[a++],w=r.getAttribute(p).split(x),N=/([.?@])?(.*)/.exec(y);c.push({type:1,index:o,name:N[2],strings:w,ctor:N[1]==="."?it:N[1]==="?"?ot:N[1]==="@"?at:ee}),r.removeAttribute(p)}else p.startsWith(x)&&(c.push({type:6,index:o}),r.removeAttribute(p));if(De.test(r.tagName)){const p=r.textContent.split(x),y=p.length-1;if(y>0){r.textContent=Y?Y.emptyScript:"";for(let w=0;w<y;w++)r.append(p[w],z()),_.nextNode(),c.push({type:2,index:++o});r.append(p[y],z())}}}else if(r.nodeType===8)if(r.data===Me)c.push({type:2,index:o});else{let p=-1;for(;(p=r.data.indexOf(x,p+1))!==-1;)c.push({type:7,index:o}),p+=x.length-1}o++}}static createElement(e,t){const i=S.createElement("template");return i.innerHTML=e,i}}function O(s,e,t=s,i){var a,d;if(e===C)return e;let r=i!==void 0?(a=t._$Co)==null?void 0:a[i]:t._$Cl;const o=I(e)?void 0:e._$litDirective$;return(r==null?void 0:r.constructor)!==o&&((d=r==null?void 0:r._$AO)==null||d.call(r,!1),o===void 0?r=void 0:(r=new o(s),r._$AT(s,t,i)),i!==void 0?(t._$Co??(t._$Co=[]))[i]=r:t._$Cl=r),r!==void 0&&(e=O(s,r._$AS(s,e.values),r,i)),e}class rt{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:i}=this._$AD,r=((e==null?void 0:e.creationScope)??S).importNode(t,!0);_.currentNode=r;let o=_.nextNode(),a=0,d=0,c=i[0];for(;c!==void 0;){if(a===c.index){let h;c.type===2?h=new T(o,o.nextSibling,this,e):c.type===1?h=new c.ctor(o,c.name,c.strings,this,e):c.type===6&&(h=new nt(o,this,e)),this._$AV.push(h),c=i[++d]}a!==(c==null?void 0:c.index)&&(o=_.nextNode(),a++)}return _.currentNode=S,r}p(e){let t=0;for(const i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class T{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,i,r){this.type=2,this._$AH=u,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=r,this._$Cv=(r==null?void 0:r.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=O(this,e,t),I(e)?e===u||e==null||e===""?(this._$AH!==u&&this._$AR(),this._$AH=u):e!==this._$AH&&e!==C&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):et(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==u&&I(this._$AH)?this._$AA.nextSibling.data=e:this.T(S.createTextNode(e)),this._$AH=e}$(e){var o;const{values:t,_$litType$:i}=e,r=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=G.createElement(Be(i.h,i.h[0]),this.options)),i);if(((o=this._$AH)==null?void 0:o._$AD)===r)this._$AH.p(t);else{const a=new rt(r,this),d=a.u(this.options);a.p(t),this.T(d),this._$AH=a}}_$AC(e){let t=_e.get(e.strings);return t===void 0&&_e.set(e.strings,t=new G(e)),t}k(e){he(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let i,r=0;for(const o of e)r===t.length?t.push(i=new T(this.O(z()),this.O(z()),this,this.options)):i=t[r],i._$AI(o),r++;r<t.length&&(this._$AR(i&&i._$AB.nextSibling,r),t.length=r)}_$AR(e=this._$AA.nextSibling,t){var i;for((i=this._$AP)==null?void 0:i.call(this,!1,!0,t);e!==this._$AB;){const r=ve(e).nextSibling;ve(e).remove(),e=r}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class ee{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,r,o){this.type=1,this._$AH=u,this._$AN=void 0,this.element=e,this.name=t,this._$AM=r,this.options=o,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=u}_$AI(e,t=this,i,r){const o=this.strings;let a=!1;if(o===void 0)e=O(this,e,t,0),a=!I(e)||e!==this._$AH&&e!==C,a&&(this._$AH=e);else{const d=e;let c,h;for(e=o[0],c=0;c<o.length-1;c++)h=O(this,d[i+c],t,c),h===C&&(h=this._$AH[c]),a||(a=!I(h)||h!==this._$AH[c]),h===u?e=u:e!==u&&(e+=(h??"")+o[c+1]),this._$AH[c]=h}a&&!r&&this.j(e)}j(e){e===u?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class it extends ee{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===u?void 0:e}}class ot extends ee{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==u)}}class at extends ee{constructor(e,t,i,r,o){super(e,t,i,r,o),this.type=5}_$AI(e,t=this){if((e=O(this,e,t,0)??u)===C)return;const i=this._$AH,r=e===u&&i!==u||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,o=e!==u&&(i===u||r);r&&this.element.removeEventListener(this.name,this,i),o&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class nt{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){O(this,e)}}const ie=L.litHtmlPolyfillSupport;ie==null||ie(G,T),(L.litHtmlVersions??(L.litHtmlVersions=[])).push("3.3.2");const Le=(s,e,t)=>{const i=(t==null?void 0:t.renderBefore)??e;let r=i._$litPart$;if(r===void 0){const o=(t==null?void 0:t.renderBefore)??null;i._$litPart$=r=new T(e.insertBefore(z(),o),o,void 0,t??{})}return r._$AI(s),r};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const A=globalThis;let f=class extends F{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Le(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return C}};var Fe;f._$litElement$=!0,f.finalized=!0,(Fe=A.litElementHydrateSupport)==null||Fe.call(A,{LitElement:f});const oe=A.litElementPolyfillSupport;oe==null||oe({LitElement:f});(A.litElementVersions??(A.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const b=s=>(e,t)=>{t!==void 0?t.addInitializer(()=>{customElements.define(s,e)}):customElements.define(s,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const lt={attribute:!0,type:String,converter:H,reflect:!1,hasChanged:pe},ct=(s=lt,e,t)=>{const{kind:i,metadata:r}=t;let o=globalThis.litPropertyMetadata.get(r);if(o===void 0&&globalThis.litPropertyMetadata.set(r,o=new Map),i==="setter"&&((s=Object.create(s)).wrapped=!0),o.set(t.name,s),i==="accessor"){const{name:a}=t;return{set(d){const c=e.get.call(this);e.set.call(this,d),this.requestUpdate(a,c,s,!0,d)},init(d){return d!==void 0&&this.C(a,void 0,s,d),d}}}if(i==="setter"){const{name:a}=t;return function(d){const c=this[a];e.call(this,d),this.requestUpdate(a,c,s,!0,d)}}throw Error("Unsupported decorator location: "+i)};function dt(s){return(e,t)=>typeof t=="object"?ct(s,e,t):((i,r,o)=>{const a=r.hasOwnProperty(o);return r.constructor.createProperty(o,i),a?Object.getOwnPropertyDescriptor(r,o):void 0})(s,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function m(s){return dt({...s,state:!0,attribute:!1})}const pt={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"核心能力",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"自主 AI 编排器",title:`一个 Agent
驾驭全栈开发`,subtitle:"通过强制 5 阶段工作流编排 Claude / Codex / Gemini，沙箱安全、代码主权、多通道网关。",stats:{skills:"42",skillsLabel:"专业技能",extensions:"26",extensionsLabel:"扩展插件",subagents:"25+",subagentsLabel:"专用子代理",gateway:"65+",gatewayLabel:"网关模块"},ctas:{primary:"快速开始",secondary:"GitHub 仓库"},terminal:{line1:'$ pi "重构认证模块"',line2:"⟐ Phase 1: 上下文检索",line3:'  ├─ ace search "auth logic" → 12 files',line4:'  └─ rg "class Auth" → src/core/auth.ts',line5:"⟐ Phase 2: 分析与规划",line6:"  └─ 并行派发 scout × 3 ...",line7:"⟐ Phase 4: 编码实施",line8:"  └─ 修改 4 个文件，127 行变更",line9:"⟐ Phase 5: 审计 — ✓ 全部通过",line10:"✓ 交付完成。4 文件，0 问题。"}},features:{label:"核心能力",title:"不只是代码补全",subtitle:"从语义搜索到架构设计，从安全审计到多 Agent 协作的全栈编排",cards:{workflow:{title:"5 阶段强制工作流",description:"上下文检索 → 分析规划 → 原型获取 → 编码实施 → 审计交付。每个阶段有明确的工具链和质量门禁，跳不过、绕不开。",features:["黄金法则：改代码前必须先检索上下文","外部模型只能输出 Unified Diff","Phase 5 强制代码审查后才交付","L1-L4 复杂度自动路由"]},skills:{title:"42 项专业技能",description:"语义搜索（ace-tool）、AST 重写（ast-grep）、系统设计（EventStorming）、Office 全家桶、Web 自动化、SVG 生成 — 覆盖 9 大类别的完整开发管线。"},subagents:{title:"25+ 专用子代理",description:"scout、planner、worker、reviewer、brainstormer、vision、security-reviewer、simplifier、system-design、codemap、researcher、api-tester — 加上完整的 Crew 多代理编排系统。"},search:{title:"语义代码搜索",description:"「认证逻辑在哪？」— ace-tool 语义理解 + rg 精确匹配 + ast-grep 语法结构。三层搜索互补，自然语言到代码定位。"},gateway:{title:"多通道网关",description:"65+ 模块。RPC 进程池、会话路由、16 个生命周期 Hook、Cron 定时任务、OpenAI 兼容 API。一个服务同时接入 Telegram / Discord / WebChat。"},enterprise:{title:"企业级安全",description:"5 层安全体系：Auth（时序安全）、ExecGuard（可执行白名单）、SSRF Guard（DNS 重绑定防御）、Allowlist（配对审批）、Media Security（HMAC 令牌）。",features:["代码主权 — 外部代码必须重构为生产级","沙箱安全 — Unified Diff 隔离","SSOT — 单一真实来源","默认安全 — Fail-Closed 设计"]}}},gateway:{label:"网关架构",title:"不是 Bot 框架 — 是进程编排器",subtitle:"网关管理 AI 代理进程池并路由消息。通道无关、插件优先、纵深安全。",layers:{channels:{title:"通道层",desc:"Telegram · Discord · WebChat · OpenAI API"},pipeline:{title:"管线层",desc:"分发 → 去重 → 模式解析 → 入队 → 处理"},plugins:{title:"插件层",desc:"加载器 · Hooks (16) · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 会话路由 · Cron · 系统事件"},security:{title:"安全层",desc:"Auth · ExecGuard · SSRF · Allowlist · Media"}},stats:{modules:{value:"65+",label:"源码模块"},hooks:{value:"16",label:"生命周期 Hook"},apis:{value:"30+",label:"API 端点"},security:{value:"5",label:"安全层"}},highlights:["能力感知进程池 — 按签名匹配复用","三模式消息并发：steer / follow-up / interrupt","JSONL 检测跨重启会话恢复","模型健康故障转移与自动冷却","插件优先：Telegram / Discord / WebChat 都是插件","OpenAI 兼容 /v1/chat/completions 端点"]},workflow:{label:"工作流程",title:"强制 5 阶段",subtitle:"每个阶段都有明确的输入、输出和质量门禁",phases:{phase1:{title:"上下文检索",description:"黄金法则：改代码前必须先检索。ace-tool 语义搜索 + rg 精确匹配 + ast-grep 语法结构 + fd 文件定位。",tool:"ace / rg / ast-grep / fd"},phase2:{title:"分析与规划",description:"仅复杂任务触发。分发给 Codex / Gemini 交叉验证，输出分步计划。L3+ 自动创建 Workhub Issue。",tool:"Codex · Gemini · Workhub"},phase3:{title:"原型获取",description:"外部模型生成 Unified Diff Patch。前端走视觉基线，后端走逻辑原型。严禁直接写文件。",tool:"Gemini → Unified Diff"},phase4:{title:"编码实施",description:"基于原型重构为生产代码。去冗余、最小范围、代码自解释。强制副作用审查。",tool:"Pi Agent (Self)"},phase5:{title:"审计与交付",description:"变更后立即调用代码审查。审计通过后才交付用户。这不是可选步骤。",tool:"强制审计"}},complexity:{title:"复杂度自动路由",l1:{label:"L1 简单",desc:"1-2 文件 <50 行 → 直接执行"},l2:{label:"L2 中等",desc:"3-5 文件 → 加分析阶段"},l3:{label:"L3 复杂",desc:"6-10 文件 → Issue + 子任务 + tmux"},l4:{label:"L4 严重",desc:"10+ 文件 → Workhub + ADR + 架构设计"}}},extensions:{label:"扩展生态",title:"26 个扩展，开发体验拉满",subtitle:"交互式 Shell、安全门禁、计划模式、角色记忆、自主循环，还有游戏",cards:{subagentOrch:{title:"子代理编排",description:"单任务 / 链式 / 并行执行。异步后台任务。代理 CRUD 管理 TUI。可视化进度组件。",tag:"多代理"},interactiveShell:{title:"交互式 Shell",description:"PTY 覆盖层运行 Claude Code / Gemini CLI / Codex。支持 hands-free、dispatch、interactive 三种模式。",tag:"委派"},loop:{title:"自主循环",description:"循环运行直到测试通过、自定义条件满足或自行判断。上下文压缩感知。",tag:"自动化"},rolePersona:{title:"角色记忆系统",description:"按项目路径自动切换角色。每个角色独立 MEMORY.md / SOUL.md / USER.md。SM-2 间隔重复整合。",tag:"记忆"},planMode:{title:"计划模式",description:"只读探索。提取 TODO、分析架构、制定方案。确认后再执行。Shift+P 切换。",tag:"安全"},safetyGates:{title:"安全门禁",description:"拦截 40+ 危险模式。rm → trash 带 30 秒倒计时。git restore . → 逐文件恢复。",tag:"安全"},outputStyles:{title:"输出风格",description:"可切换 AI 人格：解释型、学习型、编码型、结构化思维。项目或全局作用域。",tag:"体验"},games:{title:"内置游戏",description:"Snake / Tetris / 2048 / Minesweeper / Breakout / Pong。状态持久化，高分记录。",tag:"娱乐"}}},comparison:{label:"对比",title:"Pi Agent 的差异化",subtitle:"与其他 AI 编码工具的功能对比",features:{multiModel:"多模型编排",multiAgent:"多代理系统",skillSystem:"技能系统",extensionSystem:"扩展系统",gateway:"多通道网关",safetyGates:"安全门禁",memorySystem:"记忆系统",mandatoryWorkflow:"强制工作流",openSource:"开源"},tools:{pi:"Pi Agent",claudeCode:"Claude Code",cursor:"Cursor",aider:"Aider"},values:{pi:[!0,!0,!0,!0,!0,!0,!0,!0,!0],claudeCode:[!1,!1,!1,!0,!1,!1,!1,!1,!1],cursor:[!0,!1,!1,!0,!1,!1,!1,!1,!1],aider:[!0,!1,!1,!1,!1,!1,!1,!1,!0]}},useCases:{label:"应用场景",title:"实际怎么用",subtitle:"从快速侦察到多 Agent 协作",cases:{scout:{title:"秒级代码定位",description:"输入 /scout auth flow → ace-tool 语义搜索 → 完整调用链和文件定位。不需要知道文件名。",command:"/scout authentication flow"},crew:{title:"多 Agent 协作",description:"pi_messenger mesh 组网 → PRD 规划 → 并行 worker 带文件锁 → reviewer 验证 → 自动同步下游规格。",command:"pi_messenger({ action: 'work', autonomous: true })"},gateway:{title:"分钟级部署 Bot",description:"pi-gateway 一键部署 → Telegram Bot 接入 → 图片/音频/群聊 → Cron 定时任务 → 自主运行。",command:"bun run pi-gw start"},selfImprove:{title:"自我进化",description:"evolution 技能挂钩生命周期 → 检测改进机会 → 自动纠错 → 验证自身技能 → 从经验中学习。",command:"evolution: auto-detect + self-correct"}}},techSpecs:{label:"技术规格",title:"基于成熟协议构建",subtitle:"多模型编排、专业技能系统、企业级安全协议",columns:{models:{title:"多模型编排",items:["Claude — 主对话 + 实现","Codex — 算法分析 + 代码审查","Gemini — 原型获取 + UI 设计","Vision / MiniMax — 专用场景"]},skills:{title:"42 技能 (9 大类)",items:["搜索：ace-tool · rg · fd · ast-grep · exa","分析：codemap · har-to-vue · improve-skill","文档：workhub · deepwiki · knowledge-base","平台：evolution · mcp-to-skill · crew"]},agents:{title:"25+ 子代理",items:["侦察：scout · analyze · codemap · researcher","构建：worker · planner · brainstormer","审查：reviewer · security-reviewer · simplifier","协作：crew-planner · crew-worker · crew-reviewer"]},security:{title:"5 层安全",items:["Auth — 时序安全令牌比较","ExecGuard — 可执行白名单，默认拒绝","SSRF Guard — DNS 重绑定防御","Allowlist — 配对码审批机制"]}}},cta:{title:"准备好编排了吗？",description:"42 技能、26 扩展、25+ 子代理、多通道网关。强制工作流确保代码质量，沙箱安全保护你的项目。",primary:"开始使用",secondary:"GitHub 仓库"},footer:{description:"自主 AI 编排器，强制 5 阶段工作流，从上下文检索到审计交付。",links:{product:"产品",resources:"资源",community:"社区"},items:{features:"核心能力",gateway:"网关",workflow:"工作流",extensions:"扩展",docs:"文档",skills:"技能目录",changelog:"更新日志",github:"GitHub",issues:"Issues"},copyright:"© 2026 Pi Agent. MIT 开源协议。"}},ht={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Autonomous AI Orchestrator",title:`One Agent to Rule
Full-Stack Dev`,subtitle:"Orchestrate Claude, Codex & Gemini through a mandatory 5-phase workflow with sandbox security, code sovereignty, and multi-channel gateway.",stats:{skills:"42",skillsLabel:"Skills",extensions:"26",extensionsLabel:"Extensions",subagents:"25+",subagentsLabel:"Subagents",gateway:"65+",gatewayLabel:"Gateway Modules"},ctas:{primary:"Quick Start",secondary:"View on GitHub"},terminal:{line1:'$ pi "Refactor the auth module"',line2:"⟐ Phase 1: Context Retrieval",line3:'  ├─ ace search "auth logic" → 12 files',line4:'  └─ rg "class Auth" → src/core/auth.ts',line5:"⟐ Phase 2: Analysis & Planning",line6:"  └─ Dispatching scout × 3 in parallel...",line7:"⟐ Phase 4: Implementation",line8:"  └─ Editing 4 files, 127 lines changed",line9:"⟐ Phase 5: Audit — ✓ All checks passed",line10:"✓ Delivered. 4 files, 0 issues."}},features:{label:"Core Capabilities",title:"Beyond Code Completion",subtitle:"Full-stack orchestration from semantic search to architecture design, from security audit to multi-agent collaboration",cards:{workflow:{title:"5-Phase Mandatory Workflow",description:"Context Retrieval → Analysis → Prototyping → Implementation → Audit. Each phase has explicit toolchains and quality gates. No skipping, no shortcuts.",features:["Golden Rule: retrieve context before modifying code","External models output Unified Diff only","Phase 5 forced code review before delivery","L1-L4 complexity auto-routing"]},skills:{title:"42 Professional Skills",description:"Semantic search (ace-tool), AST rewriting (ast-grep), system design (EventStorming), Office suite, web automation, SVG generation — covering 9 categories across the entire dev pipeline."},subagents:{title:"25+ Specialized Subagents",description:"scout, planner, worker, reviewer, brainstormer, vision, security-reviewer, simplifier, system-design, codemap, researcher, api-tester — plus a full Crew mesh system for multi-agent orchestration."},search:{title:"Semantic Code Search",description:`"Where's the auth logic?" — ace-tool semantics + rg exact match + ast-grep syntax structure. Three layers, complementary. Natural language to code location.`},gateway:{title:"Multi-Channel Gateway",description:"65+ modules. RPC process pool, session routing, 16 lifecycle hooks, cron scheduling, OpenAI-compatible API. One server for Telegram, Discord, and WebChat."},enterprise:{title:"Enterprise Security",description:"5 security layers: Auth (timing-safe), ExecGuard (allowlist), SSRF Guard (DNS rebinding defense), Allowlist (pairing), Media Security (HMAC tokens).",features:["Code Sovereignty — external code must be refactored","Sandbox Security — Unified Diff isolation","SSOT — Single Source of Truth","Fail-Closed — secure by default"]}}},gateway:{label:"Gateway Architecture",title:"Not a Bot Framework — A Process Orchestrator",subtitle:"The gateway manages a pool of AI agent processes and routes messages to them. Channel-agnostic, plugin-first, security-in-depth.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · OpenAI API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Mode Resolve → Enqueue → Process"},plugins:{title:"Plugins",desc:"Loader · Hooks (16) · Registry · Conflict Detection"},runtime:{title:"Runtime",desc:"RPC Pool · Session Router · Cron · System Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF Guard · Allowlist · Media"}},stats:{modules:{value:"65+",label:"Source Modules"},hooks:{value:"16",label:"Lifecycle Hooks"},apis:{value:"30+",label:"API Endpoints"},security:{value:"5",label:"Security Layers"}},highlights:["Capability-aware process pooling — reuse by signature match","Three-mode message concurrency: steer / follow-up / interrupt","Session resume via JSONL detection across restarts","Model health failover with automatic cooldown","Plugin-first: Telegram, Discord, WebChat are all plugins","OpenAI-compatible /v1/chat/completions endpoint"]},workflow:{label:"Workflow",title:"Mandatory 5 Phases",subtitle:"Each phase has explicit inputs, outputs, and quality gates",phases:{phase1:{title:"Context Retrieval",description:"Golden Rule: retrieve before modifying. ace-tool semantic search + rg exact match + ast-grep syntax + fd file location.",tool:"ace / rg / ast-grep / fd"},phase2:{title:"Analysis & Planning",description:"Complex tasks only. Distribute to Codex / Gemini for cross-validation. Output step-by-step plans. L3+ auto-creates Workhub Issues.",tool:"Codex · Gemini · Workhub"},phase3:{title:"Prototyping",description:"External models generate Unified Diff Patches. Frontend gets visual baseline, backend gets logic prototype. No direct file writes.",tool:"Gemini → Unified Diff"},phase4:{title:"Implementation",description:"Refactor prototype to production code. Remove redundancy, minimal scope, self-documenting. Forced side-effect review.",tool:"Pi Agent (Self)"},phase5:{title:"Audit & Delivery",description:"Immediately invoke code review after changes. Deliver only after audit passes. This is not optional.",tool:"Mandatory Audit"}},complexity:{title:"Complexity Auto-Routing",l1:{label:"L1 Simple",desc:"1-2 files, <50 lines → execute directly"},l2:{label:"L2 Medium",desc:"3-5 files → add analysis phase"},l3:{label:"L3 Complex",desc:"6-10 files → Issue + subtasks + tmux"},l4:{label:"L4 Severe",desc:"10+ files → Workhub + ADR + architecture"}}},extensions:{label:"Extension Ecosystem",title:"26 Extensions, DX Maxed",subtitle:"Interactive shell, safety gates, plan mode, role memory, autonomous loops, and yes — games",cards:{subagentOrch:{title:"Subagent Orchestration",description:"Single / chain / parallel execution. Async background jobs. Agent CRUD management TUI. Visual progress widgets.",tag:"Multi-Agent"},interactiveShell:{title:"Interactive Shell",description:"PTY overlay for Claude Code / Gemini CLI / Codex. Hands-free, dispatch, or interactive mode. Background session management.",tag:"Delegation"},loop:{title:"Autonomous Loop",description:"Run agent in a loop until tests pass, custom condition met, or self-determined. Context compaction aware.",tag:"Automation"},rolePersona:{title:"Role Memory System",description:"Auto-switch roles by project path. Isolated MEMORY.md, SOUL.md, USER.md per role. SM-2 spaced repetition consolidation.",tag:"Memory"},planMode:{title:"Plan Mode",description:"Read-only exploration. Extract TODOs, analyze architecture, draft plans. Confirm before executing. Shift+P to toggle.",tag:"Safety"},safetyGates:{title:"Safety Gates",description:"Intercepts 40+ dangerous patterns. rm → trash with 30s countdown. git restore . → per-file. One slip won't nuke your project.",tag:"Safety"},outputStyles:{title:"Output Styles",description:"Switchable AI personalities: explanatory, learning, coding-vibes, structural-thinking. Project or global scope.",tag:"DX"},games:{title:"Built-in Games",description:"Snake / Tetris / 2048 / Minesweeper / Breakout / Pong. State persistence, high scores. /snake for a break.",tag:"Fun"}}},comparison:{label:"Comparison",title:"How Pi Agent Stacks Up",subtitle:"Feature comparison with other AI coding tools",features:{multiModel:"Multi-Model Orchestration",multiAgent:"Multi-Agent System",skillSystem:"Skill System",extensionSystem:"Extension System",gateway:"Multi-Channel Gateway",safetyGates:"Safety Gates",memorySystem:"Memory System",mandatoryWorkflow:"Mandatory Workflow",openSource:"Open Source"},tools:{pi:"Pi Agent",claudeCode:"Claude Code",cursor:"Cursor",aider:"Aider"},values:{pi:[!0,!0,!0,!0,!0,!0,!0,!0,!0],claudeCode:[!1,!1,!1,!0,!1,!1,!1,!1,!1],cursor:[!0,!1,!1,!0,!1,!1,!1,!1,!1],aider:[!0,!1,!1,!1,!1,!1,!1,!1,!0]}},useCases:{label:"Use Cases",title:"See It in Action",subtitle:"From quick recon to multi-agent collaboration",cases:{scout:{title:"Instant Code Location",description:"Type /scout auth flow → ace-tool semantic search → complete call chain and file locations. No need to know filenames.",command:"/scout authentication flow"},crew:{title:"Multi-Agent Crew",description:"pi_messenger mesh → plan from PRD → parallel workers with file reservations → reviewer validates → auto-sync downstream specs.",command:"pi_messenger({ action: 'work', autonomous: true })"},gateway:{title:"Telegram Bot in Minutes",description:"pi-gateway one-click deploy → Telegram Bot connected → images/audio/group chats → cron tasks → autonomous operation.",command:"bun run pi-gw start"},selfImprove:{title:"Self-Improving Agent",description:"evolution skill hooks into lifecycle → detects improvement opportunities → self-corrects errors → validates its own skills → learns from experience.",command:"evolution: auto-detect + self-correct"}}},techSpecs:{label:"Tech Specs",title:"Built on Proven Protocols",subtitle:"Multi-model orchestration, professional skill system, enterprise security",columns:{models:{title:"Multi-Model",items:["Claude — Main conversation + implementation","Codex — Algorithm analysis + code review","Gemini — Prototyping + UI design","Vision / MiniMax — Specialized scenarios"]},skills:{title:"42 Skills (9 Categories)",items:["Search: ace-tool · rg · fd · ast-grep · exa","Analysis: codemap · har-to-vue · improve-skill","Docs: workhub · deepwiki · knowledge-base","Platform: evolution · mcp-to-skill · crew"]},agents:{title:"25+ Subagents",items:["Recon: scout · analyze · codemap · researcher","Build: worker · planner · brainstormer","Review: reviewer · security-reviewer · simplifier","Crew: planner · worker · reviewer · plan-sync"]},security:{title:"5 Security Layers",items:["Auth — timing-safe token comparison","ExecGuard — executable allowlist, fail-closed","SSRF Guard — DNS rebinding defense","Allowlist — pairing code approval"]}}},cta:{title:"Ready to Orchestrate?",description:"42 skills. 26 extensions. 25+ subagents. Multi-channel gateway. Mandatory workflow ensures code quality. Sandbox security protects your project.",primary:"Get Started",secondary:"View on GitHub"},footer:{description:"Autonomous AI orchestrator with mandatory 5-phase workflow, from context retrieval to audit delivery.",links:{product:"Product",resources:"Resources",community:"Community"},items:{features:"Features",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",docs:"Documentation",skills:"Skill Directory",changelog:"Changelog",github:"GitHub",issues:"Issues"},copyright:"© 2026 Pi Agent. Open source under MIT."}},ae={"zh-CN":pt,"en-US":ht},Ae="pi-agent-locale";class ut{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const t=localStorage.getItem(Ae);if(t&&ae[t]){this.currentLocale=t;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(ae[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(Ae,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(t=>t())}}t(e){const t=e.split(".");let i=ae[this.currentLocale];for(const r of t)if(i&&typeof i=="object"&&r in i)i=i[r];else return e;return typeof i=="string"?i:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const n=new ut;var mt=Object.defineProperty,gt=Object.getOwnPropertyDescriptor,te=(s,e,t,i)=>{for(var r=i>1?void 0:i?gt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&mt(e,t,r),r};const Se=[{key:"features",id:"features"},{key:"gateway",id:"gateway"},{key:"workflow",id:"workflow"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],ne="https://github.com/Dwsy/agent";let M=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=l`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 00-3.8 23.38c.6.11.82-.26.82-.58v-2.16c-3.34.73-4.04-1.61-4.04-1.61a3.18 3.18 0 00-1.33-1.76c-1.09-.74.08-.73.08-.73a2.52 2.52 0 011.84 1.24 2.56 2.56 0 003.5 1 2.56 2.56 0 01.76-1.6c-2.67-.3-5.47-1.33-5.47-5.93a4.64 4.64 0 011.24-3.22 4.3 4.3 0 01.12-3.18s1-.32 3.3 1.23a11.38 11.38 0 016 0c2.28-1.55 3.28-1.23 3.28-1.23a4.3 4.3 0 01.12 3.18 4.64 4.64 0 011.23 3.22c0 4.61-2.81 5.63-5.48 5.92a2.86 2.86 0 01.82 2.22v3.29c0 .32.21.7.82.58A12 12 0 0012 .3"/></svg>`,this._burgerIcon=l`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${this.menuOpen?l`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`:l`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var s,e;super.disconnectedCallback(),(s=this._unsub)==null||s.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const s=new Map;this._io=new IntersectionObserver(e=>{for(const r of e)r.isIntersecting?s.set(r.target.id,r.intersectionRatio):s.delete(r.target.id);let t="",i=0;s.forEach((r,o)=>{r>i&&(i=r,t=o)}),t!==this.activeId&&(this.activeId=t)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of Se){const t=document.getElementById(e.id);t&&this._io.observe(t)}})}t(s){return n.t(s)}_toggleLocale(){n.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const s=Se.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return l`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-pi">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>
        <div class="links">
          ${s.map(e=>l`<a href="#${e.id}" class="link" ?active=${this.activeId===e.id}>${e.label}</a>`)}
        </div>
        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale} aria-label="Switch language">
            ${this.locale==="zh-CN"?"EN":"中文"}
          </button>
          <a href=${ne} target="_blank" rel="noopener" class="gh-btn" aria-label="GitHub">${this._ghIcon}</a>
          <a href=${ne} class="cta">${this.t("navbar.cta")}</a>
          <button class="burger" @click=${this._toggleMenu} aria-label="Menu">${this._burgerIcon}</button>
        </div>
      </nav>
      <div class="mobile" ?open=${this.menuOpen}>
        ${s.map(e=>l`<a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>${e.label}</a>`)}
        <a href=${ne} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
      </div>
    `}};M.styles=v`
    :host { display: block; position: fixed; top: 0.75rem; left: 0.75rem; right: 0.75rem; z-index: 1000; }

    .nav {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.65rem 1.25rem;
      background: rgba(10,15,30,0.85);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(51,65,85,0.4);
      border-radius: 0.75rem;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      transition: background 0.3s, box-shadow 0.3s;
    }
    :host([scrolled]) .nav {
      background: rgba(10,15,30,0.96);
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    }

    .logo { display: flex; align-items: center; gap: 0.5rem; text-decoration: none; }
    .logo-pi {
      width: 2rem; height: 2rem; border-radius: 0.5rem;
      background: linear-gradient(135deg, #2563EB, #8B5CF6);
      display: grid; place-items: center;
      font: 700 1.1rem/1 'Space Grotesk', sans-serif; color: #fff;
    }
    .logo-text { font: 700 1.15rem/1 'Space Grotesk', sans-serif; color: #F1F5F9; }

    .links { display: flex; align-items: center; gap: 1.25rem; }
    .link {
      color: #94A3B8; text-decoration: none; font: 500 0.84rem/1 'DM Sans', sans-serif;
      transition: color 0.2s; position: relative; padding: 0.25rem 0;
    }
    .link:hover { color: #60A5FA; }
    .link[active] { color: #60A5FA; }
    .link[active]::after {
      content: ''; position: absolute; bottom: -2px; left: 20%; right: 20%;
      height: 2px; background: #2563EB; border-radius: 1px;
    }

    .actions { display: flex; align-items: center; gap: 0.6rem; }

    .lang-btn, .gh-btn {
      padding: 0.35rem 0.65rem; background: rgba(30,41,59,0.6);
      color: #94A3B8; border: 1px solid rgba(51,65,85,0.5);
      border-radius: 0.375rem; cursor: pointer; transition: all 0.2s;
      font: 500 0.78rem/1 'DM Sans', sans-serif; display: grid; place-items: center;
    }
    .lang-btn:hover, .gh-btn:hover { color: #60A5FA; border-color: rgba(96,165,250,0.4); }
    .gh-btn { padding: 0.35rem; }
    .gh-btn svg { display: block; }

    .cta {
      padding: 0.45rem 1rem; background: linear-gradient(135deg, #2563EB, #3B82F6);
      color: #fff; border: none; border-radius: 0.375rem;
      font: 600 0.8rem/1 'DM Sans', sans-serif; text-decoration: none;
      cursor: pointer; transition: box-shadow 0.2s;
    }
    .cta:hover { box-shadow: 0 4px 16px rgba(37,99,235,0.45); }

    .burger { display: none; background: none; border: none; color: #94A3B8; cursor: pointer; padding: 0.2rem; }

    .mobile { display: none; position: absolute; top: calc(100% + 0.5rem); left: 0; right: 0;
      background: rgba(10,15,30,0.96); backdrop-filter: blur(18px);
      border: 1px solid rgba(51,65,85,0.4); border-radius: 0.75rem;
      padding: 0.75rem; flex-direction: column; gap: 0.25rem;
    }
    .mobile[open] { display: flex; }
    .m-link {
      color: #94A3B8; text-decoration: none; font: 500 0.88rem/1 'DM Sans', sans-serif;
      padding: 0.6rem 0.75rem; border-radius: 0.375rem; transition: background 0.15s, color 0.15s;
    }
    .m-link:hover, .m-link[active] { background: rgba(30,41,59,0.6); color: #60A5FA; }

    @media (max-width: 768px) {
      .links, .cta { display: none; }
      .burger { display: block; }
    }
  `;te([m()],M.prototype,"locale",2);te([m()],M.prototype,"menuOpen",2);te([m()],M.prototype,"activeId",2);M=te([b("pi-navbar")],M);var ft=Object.defineProperty,bt=Object.getOwnPropertyDescriptor,ze=(s,e,t,i)=>{for(var r=i>1?void 0:i?bt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&ft(e,t,r),r};let W=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}render(){const s=n.t.bind(n);return l`
      <section class="hero">
        <div class="hero-content">
          <span class="badge">
            <span class="badge-dot"></span>
            ${s("hero.badge")}
          </span>
          <h1>
            ${s("hero.title")}<br />
            <span class="gradient">${s("hero.subtitle")}</span>
          </h1>
          <p class="description">${s("hero.description")}</p>

          <div class="stats-bar">
            <div class="stat-item">
              <div class="stat-value">${s("hero.stats.skills")}</div>
              <div class="stat-label">${s("hero.stats.skillsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${s("hero.stats.extensions")}</div>
              <div class="stat-label">${s("hero.stats.extensionsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${s("hero.stats.subagents")}</div>
              <div class="stat-label">${s("hero.stats.subagentsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${s("hero.stats.channels")}</div>
              <div class="stat-label">${s("hero.stats.channelsLabel")}</div>
            </div>
          </div>

          <div class="cta-buttons">
            <a href="#get-started" class="cta-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              ${s("hero.ctas.primary")}
            </a>
            <a href="#workflow" class="cta-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              ${s("hero.ctas.secondary")}
            </a>
          </div>

          <!-- Terminal demo -->
          <div class="terminal-preview">
            <div class="terminal-header">
              <span class="terminal-dot dot-red"></span>
              <span class="terminal-dot dot-yellow"></span>
              <span class="terminal-dot dot-green"></span>
              <span class="terminal-title">pi agent</span>
            </div>
            <div class="terminal-body">
              <div class="terminal-line"><span class="terminal-prompt">❯</span> <span class="terminal-cmd">/scout authentication flow</span></div>
              <div class="terminal-output"><span class="terminal-phase">Phase 1</span> → ace-tool semantic search...</div>
              <div class="terminal-output terminal-success">✓ Found 4 files, 12 symbols, 3 call chains</div>
              <div class="terminal-line" style="margin-top:0.5rem"><span class="terminal-prompt">❯</span> <span class="terminal-cmd">/brainstorm caching strategy</span></div>
              <div class="terminal-output"><span class="terminal-phase">Phase 2</span> → Codex + Gemini cross-validation...</div>
              <div class="terminal-output terminal-success">✓ Issue created · 3 subtasks · EventStorming diagram</div>
            </div>
          </div>
        </div>
      </section>
    `}};W.styles=v`
    :host {
      display: block;
      width: 100%;
    }

    .hero {
      min-height: 92vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 5rem 1.5rem 4rem;
      background: linear-gradient(180deg, #0F172A 0%, #0A0F1E 100%);
      position: relative;
      overflow: hidden;
    }

    /* Ambient glow */
    .hero::before {
      content: "";
      position: absolute;
      top: -30%;
      left: 50%;
      transform: translateX(-50%);
      width: 140%;
      height: 80%;
      background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.07) 0%, rgba(139, 92, 246, 0.04) 40%, transparent 70%);
      animation: drift 12s ease-in-out infinite;
      pointer-events: none;
    }

    /* Grid pattern overlay */
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(51, 65, 85, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(51, 65, 85, 0.08) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 56rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1.25rem;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 9999px;
      color: #60A5FA;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 2rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.02em;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: #60A5FA;
      border-radius: 50%;
      animation: blink 2s ease-in-out infinite;
    }

    h1 {
      font-size: clamp(2.5rem, 5.5vw, 4.5rem);
      font-weight: 700;
      line-height: 1.08;
      margin-bottom: 1.5rem;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.02em;
    }

    h1 .gradient {
      background: linear-gradient(135deg, #60A5FA 0%, #A78BFA 50%, #F472B6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .description {
      font-size: 1.125rem;
      line-height: 1.75;
      color: #94A3B8;
      margin-bottom: 2.5rem;
      max-width: 42rem;
      margin-left: auto;
      margin-right: auto;
      font-family: "DM Sans", sans-serif;
    }

    /* Stats bar */
    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 2.5rem;
      margin-bottom: 3rem;
      flex-wrap: wrap;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: "DM Sans", sans-serif;
    }

    .stat-divider {
      width: 1px;
      height: 3rem;
      background: rgba(51, 65, 85, 0.5);
      align-self: center;
    }

    /* CTA buttons */
    .cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .cta-primary, .cta-secondary {
      padding: 0.875rem 2rem;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: "DM Sans", sans-serif;
      cursor: pointer;
      transition: all 0.2s ease-out;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .cta-primary {
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
    }

    .cta-primary:hover {
      box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
    }

    .cta-secondary {
      background: rgba(30, 41, 59, 0.6);
      color: #F1F5F9;
      border: 1px solid rgba(51, 65, 85, 0.6);
      backdrop-filter: blur(10px);
    }

    .cta-secondary:hover {
      border-color: rgba(96, 165, 250, 0.5);
      background: rgba(30, 41, 59, 0.9);
    }

    /* Terminal preview */
    .terminal-preview {
      margin-top: 3.5rem;
      max-width: 38rem;
      margin-left: auto;
      margin-right: auto;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 0.75rem;
      overflow: hidden;
      text-align: left;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: rgba(30, 41, 59, 0.6);
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .dot-red { background: #EF4444; }
    .dot-yellow { background: #F59E0B; }
    .dot-green { background: #22C55E; }

    .terminal-title {
      flex: 1;
      text-align: center;
      font-size: 0.75rem;
      color: #64748B;
      font-family: "JetBrains Mono", monospace;
    }

    .terminal-body {
      padding: 1.25rem;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.8rem;
      line-height: 1.8;
    }

    .terminal-line {
      display: flex;
      gap: 0.5rem;
    }

    .terminal-prompt {
      color: #22C55E;
      user-select: none;
    }

    .terminal-cmd {
      color: #60A5FA;
    }

    .terminal-output {
      color: #94A3B8;
      padding-left: 1.5rem;
    }

    .terminal-phase {
      color: #A78BFA;
    }

    .terminal-success {
      color: #22C55E;
    }

    @keyframes drift {
      0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
      50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero::before { animation: none; }
      .badge-dot { animation: none; }
    }

    @media (max-width: 768px) {
      .hero { padding: 3rem 1rem 2rem; min-height: auto; }
      h1 { font-size: 2rem; }
      .description { font-size: 1rem; }
      .stats-bar { gap: 1.5rem; }
      .stat-value { font-size: 1.5rem; }
      .stat-divider { display: none; }
      .cta-buttons { flex-direction: column; width: 100%; }
      .cta-primary, .cta-secondary { width: 100%; justify-content: center; }
      .terminal-preview { margin-top: 2rem; }
      .terminal-body { font-size: 0.7rem; padding: 1rem; }
    }
  `;ze([m()],W.prototype,"locale",2);W=ze([b("hero-section")],W);var vt=Object.defineProperty,yt=Object.getOwnPropertyDescriptor,Ie=(s,e,t,i)=>{for(var r=i>1?void 0:i?yt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&vt(e,t,r),r};const wt=[{key:"workflow",icon:"workflow",colorClass:"accent-blue",accentColor:"#2563EB",span2:!0,hasFeatures:!0,featureCount:4},{key:"skills",icon:"skills",colorClass:"accent-purple",accentColor:"#8B5CF6",span2:!1,hasFeatures:!1,featureCount:0},{key:"subagents",icon:"subagents",colorClass:"accent-green",accentColor:"#10B981",span2:!1,hasFeatures:!1,featureCount:0},{key:"search",icon:"search",colorClass:"accent-cyan",accentColor:"#22D3EE",span2:!1,hasFeatures:!1,featureCount:0},{key:"gateway",icon:"gateway",colorClass:"accent-orange",accentColor:"#F97316",span2:!1,hasFeatures:!1,featureCount:0},{key:"enterprise",icon:"enterprise",colorClass:"accent-pink",accentColor:"#EC4899",span2:!0,hasFeatures:!0,featureCount:4}];let q=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.id="features",this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var s,e;super.disconnectedCallback(),(s=this._unsub)==null||s.call(this),(e=this._io)==null||e.disconnect()}firstUpdated(){this._setupReveal()}_setupReveal(){var e;const s=(e=this.shadowRoot)==null?void 0:e.querySelectorAll(".card");s!=null&&s.length&&(this._io=new IntersectionObserver(t=>{t.forEach(i=>{if(i.isIntersecting){const r=i.target,o=Number(r.dataset.idx??0)*80;setTimeout(()=>r.classList.add("revealed"),o),this._io.unobserve(r)}})},{threshold:.15}),s.forEach(t=>this._io.observe(t)))}t(s){return n.t(s)}_icon(s){switch(s){case"workflow":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          <line x1="10" y1="6.5" x2="14" y2="6.5"/><line x1="6.5" y1="10" x2="6.5" y2="14"/>
        </svg>`;case"skills":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>`;case"subagents":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="3"/><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/>
          <line x1="12" y1="11" x2="5" y2="14.5"/><line x1="12" y1="11" x2="19" y2="14.5"/>
        </svg>`;case"search":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/>
          <line x1="10" y1="7" x2="10" y2="13"/><line x1="7" y1="10" x2="13" y2="10"/>
        </svg>`;case"gateway":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="6" rx="1.5"/><rect x="2" y="14" width="20" height="6" rx="1.5"/>
          <circle cx="6" cy="7" r="1" fill="currentColor"/><circle cx="6" cy="17" r="1" fill="currentColor"/>
        </svg>`;case"enterprise":return l`<svg width="${20}" height="${20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>`;default:return l``}}_iconColor(s){return{workflow:"blue",skills:"purple",subagents:"green",search:"cyan",gateway:"orange",enterprise:"pink"}[s]??"blue"}_renderCard(s,e){const t=`features.cards.${s.key}`;return l`
      <div
        class="card ${s.colorClass}${s.span2?" span2":""}"
        data-idx="${e}"
      >
        <div class="card-head">
          <div class="icon-box ${this._iconColor(s.key)}">
            ${this._icon(s.icon)}
          </div>
          <h3 class="card-title">${this.t(`${t}.title`)}</h3>
        </div>
        <p class="card-desc">${this.t(`${t}.description`)}</p>
        ${s.hasFeatures?l`<ul class="features">
              ${Array.from({length:s.featureCount},(i,r)=>l`<li>${this.t(`${t}.features.${r}`)}</li>`)}
            </ul>`:null}
      </div>
    `}render(){return this.locale,l`
      <section class="section">
        <div class="inner">
          <div class="header">
            <p class="label">${this.t("features.label")}</p>
            <h2 class="title">${this.t("features.title")}</h2>
            <p class="subtitle">${this.t("features.subtitle")}</p>
          </div>
          <div class="grid">
            ${wt.map((s,e)=>this._renderCard(s,e))}
          </div>
        </div>
      </section>
    `}};q.styles=v`
    :host { display: block; width: 100%; }

    .section {
      padding: 7rem 1.5rem;
      background: #0A0F1E;
      position: relative;
    }

    /* subtle grid texture */
    .section::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(51,65,85,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(51,65,85,0.06) 1px, transparent 1px);
      background-size: 48px 48px;
      pointer-events: none;
    }

    .inner { position: relative; z-index: 1; max-width: 72rem; margin: 0 auto; }

    /* ── header ── */
    .header { text-align: center; margin-bottom: 4rem; }

    .label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin: 0 0 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 38rem;
      margin: 0 auto;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    /* ── grid ── */
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    /* ── card ── */
    .card {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 1rem;
      padding: 1.75rem;
      position: relative;
      overflow: hidden;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
      /* scroll reveal initial state */
      opacity: 0;
      transform: translateY(24px);
    }

    .card.revealed {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }

    /* accent border-top */
    .card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 1rem 1rem 0 0;
    }

    .accent-blue::before   { background: linear-gradient(90deg, #2563EB, #60A5FA); }
    .accent-purple::before { background: linear-gradient(90deg, #8B5CF6, #A78BFA); }
    .accent-green::before  { background: linear-gradient(90deg, #10B981, #34D399); }
    .accent-cyan::before   { background: linear-gradient(90deg, #22D3EE, #67E8F9); }
    .accent-orange::before { background: linear-gradient(90deg, #F97316, #FB923C); }
    .accent-pink::before   { background: linear-gradient(90deg, #EC4899, #F472B6); }

    /* hover glow */
    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(96, 165, 250, 0.35);
    }
    .card.revealed:hover { transform: translateY(-2px); }

    .accent-blue:hover   { box-shadow: 0 4px 30px rgba(37, 99, 235, 0.12); }
    .accent-purple:hover { box-shadow: 0 4px 30px rgba(139, 92, 246, 0.12); }
    .accent-green:hover  { box-shadow: 0 4px 30px rgba(16, 185, 129, 0.12); }
    .accent-cyan:hover   { box-shadow: 0 4px 30px rgba(34, 211, 238, 0.12); }
    .accent-orange:hover { box-shadow: 0 4px 30px rgba(249, 115, 22, 0.12); }
    .accent-pink:hover   { box-shadow: 0 4px 30px rgba(236, 72, 153, 0.12); }

    .span2 { grid-column: span 2; }

    /* ── card internals ── */
    .card-head {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      margin-bottom: 0.875rem;
    }

    .icon-box {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 0.625rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .icon-box.blue   { background: rgba(37, 99, 235, 0.15); color: #60A5FA; }
    .icon-box.purple { background: rgba(139, 92, 246, 0.15); color: #A78BFA; }
    .icon-box.green  { background: rgba(16, 185, 129, 0.15); color: #34D399; }
    .icon-box.cyan   { background: rgba(34, 211, 238, 0.15); color: #67E8F9; }
    .icon-box.orange { background: rgba(249, 115, 22, 0.15); color: #FB923C; }
    .icon-box.pink   { background: rgba(236, 72, 153, 0.15); color: #F472B6; }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      margin: 0;
    }

    .card-desc {
      color: #94A3B8;
      line-height: 1.7;
      font-size: 0.9rem;
      margin: 0;
      font-family: "DM Sans", sans-serif;
    }

    .features {
      list-style: none;
      padding: 0;
      margin: 1rem 0 0;
    }

    .features li {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.375rem 0;
      color: #94A3B8;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
      line-height: 1.5;
    }

    .features li::before {
      content: "\u2192";
      color: #60A5FA;
      font-weight: 600;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* ── responsive ── */
    @media (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .section { padding: 4rem 1rem; }
      .grid { grid-template-columns: 1fr; gap: 1rem; }
      .span2 { grid-column: span 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; transition: none; }
      .card.revealed { transition: none; }
    }
  `;Ie([m()],q.prototype,"locale",2);q=Ie([b("bento-grid")],q);var xt=Object.defineProperty,$t=Object.getOwnPropertyDescriptor,Ge=(s,e,t,i)=>{for(var r=i>1?void 0:i?$t(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&xt(e,t,r),r};const kt=["channels","pipeline","plugins","runtime","security"],_t={channels:{from:"#2563EB",to:"#60A5FA"},pipeline:{from:"#8B5CF6",to:"#A78BFA"},plugins:{from:"#22D3EE",to:"#67E8F9"},runtime:{from:"#10B981",to:"#34D399"},security:{from:"#F97316",to:"#FB923C"}},At=["modules","hooks","apis","security"];let V=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.id="gateway",this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var s,e;super.disconnectedCallback(),(s=this._unsub)==null||s.call(this),(e=this._io)==null||e.disconnect()}firstUpdated(){this._setupReveal()}_setupReveal(){var e;const s=(e=this.shadowRoot)==null?void 0:e.querySelectorAll(".layers, .right-col, .layer");s!=null&&s.length&&(this._io=new IntersectionObserver(t=>{t.forEach(i=>{if(i.isIntersecting){const r=i.target,o=Number(r.dataset.delay??0);setTimeout(()=>r.classList.add("revealed"),o),this._io.unobserve(r)}})},{threshold:.1}),s.forEach(t=>this._io.observe(t)))}t(s){return n.t(s)}_renderLayers(){const s=[];return kt.forEach((e,t)=>{t>0&&s.push(l`<div class="connector"></div>`);const i=_t[e];s.push(l`
        <div class="layer" data-delay="${t*100}">
          <div class="layer-bar" style="background: linear-gradient(180deg, ${i.from}, ${i.to})"></div>
          <div class="layer-num" style="background: ${i.from}">${t+1}</div>
          <div class="layer-text">
            <p class="layer-title">${this.t(`gateway.layers.${e}.title`)}</p>
            <p class="layer-desc">${this.t(`gateway.layers.${e}.desc`)}</p>
          </div>
        </div>
      `)}),s}_checkSvg(){return l`<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`}render(){return this.locale,l`
      <section class="section">
        <div class="inner">
          <div class="header">
            <p class="label">${this.t("gateway.label")}</p>
            <h2 class="title">${this.t("gateway.title")}</h2>
            <p class="subtitle">${this.t("gateway.subtitle")}</p>
          </div>

          <div class="columns">
            <!-- LEFT: Architecture layers -->
            <div class="layers">
              ${this._renderLayers()}
            </div>

            <!-- RIGHT: Stats + Highlights -->
            <div class="right-col">
              <div class="stats-grid">
                ${At.map(s=>l`
                  <div class="stat-card">
                    <p class="stat-value">${this.t(`gateway.stats.${s}.value`)}</p>
                    <p class="stat-label">${this.t(`gateway.stats.${s}.label`)}</p>
                  </div>
                `)}
              </div>

              <p class="highlights-title">Highlights</p>
              <ul class="highlights">
                ${Array.from({length:6},(s,e)=>l`
                  <li>${this._checkSvg()} ${this.t(`gateway.highlights.${e}`)}</li>
                `)}
              </ul>
            </div>
          </div>
        </div>
      </section>
    `}};V.styles=v`
    :host { display: block; width: 100%; }

    .section {
      padding: 7rem 1.5rem;
      background: #0F172A;
      position: relative;
    }

    .inner { max-width: 72rem; margin: 0 auto; position: relative; z-index: 1; }

    /* ── header ── */
    .header { text-align: center; margin-bottom: 4rem; }

    .label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin: 0 0 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 42rem;
      margin: 0 auto;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    /* ── two-column layout ── */
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: start;
    }

    /* ── LEFT: layer diagram ── */
    .layers {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      /* scroll reveal */
      opacity: 0;
      transform: translateX(-24px);
    }

    .layers.revealed {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }

    .layer {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.4);
      position: relative;
      overflow: hidden;
      /* stagger */
      opacity: 0;
      transform: translateY(12px);
    }

    .layer.revealed {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.4s ease, transform 0.4s ease;
    }

    /* colored left bar */
    .layer-bar {
      width: 4px;
      height: 100%;
      border-radius: 2px;
      position: absolute;
      left: 0;
      top: 0;
    }

    .layer-num {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      flex-shrink: 0;
      color: #fff;
    }

    .layer-text { flex: 1; min-width: 0; }

    .layer-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      margin: 0 0 0.2rem;
    }

    .layer-desc {
      font-size: 0.8rem;
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
      margin: 0;
      line-height: 1.5;
    }

    /* connector line between layers */
    .connector {
      width: 2px;
      height: 0.75rem;
      background: rgba(51, 65, 85, 0.6);
      margin: -0.375rem 0 -0.375rem 2.1rem;
      border-radius: 1px;
    }

    /* ── RIGHT: stats + highlights ── */
    .right-col {
      opacity: 0;
      transform: translateX(24px);
    }

    .right-col.revealed {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.75rem;
      padding: 1.25rem;
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      background: linear-gradient(135deg, #60A5FA, #A78BFA);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
      margin: 0.25rem 0 0;
    }

    /* highlights */
    .highlights-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .highlights {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .highlights li {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem 0;
      color: #CBD5E1;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
      line-height: 1.55;
      border-bottom: 1px solid rgba(51, 65, 85, 0.25);
    }

    .highlights li:last-child { border-bottom: none; }

    .check-icon {
      width: 1.125rem;
      height: 1.125rem;
      flex-shrink: 0;
      margin-top: 2px;
      color: #10B981;
    }

    /* ── responsive ── */
    @media (max-width: 768px) {
      .section { padding: 4rem 1rem; }
      .columns {
        grid-template-columns: 1fr;
        gap: 2.5rem;
      }
      .connector { margin-left: 2.1rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      .layers, .right-col, .layer {
        opacity: 1;
        transform: none;
        transition: none;
      }
      .layers.revealed, .right-col.revealed, .layer.revealed {
        transition: none;
      }
    }
  `;Ge([m()],V.prototype,"locale",2);V=Ge([b("gateway-section")],V);var St=Object.defineProperty,Ct=Object.getOwnPropertyDescriptor,Re=(s,e,t,i)=>{for(var r=i>1?void 0:i?Ct(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&St(e,t,r),r};let K=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.id="workflow",n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}disconnectedCallback(){var s;super.disconnectedCallback(),(s=this.observer)==null||s.disconnect()}firstUpdated(){this.observer=new IntersectionObserver(e=>{e.forEach(t=>{if(t.isIntersecting){const i=t.target,r=parseInt(i.dataset.delay||"0",10);setTimeout(()=>i.classList.add("visible"),r),this.observer.unobserve(i)}})},{threshold:.15,rootMargin:"0px 0px -40px 0px"}),this.renderRoot.querySelectorAll(".phase, .complexity").forEach((e,t)=>{e.dataset.delay=String(t*100),this.observer.observe(e)})}render(){const s=n.t.bind(n),e=[1,2,3,4,5],t=["l1","l2","l3","l4"];return l`
      <section class="workflow-section">
        <div class="section-header">
          <p class="section-label">${s("workflow.label")}</p>
          <h2 class="section-title">${s("workflow.title")}</h2>
          <p class="section-subtitle">${s("workflow.subtitle")}</p>
        </div>

        <div class="timeline">
          ${e.map(i=>l`
            <div class="phase p${i}">
              <div class="phase-num">${i}</div>
              <div class="phase-card">
                <div class="phase-head">
                  <h3 class="phase-title">${s(`workflow.phases.phase${i}.title`)}</h3>
                  <span class="phase-tool">${s(`workflow.phases.phase${i}.tool`)}</span>
                </div>
                <p class="phase-desc">${s(`workflow.phases.phase${i}.description`)}</p>
              </div>
            </div>
          `)}
        </div>

        <div class="complexity">
          <h3 class="complexity-title">${s("workflow.complexity.title")}</h3>
          <div class="levels">
            ${t.map(i=>l`
              <div class="level level-${i}">
                <span class="level-label">${s(`workflow.complexity.${i}.label`)}</span>
                <span class="level-desc">${s(`workflow.complexity.${i}.desc`)}</span>
                <div class="level-bar"><div class="level-bar-fill"></div></div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}};K.styles=v`
    :host { display: block; }

    .workflow-section {
      padding: 6rem 1.5rem;
      background: #0A0F1E;
    }

    .section-header { text-align: center; margin-bottom: 4rem; }
    .section-label { font-size: 0.8rem; font-weight: 600; color: #60A5FA; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; font-family: "Space Grotesk", sans-serif; }
    .section-title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .section-subtitle { font-size: 1.05rem; color: #94A3B8; max-width: 36rem; margin: 0 auto; font-family: "DM Sans", sans-serif; }

    /* Timeline */
    .timeline {
      max-width: 48rem;
      margin: 0 auto;
      position: relative;
    }

    .timeline::before {
      content: "";
      position: absolute;
      left: 1.5rem;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, #2563EB 0%, #8B5CF6 50%, #22C55E 100%);
      opacity: 0.35;
    }

    .phase {
      display: flex;
      gap: 1.5rem;
      padding-bottom: 1.75rem;
      position: relative;
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }

    .phase.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .phase:last-child { padding-bottom: 0; }

    /* Numbered circle with gradient border */
    .phase-num { flex-shrink: 0; width: 3rem; height: 3rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; position: relative; z-index: 1; background: #0A0F1E; }
    .phase-num::before { content: ""; position: absolute; inset: -2px; border-radius: 50%; z-index: -1; }
    .p1 .phase-num::before { background: linear-gradient(135deg, #2563EB, #3B82F6); }
    .p2 .phase-num::before { background: linear-gradient(135deg, #7C3AED, #8B5CF6); }
    .p3 .phase-num::before { background: linear-gradient(135deg, #D97706, #F59E0B); }
    .p4 .phase-num::before { background: linear-gradient(135deg, #059669, #10B981); }
    .p5 .phase-num::before { background: linear-gradient(135deg, #DC2626, #EF4444); }

    .phase-card { flex: 1; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 0.75rem; padding: 1.25rem 1.5rem; transition: border-color 0.2s; }
    .phase-card:hover { border-color: rgba(96, 165, 250, 0.4); }
    .phase-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem; }
    .phase-title { font-size: 1.05rem; font-weight: 600; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; }
    .phase-tool { padding: 0.25rem 0.625rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 0.25rem; font-size: 0.7rem; font-weight: 500; color: #60A5FA; font-family: "JetBrains Mono", monospace; white-space: nowrap; }
    .phase-desc { color: #94A3B8; font-size: 0.875rem; line-height: 1.65; font-family: "DM Sans", sans-serif; }

    /* Complexity routing */
    .complexity { max-width: 48rem; margin: 3.5rem auto 0; background: rgba(30, 41, 59, 0.35); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 1rem; padding: 1.75rem; opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease-out, transform 0.5s ease-out; }
    .complexity.visible { opacity: 1; transform: translateY(0); }
    .complexity-title { font-size: 1.05rem; font-weight: 600; color: #F1F5F9; margin-bottom: 1.25rem; font-family: "Space Grotesk", sans-serif; }

    .levels {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .level { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; background: rgba(15, 23, 42, 0.5); border-radius: 0.5rem; position: relative; overflow: hidden; }
    .level::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
    .level-l1::before { background: #22C55E; }
    .level-l2::before { background: #F59E0B; }
    .level-l3::before { background: #F97316; }
    .level-l4::before { background: #EF4444; }
    .level-label { font-size: 0.8rem; font-weight: 700; font-family: "Space Grotesk", sans-serif; min-width: 5.5rem; flex-shrink: 0; }
    .level-l1 .level-label { color: #4ADE80; }
    .level-l2 .level-label { color: #FBBF24; }
    .level-l3 .level-label { color: #FB923C; }
    .level-l4 .level-label { color: #F87171; }
    .level-desc { font-size: 0.8rem; color: #94A3B8; font-family: "DM Sans", sans-serif; line-height: 1.4; }
    .level-bar { margin-left: auto; width: 4rem; height: 4px; border-radius: 2px; background: rgba(51, 65, 85, 0.4); flex-shrink: 0; overflow: hidden; }
    .level-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease-out; }
    .level-l1 .level-bar-fill { background: #22C55E; width: 25%; }
    .level-l2 .level-bar-fill { background: #F59E0B; width: 50%; }
    .level-l3 .level-bar-fill { background: #F97316; width: 75%; }
    .level-l4 .level-bar-fill { background: #EF4444; width: 100%; }

    @media (prefers-reduced-motion: reduce) {
      .phase, .complexity { opacity: 1; transform: none; transition: none; }
      .phase-card { transition: none; }
    }

    @media (max-width: 768px) {
      .workflow-section { padding: 3.5rem 1rem; }
      .timeline::before { left: 1.125rem; }
      .phase-num { width: 2.25rem; height: 2.25rem; font-size: 0.9rem; }
      .phase { gap: 1rem; }
      .level { flex-wrap: wrap; gap: 0.5rem; }
      .level-bar { width: 100%; margin-left: 0; }
    }
  `;Re([m()],K.prototype,"locale",2);K=Re([b("workflow-section")],K);var Et=Object.defineProperty,Ft=Object.getOwnPropertyDescriptor,Te=(s,e,t,i)=>{for(var r=i>1?void 0:i?Ft(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Et(e,t,r),r};const Pt={"Multi-Agent":"#2563EB",Delegation:"#8B5CF6",Automation:"#F97316",Memory:"#10B981",Safety:"#EF4444",DX:"#22D3EE",Fun:"#F472B6",多代理:"#2563EB",委派:"#8B5CF6",自动化:"#F97316",记忆:"#10B981",安全:"#EF4444",体验:"#22D3EE",开发体验:"#22D3EE",娱乐:"#F472B6",趣味:"#F472B6"},Ot=["subagentOrch","interactiveShell","loop","rolePersona","planMode","safetyGates","outputStyles","games"];let X=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.id="extensions",n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}disconnectedCallback(){var s;super.disconnectedCallback(),(s=this.observer)==null||s.disconnect()}firstUpdated(){this.observer=new IntersectionObserver(s=>{s.forEach(e=>{if(e.isIntersecting){const t=e.target,i=parseInt(t.dataset.delay||"0",10);setTimeout(()=>t.classList.add("visible"),i),this.observer.unobserve(t)}})},{threshold:.1,rootMargin:"0px 0px -30px 0px"}),this.renderRoot.querySelectorAll(".card").forEach((s,e)=>{s.dataset.delay=String(e*80),this.observer.observe(s)})}tagColor(s){return Pt[s]||"#64748B"}render(){const s=n.t.bind(n);return l`
      <section class="ext-section">
        <div class="section-header">
          <p class="section-label">${s("extensions.label")}</p>
          <h2 class="section-title">${s("extensions.title")}</h2>
          <p class="section-subtitle">${s("extensions.subtitle")}</p>
        </div>
        <div class="grid">
          ${Ot.map(e=>{const t=s(`extensions.cards.${e}.tag`),i=this.tagColor(t);return l`
              <div class="card" style="--glow-color: ${i}40">
                <span class="tag" style="background: ${i}">${t}</span>
                <h3 class="card-title">${s(`extensions.cards.${e}.title`)}</h3>
                <p class="card-desc">${s(`extensions.cards.${e}.description`)}</p>
              </div>
            `})}
        </div>
      </section>
    `}};X.styles=v`
    :host { display: block; }

    .ext-section {
      padding: 6rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #A78BFA;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
    }

    .card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.5rem;
      transition: border-color 0.25s, box-shadow 0.25s;
      position: relative;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.45s ease-out, transform 0.45s ease-out,
                  border-color 0.25s, box-shadow 0.25s;
    }

    .card.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .card:hover {
      border-color: var(--glow-color, rgba(167, 139, 250, 0.45));
      box-shadow: 0 0 24px -4px var(--glow-color, rgba(167, 139, 250, 0.15));
    }

    /* Top gradient line */
    .card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--glow-color, rgba(167, 139, 250, 0.3));
      opacity: 0;
      transition: opacity 0.25s;
    }

    .card:hover::before { opacity: 1; }

    .tag {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.65rem;
      font-weight: 600;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.03em;
      margin-bottom: 0.75rem;
      color: white;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.5rem;
      font-family: "Space Grotesk", sans-serif;
      line-height: 1.3;
    }

    .card-desc {
      color: #94A3B8;
      font-size: 0.825rem;
      line-height: 1.65;
      font-family: "DM Sans", sans-serif;
    }

    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; transition: none; }
    }

    @media (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .ext-section { padding: 3.5rem 1rem; }
      .grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;Te([m()],X.prototype,"locale",2);X=Te([b("extensions-section")],X);var Mt=Object.defineProperty,Dt=Object.getOwnPropertyDescriptor,ue=(s,e,t,i)=>{for(var r=i>1?void 0:i?Dt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Mt(e,t,r),r};const Bt=["multiModel","multiAgent","skillSystem","extensionSystem","gateway","safetyGates","memorySystem","mandatoryWorkflow","openSource"],Ce=["pi","claudeCode","cursor","aider"];let R=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this._visible=!1}connectedCallback(){super.connectedCallback(),this.id="comparison",this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()}),this._observer=new IntersectionObserver(([s])=>{var e;s.isIntersecting&&(this._visible=!0,(e=this._observer)==null||e.disconnect())},{threshold:.15}),this._observer.observe(this)}disconnectedCallback(){var s,e;super.disconnectedCallback(),(s=this._unsub)==null||s.call(this),(e=this._observer)==null||e.disconnect()}_cell(s){return s?l`<span class="check">✓</span>`:l`<span class="dash">—</span>`}render(){const s=n.t.bind(n),e={pi:[!0,!0,!0,!0,!0,!0,!0,!0,!0],claudeCode:[!1,!1,!1,!0,!1,!1,!1,!1,!1],cursor:[!0,!1,!1,!0,!1,!1,!1,!1,!1],aider:[!0,!1,!1,!1,!1,!1,!1,!1,!0]};return l`
      <section class="cmp-section">
        <div class="section-header reveal ${this._visible?"visible":""}">
          <p class="section-label">${s("comparison.label")}</p>
          <h2 class="section-title">${s("comparison.title")}</h2>
          <p class="section-subtitle">${s("comparison.subtitle")}</p>
        </div>
        <div class="table-wrap reveal ${this._visible?"visible":""}">
          <table role="grid" aria-label="${s("comparison.title")}">
            <thead>
              <tr>
                <th class="feature-col"></th>
                ${Ce.map(t=>l`
                  <th class="${t==="pi"?"pi-col":""}">${s(`comparison.tools.${t}`)}</th>
                `)}
              </tr>
            </thead>
            <tbody>
              ${Bt.map((t,i)=>l`
                <tr>
                  <td class="feature-col">${s(`comparison.features.${t}`)}</td>
                  ${Ce.map(r=>l`
                    <td class="${r==="pi"?"pi-col":""}">${this._cell(e[r][i])}</td>
                  `)}
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </section>
    `}};R.styles=v`
    :host { display: block; }

    .cmp-section {
      padding: 6rem 1.5rem;
      background: #0A0F1E;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #22D3EE;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .table-wrap {
      max-width: 56rem;
      margin: 0 auto;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 1rem;
      border: 1px solid rgba(51, 65, 85, 0.4);
      background: rgba(30, 41, 59, 0.25);
    }

    table {
      width: 100%;
      min-width: 36rem;
      border-collapse: collapse;
      font-family: "DM Sans", sans-serif;
    }

    th, td {
      padding: 0.875rem 1.25rem;
      text-align: center;
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
      font-size: 0.9rem;
    }

    th {
      font-family: "Space Grotesk", sans-serif;
      font-weight: 600;
      color: #94A3B8;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: rgba(15, 23, 42, 0.6);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    th.pi-col, td.pi-col {
      background: rgba(6, 182, 212, 0.08);
      position: sticky;
      left: 0;
      z-index: 2;
    }

    th.pi-col {
      color: #22D3EE;
      z-index: 3;
    }

    th.feature-col, td.feature-col {
      text-align: left;
      color: #CBD5E1;
      font-weight: 500;
      position: sticky;
      left: 0;
      background: rgba(15, 23, 42, 0.85);
      z-index: 2;
      min-width: 10rem;
    }

    th.feature-col { z-index: 3; }

    tr:last-child td { border-bottom: none; }

    tr:hover td { background: rgba(51, 65, 85, 0.15); }
    tr:hover td.pi-col { background: rgba(6, 182, 212, 0.12); }
    tr:hover td.feature-col { background: rgba(15, 23, 42, 0.9); }

    .check { color: #4ADE80; font-weight: 700; font-size: 1rem; }
    .dash  { color: #475569; font-size: 1rem; }

    .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }

    @media (prefers-reduced-motion: reduce) {
      .reveal { opacity: 1; transform: none; transition: none; }
    }

    @media (max-width: 768px) {
      .cmp-section { padding: 3.5rem 1rem; }
      th, td { padding: 0.625rem 0.75rem; font-size: 0.8rem; }
    }
  `;ue([m()],R.prototype,"locale",2);ue([m()],R.prototype,"_visible",2);R=ue([b("comparison-section")],R);var Lt=Object.defineProperty,zt=Object.getOwnPropertyDescriptor,U=(s,e,t,i)=>{for(var r=i>1?void 0:i?zt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Lt(e,t,r),r};const It=["scout","crew","gateway","selfImprove"];let E=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this._headerVisible=!1,this._cardVisible=[!1,!1,!1,!1],this._copiedIdx=-1}connectedCallback(){super.connectedCallback(),this.id="use-cases",this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()}),this._observer=new IntersectionObserver(s=>{var e;for(const t of s){if(!t.isIntersecting)continue;const i=t.target,r=i.dataset.idx;if(r==="header")this._headerVisible=!0;else if(r!==void 0){const o=[...this._cardVisible];o[Number(r)]=!0,this._cardVisible=o}(e=this._observer)==null||e.unobserve(i)}},{threshold:.15})}updated(){var t;const s=this.renderRoot,e=s.querySelector("[data-idx='header']");e&&!this._headerVisible&&((t=this._observer)==null||t.observe(e)),s.querySelectorAll(".uc-card").forEach(i=>{var o;const r=Number(i.dataset.idx);this._cardVisible[r]||(o=this._observer)==null||o.observe(i)})}disconnectedCallback(){var s,e;super.disconnectedCallback(),(s=this._unsub)==null||s.call(this),(e=this._observer)==null||e.disconnect()}_copy(s,e){navigator.clipboard.writeText(s).catch(()=>{}),this._copiedIdx=e,setTimeout(()=>{this._copiedIdx=-1},1500)}render(){const s=n.t.bind(n);return l`
      <section class="uc-section">
        <div class="section-header reveal-header ${this._headerVisible?"visible":""}" data-idx="header">
          <p class="section-label">${s("useCases.label")}</p>
          <h2 class="section-title">${s("useCases.title")}</h2>
          <p class="section-subtitle">${s("useCases.subtitle")}</p>
        </div>
        <div class="uc-grid">
          ${It.map((e,t)=>{const i=s(`useCases.cases.${e}.command`);return l`
              <div class="uc-card ${this._cardVisible[t]?"visible":""}"
                   data-idx="${t}"
                   style="transition-delay: ${t*.1}s">
                <div class="uc-number">${String(t+1).padStart(2,"0")}</div>
                <h3 class="uc-title">${s(`useCases.cases.${e}.title`)}</h3>
                <p class="uc-description">${s(`useCases.cases.${e}.description`)}</p>
                <div class="uc-cmd-wrap">
                  <code class="uc-command">${i}</code>
                  <button class="copy-btn ${this._copiedIdx===t?"copied":""}"
                          @click=${()=>this._copy(i,t)}
                          aria-label="Copy command">
                    ${this._copiedIdx===t?"✓":"⧉"}
                  </button>
                </div>
              </div>
            `})}
        </div>
      </section>
    `}};E.styles=v`
    :host { display: block; }

    .uc-section {
      padding: 6rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #22D3EE;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .uc-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }

    .uc-card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 2rem;
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease, transform 0.5s ease, border-color 0.2s, box-shadow 0.2s;
    }

    .uc-card.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .uc-card:hover {
      border-color: rgba(34, 211, 238, 0.35);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
      transform: translateY(-4px);
    }

    .uc-card.visible:hover {
      transform: translateY(-4px);
    }

    .uc-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      background: rgba(6, 182, 212, 0.15);
      color: #22D3EE;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      margin-bottom: 1rem;
    }

    .uc-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .uc-description {
      color: #94A3B8;
      font-size: 0.9rem;
      line-height: 1.7;
      margin-bottom: 1rem;
      font-family: "DM Sans", sans-serif;
    }

    .uc-cmd-wrap {
      display: flex; align-items: center; gap: 0.5rem;
      background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.375rem; padding: 0.5rem 0.75rem;
    }

    .uc-command {
      flex: 1; font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
      color: #60A5FA; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .copy-btn {
      flex-shrink: 0; background: none; border: none; color: #475569;
      cursor: pointer; padding: 0.125rem; font-size: 0.85rem; line-height: 1; transition: color 0.15s;
    }
    .copy-btn:hover { color: #94A3B8; }
    .copy-btn.copied { color: #4ADE80; }

    .reveal-header {
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }

    .reveal-header.visible {
      opacity: 1;
      transform: translateY(0);
    }

    @media (prefers-reduced-motion: reduce) {
      .uc-card, .reveal-header { opacity: 1; transform: none; transition: none; }
      .uc-card:hover { transform: none; }
    }

    @media (max-width: 768px) {
      .uc-section { padding: 3.5rem 1rem; }
      .uc-grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;U([m()],E.prototype,"locale",2);U([m()],E.prototype,"_headerVisible",2);U([m()],E.prototype,"_cardVisible",2);U([m()],E.prototype,"_copiedIdx",2);E=U([b("use-cases-section")],E);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Gt={CHILD:2},Rt=s=>(...e)=>({_$litDirective$:s,values:e});class Tt{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,i){this._$Ct=e,this._$AM=t,this._$Ci=i}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class le extends Tt{constructor(e){if(super(e),this.it=u,e.type!==Gt.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===u||e==null)return this._t=void 0,this.it=e;if(e===C)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}le.directiveName="unsafeHTML",le.resultType=1;const Ut=Rt(le);var Nt=Object.defineProperty,jt=Object.getOwnPropertyDescriptor,Ue=(s,e,t,i)=>{for(var r=i>1?void 0:i?jt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Nt(e,t,r),r};const Ht=["models","skills","agents","security"],Yt={models:'<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="#60A5FA" stroke-width="1.5"/><circle cx="14" cy="14" r="4" fill="#2563EB"/><line x1="14" y1="4" x2="14" y2="10" stroke="#60A5FA" stroke-width="1.5"/><line x1="14" y1="18" x2="14" y2="24" stroke="#60A5FA" stroke-width="1.5"/></svg>',skills:'<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="4" width="20" height="20" rx="4" stroke="#A78BFA" stroke-width="1.5"/><rect x="9" y="9" width="10" height="10" rx="2" fill="#7C3AED"/></svg>',agents:'<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><polygon points="14,3 25,10 25,20 14,27 3,20 3,10" stroke="#34D399" stroke-width="1.5" fill="none"/><circle cx="14" cy="15" r="3.5" fill="#059669"/></svg>',security:'<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3L4 8v6c0 6.5 4.3 11.5 10 13 5.7-1.5 10-6.5 10-13V8L14 3z" stroke="#F59E0B" stroke-width="1.5" fill="none"/><rect x="11" y="12" width="6" height="5" rx="1" fill="#D97706"/></svg>'};let J=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.id="tech-specs",n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}disconnectedCallback(){var s;super.disconnectedCallback(),(s=this.observer)==null||s.disconnect()}firstUpdated(){this.observer=new IntersectionObserver(s=>s.forEach(e=>{if(e.isIntersecting){const t=e.target;setTimeout(()=>t.classList.add("visible"),parseInt(t.dataset.delay||"0",10)),this.observer.unobserve(t)}}),{threshold:.1,rootMargin:"0px 0px -30px 0px"}),this.renderRoot.querySelectorAll(".col").forEach((s,e)=>{s.dataset.delay=String(e*100),this.observer.observe(s)})}getItems(s){const e=`techSpecs.columns.${s}.items`,t=[];for(let i=0;i<4;i++){const r=n.t(`${e}.${i}`);r!==`${e}.${i}`&&t.push(r)}return t}render(){const s=n.t.bind(n);return l`
      <section class="section">
        <div class="header">
          <p class="label">${s("techSpecs.label")}</p>
          <h2 class="title">${s("techSpecs.title")}</h2>
          <p class="subtitle">${s("techSpecs.subtitle")}</p>
        </div>
        <div class="grid">
          ${Ht.map(e=>l`
            <div class="col">
              <div class="col-icon">${Ut(Yt[e])}</div>
              <h3 class="col-title">${s(`techSpecs.columns.${e}.title`)}</h3>
              <ul class="col-list">
                ${this.getItems(e).map(t=>l`<li>${t}</li>`)}
              </ul>
            </div>
          `)}
        </div>
      </section>
    `}};J.styles=v`
    :host { display: block; }
    .section { padding: 6rem 1.5rem; background: #0A0F1E; }
    .header { text-align: center; margin-bottom: 4rem; }
    .label { font-size: 0.8rem; font-weight: 600; color: #A78BFA; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; font-family: "Space Grotesk", sans-serif; }
    .title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .subtitle { font-size: 1.05rem; color: #94A3B8; max-width: 36rem; margin: 0 auto; font-family: "DM Sans", sans-serif; }
    .grid { max-width: 64rem; margin: 0 auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
    .col { background: #1E293B; border: 1px solid rgba(51,65,85,0.4); border-radius: 12px; padding: 2rem; opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .col.visible { opacity: 1; transform: translateY(0); }
    .col-icon { margin-bottom: 1rem; line-height: 0; }
    .col-title { font-size: 1.15rem; font-weight: 600; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; }
    .col-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .col-list li { font-size: 0.88rem; color: #94A3B8; line-height: 1.5; font-family: "DM Sans", sans-serif; padding-left: 1rem; position: relative; }
    .col-list li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 5px; height: 5px; border-radius: 50%; background: #2563EB; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  `;Ue([m()],J.prototype,"locale",2);J=Ue([b("tech-specs")],J);var Wt=Object.defineProperty,qt=Object.getOwnPropertyDescriptor,Ne=(s,e,t,i)=>{for(var r=i>1?void 0:i?qt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Wt(e,t,r),r};let Z=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}disconnectedCallback(){var s;super.disconnectedCallback(),(s=this.observer)==null||s.disconnect()}firstUpdated(){this.observer=new IntersectionObserver(e=>e.forEach(t=>{t.isIntersecting&&(t.target.classList.add("visible"),this.observer.unobserve(t.target))}),{threshold:.15});const s=this.renderRoot.querySelector(".reveal");s&&this.observer.observe(s)}render(){const s=n.t.bind(n);return l`
      <section class="cta">
        <div class="glow"></div>
        <div class="content reveal">
          <h2 class="title">${s("cta.title")}</h2>
          <p class="desc">${s("cta.description")}</p>
          <div class="buttons">
            <a class="btn btn-primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${s("cta.primary")}</a>
            <a class="btn btn-secondary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${s("cta.secondary")}</a>
          </div>
        </div>
      </section>
    `}};Z.styles=v`
    :host { display: block; }
    .cta { position: relative; padding: 6rem 1.5rem; text-align: center; background: linear-gradient(180deg, #0A0F1E 0%, #0F172A 50%, #0A0F1E 100%); overflow: hidden; }
    .glow { position: absolute; top: 50%; left: 50%; width: 600px; height: 600px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(139,92,246,0.06) 40%, transparent 70%); border-radius: 50%; pointer-events: none; animation: float 8s ease-in-out infinite; }
    @keyframes float { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -52%) scale(1.08); } }
    .content { position: relative; z-index: 1; max-width: 40rem; margin: 0 auto; }
    .title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1.25rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .desc { font-size: 1.05rem; color: #94A3B8; line-height: 1.7; margin-bottom: 2.5rem; font-family: "DM Sans", sans-serif; }
    .buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.85rem 2rem; border-radius: 8px; font-size: 0.95rem; font-weight: 600; font-family: "Space Grotesk", sans-serif; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
    .btn:hover { transform: translateY(-2px); }
    .btn-primary { background: #2563EB; color: #fff; border: none; box-shadow: 0 0 20px rgba(37,99,235,0.3); }
    .btn-primary:hover { box-shadow: 0 0 30px rgba(37,99,235,0.5); }
    .btn-secondary { background: transparent; color: #F1F5F9; border: 1px solid rgba(51,65,85,0.6); }
    .btn-secondary:hover { border-color: #94A3B8; }
    .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }
  `;Ne([m()],Z.prototype,"locale",2);Z=Ne([b("cta-section")],Z);var Vt=Object.defineProperty,Kt=Object.getOwnPropertyDescriptor,je=(s,e,t,i)=>{for(var r=i>1?void 0:i?Kt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=(i?a(e,t,r):a(r))||r);return i&&r&&Vt(e,t,r),r};const P="https://github.com/Dwsy/agent",Xt=[{key:"features",href:"#features"},{key:"gateway",href:"#gateway"},{key:"workflow",href:"#workflow"},{key:"extensions",href:"#extensions"}],Jt=[{key:"docs",href:P},{key:"skills",href:P},{key:"changelog",href:P}],Zt=[{key:"github",href:P},{key:"issues",href:`${P}/issues`}];let Q=class extends f{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),n.subscribe(()=>{this.locale=n.getCurrentLocale(),this.requestUpdate()})}renderLinks(s){const e=n.t.bind(n),t=i=>i.startsWith("http");return s.map(i=>l`
      <li><a href=${i.href} ?target=${t(i.href)?"_blank":void 0} ?rel=${t(i.href)?"noopener":void 0}>${e(`footer.items.${i.key}`)}</a></li>
    `)}render(){const s=n.t.bind(n);return l`
      <footer class="footer">
        <div class="inner">
          <div class="grid">
            <div>
              <div class="logo"><span class="logo-dot"></span> Pi Agent</div>
              <p class="brand-desc">${s("footer.description")}</p>
            </div>
            <div>
              <h4 class="col-title">${s("footer.links.product")}</h4>
              <ul class="links">${this.renderLinks(Xt)}</ul>
            </div>
            <div>
              <h4 class="col-title">${s("footer.links.resources")}</h4>
              <ul class="links">${this.renderLinks(Jt)}</ul>
            </div>
            <div>
              <h4 class="col-title">${s("footer.links.community")}</h4>
              <ul class="links">${this.renderLinks(Zt)}</ul>
            </div>
          </div>
          <div class="bottom">
            <span class="copyright">${s("footer.copyright")}</span>
            <div class="social">
              <a href=${P} target="_blank" rel="noopener" aria-label="GitHub">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    `}};Q.styles=v`
    :host { display: block; }
    .footer { background: #0A0F1E; border-top: 1px solid rgba(51,65,85,0.4); padding: 4rem 1.5rem 2rem; font-family: "DM Sans", sans-serif; }
    .inner { max-width: 64rem; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 3rem; }
    .brand-desc { font-size: 0.88rem; color: #718096; line-height: 1.6; max-width: 18rem; }
    .logo { font-size: 1.2rem; font-weight: 700; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
    .logo-dot { width: 8px; height: 8px; border-radius: 50%; background: #2563EB; }
    .col-title { font-size: 0.8rem; font-weight: 600; color: #F1F5F9; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; }
    .links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .links a { font-size: 0.88rem; color: #94A3B8; text-decoration: none; transition: color 0.2s; }
    .links a:hover { color: #F1F5F9; }
    .bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 2rem; border-top: 1px solid rgba(51,65,85,0.3); }
    .copyright { font-size: 0.8rem; color: #718096; }
    .social a { color: #718096; transition: color 0.2s; }
    .social a:hover { color: #F1F5F9; }
    .social svg { width: 20px; height: 20px; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; gap: 2rem; }
      .bottom { flex-direction: column; gap: 1rem; text-align: center; }
    }
  `;je([m()],Q.prototype,"locale",2);Q=je([b("pi-footer")],Q);var Qt=Object.getOwnPropertyDescriptor,es=(s,e,t,i)=>{for(var r=i>1?void 0:i?Qt(e,t):e,o=s.length-1,a;o>=0;o--)(a=s[o])&&(r=a(r)||r);return r};let Ee=class extends f{createRenderRoot(){return this}render(){return l`
      <pi-navbar></pi-navbar>
      <main id="main-content" style="padding-top:4.5rem">
        <hero-section></hero-section>
        <bento-grid></bento-grid>
        <gateway-section></gateway-section>
        <workflow-section></workflow-section>
        <extensions-section></extensions-section>
        <comparison-section></comparison-section>
        <use-cases-section></use-cases-section>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `}};Ee=es([b("pi-app")],Ee);Le(l`<pi-app></pi-app>`,document.getElementById("app"));
