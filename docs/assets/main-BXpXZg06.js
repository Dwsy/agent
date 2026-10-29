(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const n of s.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&o(n)}).observe(document,{childList:!0,subtree:!0});function t(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function o(r){if(r.ep)return;r.ep=!0;const s=t(r);fetch(r.href,s)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const G=globalThis,re=G.ShadowRoot&&(G.ShadyCSS===void 0||G.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,oe=Symbol(),ne=new WeakMap;let $e=class{constructor(e,t,o){if(this._$cssResult$=!0,o!==oe)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(re&&e===void 0){const o=t!==void 0&&t.length===1;o&&(e=ne.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),o&&ne.set(t,e))}return e}toString(){return this.cssText}};const ze=i=>new $e(typeof i=="string"?i:i+"",void 0,oe),k=(i,...e)=>{const t=i.length===1?i[0]:e.reduce((o,r,s)=>o+(n=>{if(n._$cssResult$===!0)return n.cssText;if(typeof n=="number")return n;throw Error("Value passed to 'css' function must be a 'css' function result: "+n+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+i[s+1],i[0]);return new $e(t,i,oe)},Re=(i,e)=>{if(re)i.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const o=document.createElement("style"),r=G.litNonce;r!==void 0&&o.setAttribute("nonce",r),o.textContent=t.cssText,i.appendChild(o)}},ae=re?i=>i:i=>i instanceof CSSStyleSheet?(e=>{let t="";for(const o of e.cssRules)t+=o.cssText;return ze(t)})(i):i;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Ie,defineProperty:Le,getOwnPropertyDescriptor:Me,getOwnPropertyNames:Ue,getOwnPropertySymbols:De,getPrototypeOf:Ge}=Object,y=globalThis,ce=y.trustedTypes,Ne=ce?ce.emptyScript:"",J=y.reactiveElementPolyfillSupport,z=(i,e)=>i,N={toAttribute(i,e){switch(e){case Boolean:i=i?Ne:null;break;case Object:case Array:i=i==null?i:JSON.stringify(i)}return i},fromAttribute(i,e){let t=i;switch(e){case Boolean:t=i!==null;break;case Number:t=i===null?null:Number(i);break;case Object:case Array:try{t=JSON.parse(i)}catch{t=null}}return t}},ie=(i,e)=>!Ie(i,e),le={attribute:!0,type:String,converter:N,reflect:!1,useDefault:!1,hasChanged:ie};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),y.litPropertyMetadata??(y.litPropertyMetadata=new WeakMap);let C=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=le){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const o=Symbol(),r=this.getPropertyDescriptor(e,o,t);r!==void 0&&Le(this.prototype,e,r)}}static getPropertyDescriptor(e,t,o){const{get:r,set:s}=Me(this.prototype,e)??{get(){return this[t]},set(n){this[t]=n}};return{get:r,set(n){const c=r==null?void 0:r.call(this);s==null||s.call(this,n),this.requestUpdate(e,c,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??le}static _$Ei(){if(this.hasOwnProperty(z("elementProperties")))return;const e=Ge(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(z("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(z("properties"))){const t=this.properties,o=[...Ue(t),...De(t)];for(const r of o)this.createProperty(r,t[r])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[o,r]of t)this.elementProperties.set(o,r)}this._$Eh=new Map;for(const[t,o]of this.elementProperties){const r=this._$Eu(t,o);r!==void 0&&this._$Eh.set(r,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const o=new Set(e.flat(1/0).reverse());for(const r of o)t.unshift(ae(r))}else e!==void 0&&t.push(ae(e));return t}static _$Eu(e,t){const o=t.attribute;return o===!1?void 0:typeof o=="string"?o:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(t=>t(this))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const o of t.keys())this.hasOwnProperty(o)&&(e.set(o,this[o]),delete this[o]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Re(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(t=>{var o;return(o=t.hostConnected)==null?void 0:o.call(t)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(t=>{var o;return(o=t.hostDisconnected)==null?void 0:o.call(t)})}attributeChangedCallback(e,t,o){this._$AK(e,o)}_$ET(e,t){var s;const o=this.constructor.elementProperties.get(e),r=this.constructor._$Eu(e,o);if(r!==void 0&&o.reflect===!0){const n=(((s=o.converter)==null?void 0:s.toAttribute)!==void 0?o.converter:N).toAttribute(t,o.type);this._$Em=e,n==null?this.removeAttribute(r):this.setAttribute(r,n),this._$Em=null}}_$AK(e,t){var s,n;const o=this.constructor,r=o._$Eh.get(e);if(r!==void 0&&this._$Em!==r){const c=o.getPropertyOptions(r),a=typeof c.converter=="function"?{fromAttribute:c.converter}:((s=c.converter)==null?void 0:s.fromAttribute)!==void 0?c.converter:N;this._$Em=r;const h=a.fromAttribute(t,c.type);this[r]=h??((n=this._$Ej)==null?void 0:n.get(r))??h,this._$Em=null}}requestUpdate(e,t,o,r=!1,s){var n;if(e!==void 0){const c=this.constructor;if(r===!1&&(s=this[e]),o??(o=c.getPropertyOptions(e)),!((o.hasChanged??ie)(s,t)||o.useDefault&&o.reflect&&s===((n=this._$Ej)==null?void 0:n.get(e))&&!this.hasAttribute(c._$Eu(e,o))))return;this.C(e,t,o)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:o,reflect:r,wrapped:s},n){o&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,n??t??this[e]),s!==!0||n!==void 0)||(this._$AL.has(e)||(this.hasUpdated||o||(t=void 0),this._$AL.set(e,t)),r===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var o;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[s,n]of this._$Ep)this[s]=n;this._$Ep=void 0}const r=this.constructor.elementProperties;if(r.size>0)for(const[s,n]of r){const{wrapped:c}=n,a=this[s];c!==!0||this._$AL.has(s)||a===void 0||this.C(s,void 0,n,a)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(o=this._$EO)==null||o.forEach(r=>{var s;return(s=r.hostUpdate)==null?void 0:s.call(r)}),this.update(t)):this._$EM()}catch(r){throw e=!1,this._$EM(),r}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach(o=>{var r;return(r=o.hostUpdated)==null?void 0:r.call(o)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(e){}firstUpdated(e){}};C.elementStyles=[],C.shadowRootOptions={mode:"open"},C[z("elementProperties")]=new Map,C[z("finalized")]=new Map,J==null||J({ReactiveElement:C}),(y.reactiveElementVersions??(y.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const R=globalThis,de=i=>i,H=R.trustedTypes,he=H?H.createPolicy("lit-html",{createHTML:i=>i}):void 0,xe="$lit$",v=`lit$${Math.random().toFixed(9).slice(2)}$`,_e="?"+v,He=`<${_e}>`,A=document,I=()=>A.createComment(""),L=i=>i===null||typeof i!="object"&&typeof i!="function",se=Array.isArray,je=i=>se(i)||typeof(i==null?void 0:i[Symbol.iterator])=="function",Y=`[ 	
\f\r]`,T=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,pe=/-->/g,me=/>/g,x=RegExp(`>|${Y}(?:([^\\s"'>=/]+)(${Y}*=${Y}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),ue=/'/g,ge=/"/g,Pe=/^(?:script|style|textarea|title)$/i,We=i=>(e,...t)=>({_$litType$:i,strings:e,values:t}),p=We(1),S=Symbol.for("lit-noChange"),m=Symbol.for("lit-nothing"),fe=new WeakMap,_=A.createTreeWalker(A,129);function Ae(i,e){if(!se(i)||!i.hasOwnProperty("raw"))throw Error("invalid template strings array");return he!==void 0?he.createHTML(e):e}const Be=(i,e)=>{const t=i.length-1,o=[];let r,s=e===2?"<svg>":e===3?"<math>":"",n=T;for(let c=0;c<t;c++){const a=i[c];let h,u,l=-1,f=0;for(;f<a.length&&(n.lastIndex=f,u=n.exec(a),u!==null);)f=n.lastIndex,n===T?u[1]==="!--"?n=pe:u[1]!==void 0?n=me:u[2]!==void 0?(Pe.test(u[2])&&(r=RegExp("</"+u[2],"g")),n=x):u[3]!==void 0&&(n=x):n===x?u[0]===">"?(n=r??T,l=-1):u[1]===void 0?l=-2:(l=n.lastIndex-u[2].length,h=u[1],n=u[3]===void 0?x:u[3]==='"'?ge:ue):n===ge||n===ue?n=x:n===pe||n===me?n=T:(n=x,r=void 0);const b=n===x&&i[c+1].startsWith("/>")?" ":"";s+=n===T?a+He:l>=0?(o.push(h),a.slice(0,l)+xe+a.slice(l)+v+b):a+v+(l===-2?c:b)}return[Ae(i,s+(i[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),o]};class M{constructor({strings:e,_$litType$:t},o){let r;this.parts=[];let s=0,n=0;const c=e.length-1,a=this.parts,[h,u]=Be(e,t);if(this.el=M.createElement(h,o),_.currentNode=this.el.content,t===2||t===3){const l=this.el.content.firstChild;l.replaceWith(...l.childNodes)}for(;(r=_.nextNode())!==null&&a.length<c;){if(r.nodeType===1){if(r.hasAttributes())for(const l of r.getAttributeNames())if(l.endsWith(xe)){const f=u[n++],b=r.getAttribute(l).split(v),D=/([.?@])?(.*)/.exec(f);a.push({type:1,index:s,name:D[2],strings:b,ctor:D[1]==="."?qe:D[1]==="?"?Fe:D[1]==="@"?Ke:F}),r.removeAttribute(l)}else l.startsWith(v)&&(a.push({type:6,index:s}),r.removeAttribute(l));if(Pe.test(r.tagName)){const l=r.textContent.split(v),f=l.length-1;if(f>0){r.textContent=H?H.emptyScript:"";for(let b=0;b<f;b++)r.append(l[b],I()),_.nextNode(),a.push({type:2,index:++s});r.append(l[f],I())}}}else if(r.nodeType===8)if(r.data===_e)a.push({type:2,index:s});else{let l=-1;for(;(l=r.data.indexOf(v,l+1))!==-1;)a.push({type:7,index:s}),l+=v.length-1}s++}}static createElement(e,t){const o=A.createElement("template");return o.innerHTML=e,o}}function E(i,e,t=i,o){var n,c;if(e===S)return e;let r=o!==void 0?(n=t._$Co)==null?void 0:n[o]:t._$Cl;const s=L(e)?void 0:e._$litDirective$;return(r==null?void 0:r.constructor)!==s&&((c=r==null?void 0:r._$AO)==null||c.call(r,!1),s===void 0?r=void 0:(r=new s(i),r._$AT(i,t,o)),o!==void 0?(t._$Co??(t._$Co=[]))[o]=r:t._$Cl=r),r!==void 0&&(e=E(i,r._$AS(i,e.values),r,o)),e}class Ve{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:o}=this._$AD,r=((e==null?void 0:e.creationScope)??A).importNode(t,!0);_.currentNode=r;let s=_.nextNode(),n=0,c=0,a=o[0];for(;a!==void 0;){if(n===a.index){let h;a.type===2?h=new U(s,s.nextSibling,this,e):a.type===1?h=new a.ctor(s,a.name,a.strings,this,e):a.type===6&&(h=new Je(s,this,e)),this._$AV.push(h),a=o[++c]}n!==(a==null?void 0:a.index)&&(s=_.nextNode(),n++)}return _.currentNode=A,r}p(e){let t=0;for(const o of this._$AV)o!==void 0&&(o.strings!==void 0?(o._$AI(e,o,t),t+=o.strings.length-2):o._$AI(e[t])),t++}}class U{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,o,r){this.type=2,this._$AH=m,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=o,this.options=r,this._$Cv=(r==null?void 0:r.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=E(this,e,t),L(e)?e===m||e==null||e===""?(this._$AH!==m&&this._$AR(),this._$AH=m):e!==this._$AH&&e!==S&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):je(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==m&&L(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){var s;const{values:t,_$litType$:o}=e,r=typeof o=="number"?this._$AC(e):(o.el===void 0&&(o.el=M.createElement(Ae(o.h,o.h[0]),this.options)),o);if(((s=this._$AH)==null?void 0:s._$AD)===r)this._$AH.p(t);else{const n=new Ve(r,this),c=n.u(this.options);n.p(t),this.T(c),this._$AH=n}}_$AC(e){let t=fe.get(e.strings);return t===void 0&&fe.set(e.strings,t=new M(e)),t}k(e){se(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let o,r=0;for(const s of e)r===t.length?t.push(o=new U(this.O(I()),this.O(I()),this,this.options)):o=t[r],o._$AI(s),r++;r<t.length&&(this._$AR(o&&o._$AB.nextSibling,r),t.length=r)}_$AR(e=this._$AA.nextSibling,t){var o;for((o=this._$AP)==null?void 0:o.call(this,!1,!0,t);e!==this._$AB;){const r=de(e).nextSibling;de(e).remove(),e=r}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class F{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,o,r,s){this.type=1,this._$AH=m,this._$AN=void 0,this.element=e,this.name=t,this._$AM=r,this.options=s,o.length>2||o[0]!==""||o[1]!==""?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=m}_$AI(e,t=this,o,r){const s=this.strings;let n=!1;if(s===void 0)e=E(this,e,t,0),n=!L(e)||e!==this._$AH&&e!==S,n&&(this._$AH=e);else{const c=e;let a,h;for(e=s[0],a=0;a<s.length-1;a++)h=E(this,c[o+a],t,a),h===S&&(h=this._$AH[a]),n||(n=!L(h)||h!==this._$AH[a]),h===m?e=m:e!==m&&(e+=(h??"")+s[a+1]),this._$AH[a]=h}n&&!r&&this.j(e)}j(e){e===m?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class qe extends F{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===m?void 0:e}}class Fe extends F{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==m)}}class Ke extends F{constructor(e,t,o,r,s){super(e,t,o,r,s),this.type=5}_$AI(e,t=this){if((e=E(this,e,t,0)??m)===S)return;const o=this._$AH,r=e===m&&o!==m||e.capture!==o.capture||e.once!==o.once||e.passive!==o.passive,s=e!==m&&(o===m||r);r&&this.element.removeEventListener(this.name,this,o),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class Je{constructor(e,t,o){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(e){E(this,e)}}const Z=R.litHtmlPolyfillSupport;Z==null||Z(M,U),(R.litHtmlVersions??(R.litHtmlVersions=[])).push("3.3.2");const ke=(i,e,t)=>{const o=(t==null?void 0:t.renderBefore)??e;let r=o._$litPart$;if(r===void 0){const s=(t==null?void 0:t.renderBefore)??null;o._$litPart$=r=new U(e.insertBefore(I(),s),s,void 0,t??{})}return r._$AI(i),r};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const P=globalThis;class g extends C{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=ke(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return S}}var we;g._$litElement$=!0,g.finalized=!0,(we=P.litElementHydrateSupport)==null||we.call(P,{LitElement:g});const Q=P.litElementPolyfillSupport;Q==null||Q({LitElement:g});(P.litElementVersions??(P.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const w=i=>(e,t)=>{t!==void 0?t.addInitializer(()=>{customElements.define(i,e)}):customElements.define(i,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ye={attribute:!0,type:String,converter:N,reflect:!1,hasChanged:ie},Ze=(i=Ye,e,t)=>{const{kind:o,metadata:r}=t;let s=globalThis.litPropertyMetadata.get(r);if(s===void 0&&globalThis.litPropertyMetadata.set(r,s=new Map),o==="setter"&&((i=Object.create(i)).wrapped=!0),s.set(t.name,i),o==="accessor"){const{name:n}=t;return{set(c){const a=e.get.call(this);e.set.call(this,c),this.requestUpdate(n,a,i,!0,c)},init(c){return c!==void 0&&this.C(n,void 0,i,c),c}}}if(o==="setter"){const{name:n}=t;return function(c){const a=this[n];e.call(this,c),this.requestUpdate(n,a,i,!0,c)}}throw Error("Unsupported decorator location: "+o)};function Qe(i){return(e,t)=>typeof t=="object"?Ze(i,e,t):((o,r,s)=>{const n=r.hasOwnProperty(s);return r.constructor.createProperty(s,o),n?Object.getOwnPropertyDescriptor(r,s):void 0})(i,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function $(i){return Qe({...i,state:!0,attribute:!1})}const Xe={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"功能",runtime:"运行时",ecosystem:"生态",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"持续进化的 Pi Runtime",title:{part1:"把 AI 编程变成",accent:"可编程系统",part2:""},description:"Pi 不只是聊天窗口：它把代码检索、上下文 checkpoint、角色记忆、原生 GAPP 界面、Provider 可观测性和 Gateway 编排放进同一个可扩展运行时。",cta:{primary:"开始使用",secondary:"阅读文档"},stats:{commands:"持久上下文",extensions:"原生生成式 UI",productivity:"端到端可观测"}},features:{label:"运行时能力",title:"从上下文到交付，一条可观察链路",subtitle:"检索真实代码路径，保存可恢复上下文，用扩展和 GAPP 增强交互，并把验证证据留在同一会话里。",workflow:{title:"证据驱动工作流",desc:"先定位真实实现，再形成计划、执行最小修改、运行验证并交付证据；流程随任务复杂度伸缩，而不是固定阶段表演。",features:["先读真实调用链，再动代码","checkpoint / compact 保留关键上下文","测试、diff、状态一起验证","工具与扩展按任务动态组合"],metrics:{tasks:"上下文标记",success:"工作树状态",active:"Provider 追踪"}},skills:{title:"按需技能与工具",desc:"语义检索、AST、浏览器、设计、诊断、文档与自动化能力按任务加载。",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"角色与长期记忆",desc:"角色配置、记忆检索与 viewer 贯穿会话，而不是每次从零开始。",agents:["角色","记忆","召回","整理","导出","Viewer","标签","向量","场景","提示","服务","适配"]},search:{title:"代码搜索",desc:"自然语言到精确位置。三层搜索，零遗漏。",example:'pi /search "认证中间件"'},gateway:{title:"多通道网关",desc:"一个服务支持 Telegram、Discord、WebChat、OpenAI API。",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"网关",title:"把 Pi 运行时分发到更多入口",subtitle:"Gateway 用 RPC worker pool、会话路由和插件管线把同一套 Pi 能力接到 Web、API 与消息通道，同时保持 worker 启动可控。",layers:{channels:{title:"通道",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"管线",desc:"分发 → 去重 → 解析 → 处理"},plugins:{title:"插件",desc:"16 钩子 · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 路由 · 定时 · 事件"},security:{title:"安全",desc:"认证 · 执行守卫 · SSRF · 白名单"}}},workflow:{label:"工作流",title:"证据驱动的工程闭环",subtitle:"不是固定五阶段，而是围绕真实代码、可恢复上下文和可复现验证形成闭环。",phases:[{num:"01",title:"定位",desc:"语义检索、精确匹配、调用链"},{num:"02",title:"建模",desc:"理解约束、选择最小改动面"},{num:"03",title:"保存",desc:"checkpoint、tag、compact 关键上下文"},{num:"04",title:"执行",desc:"精准编辑、扩展工具、GAPP 交互"},{num:"05",title:"验证",desc:"测试、diff、状态与可观测证据"}]},extensions:{label:"扩展",title:"无限扩展",subtitle:"从 CLI 命令到 TUI 组件，从网关插件到定时任务。",categories:{commands:{title:"命令",desc:"斜杠命令和快捷键"},tools:{title:"工具",desc:"可复用能力"},gateway:{title:"网关",desc:"通道集成"}}},comparison:{label:"对比",title:"不把 Agent 当一次性聊天",subtitle:"Pi 的差异在运行时：上下文能恢复、能力能扩展、行为能观察、界面能生成。",headers:{feature:"能力",pi:"Pi Agent",others:"典型工具"},rows:[{feature:"上下文生命周期",pi:"checkpoint + tag + compact",others:"会话即上下文"},{feature:"代码定位",pi:"语义 + 精确 + AST",others:"基础搜索"},{feature:"交互表面",pi:"TUI + Web + GAPP",others:"单一聊天界面"},{feature:"长期记忆",pi:"角色记忆 + 检索 + viewer",others:"临时提示词"},{feature:"可观测与分发",pi:"Provider Trace + Gateway/RPC",others:"单一接口"}]},cta:{title:"把你的 Pi 变成自己的工程系统",subtitle:"从一个可工作的 coding agent 开始，再按项目需要接入记忆、GAPP、可观测性与网关。",button:"开始使用"},footer:{tagline:"工程级 AI 编排。",links:{docs:"文档",github:"GitHub",discord:"Discord"},copyright:"精准构建。"}},et={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",runtime:"Runtime",ecosystem:"Ecosystem",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Pi Runtime, continuously evolving",title:{part1:"Make AI coding a ",accent:"programmable system",part2:""},description:"Pi is more than a chat surface: code retrieval, context checkpoints, role memory, native GAPP interfaces, provider observability, and gateway orchestration live in one extensible runtime.",cta:{primary:"Get Started",secondary:"Read Docs"},stats:{commands:"Persistent Context",extensions:"Native Generative UI",productivity:"End-to-end Observability"}},features:{label:"Runtime Capabilities",title:"One observable path from context to delivery",subtitle:"Trace real code paths, preserve recoverable context, extend the runtime with tools and GAPPs, and keep verification evidence in the same session.",workflow:{title:"Evidence-driven workflow",desc:"Locate the real implementation, model constraints, make the smallest change, verify it, and ship evidence. The loop scales with the task instead of enforcing ceremony.",features:["Read the real call path before editing","Checkpoint / compact critical context","Verify tests, diff, and worktree state together","Compose tools and extensions per task"],metrics:{tasks:"Context Tag",success:"Worktree State",active:"Provider Trace"}},skills:{title:"On-demand skills & tools",desc:"Semantic retrieval, AST, browser, design, diagnosis, docs, and automation capabilities load for the task at hand.",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"Roles & durable memory",desc:"Role configuration, memory retrieval, and a viewer carry knowledge across sessions instead of starting from zero.",agents:["role","memory","recall","organize","export","viewer","tags","vector","scenarios","prompt","service","adapter"]},search:{title:"Code Search",desc:"Natural language to exact location. Three layers, zero misses.",example:'pi /search "auth middleware"'},gateway:{title:"Multi-Channel Gateway",desc:"One service for Telegram, Discord, WebChat, OpenAI API.",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"Gateway",title:"Distribute the Pi runtime beyond the terminal",subtitle:"Gateway uses an RPC worker pool, session routing, and a programmable plugin pipeline to expose the same Pi capabilities through Web, APIs, and messaging channels.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Resolve → Process"},plugins:{title:"Plugins",desc:"16 Hooks · Registry · Conflicts"},runtime:{title:"Runtime",desc:"RPC Pool · Router · Cron · Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF · Allowlist"}}},workflow:{label:"Workflow",title:"An evidence-driven engineering loop",subtitle:"Not a mandatory five-step ritual: a loop around real code, recoverable context, precise edits, and reproducible verification.",phases:[{num:"01",title:"Locate",desc:"Semantic retrieval, exact match, call paths"},{num:"02",title:"Model",desc:"Understand constraints, choose the smallest surface"},{num:"03",title:"Preserve",desc:"Checkpoint, tag, and compact critical context"},{num:"04",title:"Execute",desc:"Surgical edits, extension tools, GAPP interaction"},{num:"05",title:"Verify",desc:"Tests, diff, state, and observable evidence"}]},extensions:{label:"Extensions",title:"Infinite Extensibility",subtitle:"From CLI commands to TUI components, from gateway plugins to cron jobs.",categories:{commands:{title:"Commands",desc:"Slash commands and shortcuts"},tools:{title:"Tools",desc:"Reusable capabilities"},gateway:{title:"Gateway",desc:"Channel integrations"}}},comparison:{label:"Comparison",title:"An agent runtime, not disposable chat",subtitle:"Pi differs at the runtime layer: context can recover, capabilities can extend, behavior can be observed, and interfaces can be generated.",headers:{feature:"Capability",pi:"Pi Agent",others:"Typical Tools"},rows:[{feature:"Context lifecycle",pi:"checkpoint + tag + compact",others:"session-only context"},{feature:"Code location",pi:"semantic + exact + AST",others:"basic search"},{feature:"Interaction surface",pi:"TUI + Web + GAPP",others:"single chat surface"},{feature:"Durable memory",pi:"role memory + retrieval + viewer",others:"temporary prompts"},{feature:"Observe & distribute",pi:"Provider Trace + Gateway/RPC",others:"single interface"}]},cta:{title:"Turn Pi into your engineering system",subtitle:"Start with a working coding agent, then add memory, GAPPs, observability, and gateway capabilities as your project needs them.",button:"Get Started"},footer:{tagline:"Engineering-grade AI orchestration.",links:{docs:"Documentation",github:"GitHub",discord:"Discord"},copyright:"Built with precision."}},X={"zh-CN":Xe,"en-US":et},be="pi-agent-locale";class tt{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const t=localStorage.getItem(be);if(t&&X[t]){this.currentLocale=t;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(X[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(be,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(t=>t())}}t(e){const t=e.split(".");let o=X[this.currentLocale];for(const r of t)if(o&&typeof o=="object"&&r in o)o=o[r];else return e;return typeof o=="string"?o:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const d=new tt;var rt=Object.defineProperty,ot=Object.getOwnPropertyDescriptor,K=(i,e,t,o)=>{for(var r=o>1?void 0:o?ot(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&rt(e,t,r),r};const ve=[{key:"features",id:"features"},{key:"runtime",id:"runtime"},{key:"ecosystem",id:"ecosystem"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],ee="https://github.com/Dwsy/agent";let O=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=p`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`,this._burgerIcon=p`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen?p`<path d="M18 6L6 18M6 6l12 12"/>`:p`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=d.subscribe(()=>{this.locale=d.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var i,e;super.disconnectedCallback(),(i=this._unsub)==null||i.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const i=new Map;this._io=new IntersectionObserver(e=>{for(const r of e)r.isIntersecting?i.set(r.target.id,r.intersectionRatio):i.delete(r.target.id);let t="",o=0;i.forEach((r,s)=>{r>o&&(o=r,t=s)}),t!==this.activeId&&(this.activeId=t)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of ve){const t=document.getElementById(e.id);t&&this._io.observe(t)}})}t(i){return d.t(i)}_toggleLocale(){d.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const i=ve.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return p`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-mark">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="links">
          ${i.map(e=>p`
            <a href="#${e.id}" class="link" ?active=${this.activeId===e.id}>${e.label}</a>
          `)}
        </div>

        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale}>
            ${this.locale==="zh-CN"?"EN":"中文"}
          </button>
          <a href=${ee} target="_blank" class="gh-btn" aria-label="GitHub">
            ${this._ghIcon}
          </a>
          <a href=${ee} class="cta" target="_blank">${this.t("navbar.cta")}</a>
          <button class="burger" @click=${this._toggleMenu}>${this._burgerIcon}</button>
        </div>
      </nav>

      <div class="mobile" ?open=${this.menuOpen}>
        ${i.map(e=>p`
          <a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>
            ${e.label}
          </a>
        `)}
        <a href=${ee} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
      </div>
    `}};O.styles=k`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 1000;
      width: 100%;
      padding: 0.75rem 1.5rem;
      background: #09090b;
      border-bottom: 1px solid #27272a;
    }

    .nav {
      position: relative;
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 1rem;
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    :host([scrolled]) .nav {
      background: transparent;
      border-color: transparent;
      box-shadow: none;
    }

    /* Logo - Minimal */
    .logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
    }

    .logo-mark {
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 0.5rem;
      background: #10b981;
      display: grid;
      place-items: center;
      font-size: 1rem;
      font-weight: 700;
      color: #09090b;
    }

    .logo-text {
      font-size: 1.0625rem;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.01em;
    }

    /* Navigation Links */
    .links {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .link {
      padding: 0.5rem 0.875rem;
      color: #a1a1aa;
      text-decoration: none;
      font-size: 0.8125rem;
      font-weight: 500;
      border-radius: 0.5rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .link:hover { color: #fafafa; }

    .link[active] {
      color: #fafafa;
      background: transparent;
      box-shadow: inset 0 -1px #10b981;
      border-radius: 0;
    }

    /* Actions */
    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .lang-btn {
      padding: 0.375rem 0.625rem;
      background: transparent;
      color: #71717a;
      border: 1px solid #3f3f46;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .lang-btn:hover {
      color: #fafafa;
      border-color: #52525b;
    }

    .gh-btn {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      color: #a1a1aa;
      border-radius: 0.375rem;
      transition: all 0.2s;
    }

    .gh-btn:hover {
      color: #fafafa;
      background: rgba(255, 255, 255, 0.05);
    }

    .cta {
      padding: 0.5rem 1rem;
      background: #10b981;
      color: #09090b;
      font-size: 0.8125rem;
      font-weight: 600;
      border-radius: 0.5rem;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cta:hover { background: #34d399; }

    .cta:active { background: #059669; }

    /* Mobile Menu */
    .burger {
      display: none;
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      padding: 0.25rem;
    }

    .mobile {
      display: none;
      position: absolute;
      top: calc(100% + 0.75rem);
      left: 0;
      right: 0;
      background: #111113;
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      padding: 0.75rem;
      flex-direction: column;
      gap: 0.25rem;
    }

    .mobile[open] {
      display: flex;
      animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .m-link {
      padding: 0.75rem 1rem;
      color: #a1a1aa;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.5rem;
      transition: all 0.15s;
    }

    .m-link:hover,
    .m-link[active] {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
    }

    /* Responsive */
    @media (prefers-color-scheme: light) {
      :host { background: #ffffff; border-bottom-color: #e4e4e7; }
      .nav { background: transparent; border-color: transparent; box-shadow: none; }
      :host([scrolled]) .nav { background: transparent; border-color: transparent; box-shadow: none; }
      .logo-text { color: #18181b; }
      .link { color: #71717a; }
      .link:hover { color: #18181b; background: transparent; }
      .link[active] { color: #18181b; background: transparent; box-shadow: inset 0 -1px #059669; }
      .lang-btn { color: #52525b; border-color: #d4d4d8; }
      .lang-btn:hover { color: #18181b; border-color: #a1a1aa; }
      .gh-btn { color: #52525b; }
      .gh-btn:hover { color: #18181b; background: transparent; }
      .burger { color: #52525b; }
      .mobile { background: rgba(255,255,255,0.98); border-color: #e4e4e7; box-shadow: 0 18px 40px -24px rgba(24,24,27,0.28); }
      .m-link { color: #52525b; }
    }

    @media (max-width: 768px) {
      .links, .cta { display: none; }
      .burger { display: block; }
    }
  `;K([$()],O.prototype,"locale",2);K([$()],O.prototype,"menuOpen",2);K([$()],O.prototype,"activeId",2);O=K([w("pi-navbar")],O);var it=Object.defineProperty,st=Object.getOwnPropertyDescriptor,Ce=(i,e,t,o)=>{for(var r=o>1?void 0:o?st(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&it(e,t,r),r};let j=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var i;super.disconnectedCallback(),(i=this.unsubscribe)==null||i.call(this)}render(){const i=this.locale==="zh-CN";return p`
      <section class="hero" id="features">
        <div class="inner">
          <div class="lead">
            <h1>${i?"Pi 工程工作台":"Pi engineering workbench"}</h1>
            <div class="pitch">
              <p>${i?"围绕 Pi Core 构建的工程环境。它先理解项目，再持续管理上下文和角色记忆；需要时生成 GAPP、切换 Provider、通过 Gateway/RPC 分发，最后用测试、diff 和工作树状态交付。":"An engineering environment built around Pi Core. It understands the project first, preserves context and role memory, generates GAPP interfaces when useful, routes through providers and Gateway/RPC, and closes with tests, diff, and worktree state."}</p>
              <div class="actions"><a class="primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${i?"查看仓库":"View repository"}</a><a class="secondary" href="https://github.com/Dwsy/agent#readme" target="_blank" rel="noopener">${i?"阅读配置说明":"Read the configuration"}</a></div>
            </div>
          </div>

          <div class="index">
            ${(i?[["代码理解","语义检索、精确搜索、AST 与调用链一起定位真实实现。","先读再改"],["上下文","tag、history、checkout、compact 管理长会话，而不是无限堆历史。","可恢复"],["角色记忆","工作目录映射角色，短期 context 与长期 knowledge 分开维护。","跨会话"],["GAPP","项目图、diff、状态和操作可以成为会话里的原生界面。","可交互"],["可观测","Provider Trace 把模型路由、请求响应和失败路径留在同一条证据链。","可检查"],["分发","Gateway/RPC 把同一个 Pi 接到 Web、API 和消息入口。","session-aware"]]:[["Code understanding","Semantic retrieval, exact search, AST, and call paths locate the real implementation.","read before edit"],["Context","Tag, history, checkout, and compact keep long sessions manageable without dumping endless history.","recoverable"],["Role memory","Workspace paths map to roles; short-term context stays separate from durable knowledge.","cross-session"],["GAPP","Project maps, diffs, live state, and actions can become native session interfaces.","interactive"],["Observability","Provider Trace keeps model routing, requests, responses, and failure paths inspectable.","inspectable"],["Distribution","Gateway/RPC exposes the same Pi runtime through Web, APIs, and messaging entry points.","session-aware"]]).map(t=>p`<div class="row"><div class="name">${t[0]}</div><div class="detail">${t[1]}</div><div class="proof"><strong>${t[2]}</strong></div></div>`)}
          </div>
        </div>
      </section>
    `}};j.styles=k`
    *, *::before, *::after { box-sizing: border-box; }
    :host { display: block; width: 100%; }
    .hero { padding: clamp(5rem, 9vw, 8rem) 1.5rem 4rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .lead { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: clamp(3rem, 8vw, 8rem); align-items: end; padding-bottom: clamp(4rem, 7vw, 6rem); }
    h1 { margin: 0; max-width: 8ch; color: #fafafa; font-size: clamp(3.5rem, 8vw, 7rem); line-height: 0.92; letter-spacing: -0.055em; font-weight: 650; }
    .pitch { max-width: 620px; }
    .pitch p { margin: 0 0 1.75rem; color: #a1a1aa; font-size: clamp(1rem, 1.5vw, 1.2rem); line-height: 1.7; }
    .actions { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
    .primary { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; background: #047857; color: #fff; text-decoration: none; font-size: 0.85rem; font-weight: 650; border: 1px solid #047857; }
    .primary:hover { background: #065f46; border-color: #065f46; }
    .secondary { color: #a1a1aa; text-decoration: none; font-size: 0.85rem; font-weight: 600; border-bottom: 1px solid #3f3f46; padding-bottom: 0.15rem; }
    .secondary:hover { color: #fafafa; border-color: #a1a1aa; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }

    .index { border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; }
    .row { display: grid; grid-template-columns: 10rem 1fr 1fr; gap: 2rem; padding: 1.15rem 0; border-top: 1px solid #202023; align-items: baseline; }
    .row:first-child { border-top: 0; }
    .name { color: #f4f4f5; font-size: 0.9rem; font-weight: 650; }
    .detail { color: #71717a; font-size: 0.82rem; line-height: 1.55; }
    .proof { color: #52525b; font-size: 0.76rem; line-height: 1.55; }
    .proof strong { color: #34d399; font-weight: 600; }

    @media (prefers-color-scheme: light) {
      .hero { background: #fff; }
      h1 { color: #18181b; }
      .pitch p { color: #52525b; }
      .secondary { color: #52525b; border-color: #d4d4d8; }
      .secondary:hover { color: #18181b; border-color: #71717a; }
      .index, .row { border-color: #e4e4e7; }
      .name { color: #18181b; }
      .detail { color: #52525b; }
      .proof { color: #71717a; }
      .proof strong { color: #047857; }
    }

    @media (max-width: 800px) {
      .lead { grid-template-columns: 1fr; gap: 2rem; align-items: start; }
      h1 { max-width: 10ch; }
      .row { grid-template-columns: 1fr; gap: 0.35rem; padding: 1rem 0; }
    }
  `;Ce([$()],j.prototype,"locale",2);j=Ce([w("hero-section")],j);var nt=Object.defineProperty,at=Object.getOwnPropertyDescriptor,Se=(i,e,t,o)=>{for(var r=o>1?void 0:o?at(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&nt(e,t,r),r};let W=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var i;super.disconnectedCallback(),(i=this.unsubscribe)==null||i.call(this)}render(){const i=this.locale==="zh-CN";return p`
      <section class="scene" id="runtime">
        <div class="inner">
          <div><h2>${i?"持续工作的运行时":"A runtime that keeps working"}</h2><p class="lead">${i?"这里没有固定五阶段，也没有为了展示而存在的流程图。Pi 只保留真实工程需要的状态：代码在哪里、上下文到哪了、记忆属于谁、模型做了什么、修改是否验证。":"There is no mandatory five-step ceremony and no process diagram for show. Pi keeps the state real engineering needs: where the code is, where context stands, who owns memory, what the model did, and whether the change was verified."}</p><div class="protocol"><strong>${i?"执行原则":"Execution principle"}</strong><br>${i?"按 L1–L4 复杂度路由；先读真实实现，再做最小修改。":"Route by L1–L4 complexity; read the real implementation first, then make the smallest change."}</div></div>
          <div class="list">${(i?[["上下文","关键状态可以保存、回看和恢复。长会话通过 compact 保留 handoff，而不是把全部历史继续塞进窗口。","tag · history · checkout · compact"],["角色记忆","工作目录自动映射角色；daily、pending、knowledge 分开，稳定经验才进入长期记忆。","role mapping · memory.search · viewer"],["Gateway","session-aware routing 和 RPC worker pool 把同一套 Pi 能力接到 Web、API 与消息通道。","WebSocket · HTTP · RPC"],["验证","Provider Trace 观察模型链路；交付前同时检查测试、diff 和 worktree 状态。","trace · test · diff · state"]]:[["Context","Important states can be saved, inspected, and restored. Compaction preserves the handoff instead of carrying the whole transcript forever.","tag · history · checkout · compact"],["Role memory","Workspace paths map to roles; daily, pending, and knowledge remain separate so only stable experience becomes durable memory.","role mapping · memory.search · viewer"],["Gateway","Session-aware routing and an RPC worker pool expose the same Pi capabilities through Web, APIs, and messaging channels.","WebSocket · HTTP · RPC"],["Verification","Provider Trace observes the model path; delivery checks tests, diff, and worktree state together.","trace · test · diff · state"]]).map(t=>p`<div class="item"><h3>${t[0]}</h3><div><p>${t[1]}</p><code>${t[2]}</code></div></div>`)}</div>
        </div>
      </section>
    `}};W.styles=k`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #111113; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.78fr 1.22fr; gap: 6rem; align-items: start; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 9ch; }
    .lead { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 44ch; }
    .list { border-top: 1px solid #3f3f46; }
    .item { padding: 1.6rem 0; border-bottom: 1px solid #27272a; display: grid; grid-template-columns: 11rem 1fr; gap: 2rem; }
    .item h3 { margin: 0; color: #e4e4e7; font-size: 0.95rem; font-weight: 650; }
    .item p { margin: 0; color: #71717a; font-size: 0.9rem; line-height: 1.7; }
    .item code { color: #34d399; font: 0.78rem/1.5 'JetBrains Mono', monospace; background: transparent; }
    .protocol { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.82rem; line-height: 1.7; }
    .protocol strong { color: #d4d4d8; font-weight: 650; }

    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2 { color: #18181b; }
      .lead, .item p, .protocol { color: #52525b; }
      .list, .item, .protocol { border-color: #d4d4d8; }
      .item h3, .protocol strong { color: #27272a; }
      .item code { color: #047857; }
    }
    @media (max-width: 850px) { .inner { grid-template-columns: 1fr; gap: 3rem; } h2 { max-width: 12ch; } }
    @media (max-width: 560px) { .scene { padding: 5rem 1rem; } .item { grid-template-columns: 1fr; gap: 0.5rem; } }
  `;Se([$()],W.prototype,"locale",2);W=Se([w("runtime-system-scene")],W);var ct=Object.defineProperty,lt=Object.getOwnPropertyDescriptor,Ee=(i,e,t,o)=>{for(var r=o>1?void 0:o?lt(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&ct(e,t,r),r};let B=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var i;super.disconnectedCallback(),(i=this.unsubscribe)==null||i.call(this)}render(){const i=this.locale==="zh-CN";return p`
      <section class="scene" id="ecosystem">
        <div class="inner">
          <div class="head"><h2>${i?"Pi 周围的配套工具":"Tools around Pi"}</h2><p>${i?"核心仍然是 Pi。配套项目只解决边界清楚的问题：grok-pi-tui 负责终端交互，Pi Session Manager 负责跨会话连续性。":"Pi remains the core. Companion projects solve bounded problems: grok-pi-tui owns terminal interaction; Pi Session Manager owns cross-session continuity."}</p></div>
          <div class="products">
            <article class="product"><div class="name">grok-pi-tui</div><div class="body"><h3>${i?"Grok Pager 作为 Pi 的终端界面":"Grok Pager as Pi's terminal interface"}</h3><p>${i?"Pi 保留模型、Provider、工具、扩展、Skill、Session 和执行；Remote TUI bridge 只负责把交互交给 Grok Pager。":"Pi keeps models, providers, tools, extensions, skills, sessions, and execution. The Remote TUI bridge only hands interaction to Grok Pager."}</p><div class="scope">Pager · ACP · JSONL RPC · tool cards · diffs · dialogs</div></div><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub</a></article>
            <article class="product"><div class="name">pi-session-manager</div><div class="body"><h3>${i?"把历史 Session 继续用起来":"Keep historical sessions useful"}</h3><p>${i?"本地索引 Pi 与其他 coding agent 的历史，重建树、Branch Atlas、Tool Trace 和 compaction context，再通过搜索、Kanban、resume、convert、export 继续工作。":"Index Pi and other coding-agent histories locally, reconstruct trees, Branch Atlas, tool traces, and compaction context, then continue through search, Kanban, resume, convert, and export."}</p><div class="scope">Pi · Claude Code · Codex · OpenCode · Gemini CLI · Cursor · Antigravity</div></div><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub</a></article>
          </div>
          <div class="boundary">${i?"两者都围绕 Pi 工作，不把 Pi 包进新的 Agent 黑盒。":"Both work around Pi; neither wraps it in a new agent black box."}</div>
        </div>
      </section>
    `}};B.styles=k`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 5rem; margin-bottom: 4rem; align-items: end; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 10ch; }
    .head p { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 56ch; }
    .products { border-top: 1px solid #3f3f46; }
    .product { display: grid; grid-template-columns: 12rem 1fr auto; gap: 2.5rem; align-items: start; padding: 2rem 0; border-bottom: 1px solid #27272a; }
    .name { color: #e4e4e7; font-size: 0.9rem; font-weight: 650; }
    .body h3 { margin: 0 0 0.6rem; color: #f4f4f5; font-size: 1.25rem; font-weight: 620; }
    .body p { margin: 0 0 0.8rem; color: #71717a; font-size: 0.9rem; line-height: 1.7; max-width: 68ch; }
    .scope { color: #52525b; font-size: 0.76rem; line-height: 1.55; }
    a { color: #34d399; text-decoration: none; font-size: 0.82rem; font-weight: 600; border-bottom: 1px solid rgba(52,211,153,0.4); padding-bottom: 0.1rem; white-space: nowrap; }
    a:hover { color: #6ee7b7; border-color: #6ee7b7; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    .boundary { margin-top: 1.5rem; color: #52525b; font-size: 0.78rem; line-height: 1.65; }

    @media (prefers-color-scheme: light) {
      .scene { background: #fff; }
      h2, .name, .body h3 { color: #18181b; }
      .head p, .body p { color: #52525b; }
      .products, .product { border-color: #d4d4d8; }
      .scope, .boundary { color: #71717a; }
      a { color: #047857; border-color: rgba(4,120,87,0.35); }
      a:hover { color: #065f46; border-color: #065f46; }
    }
    @media (max-width: 800px) { .head { grid-template-columns: 1fr; gap: 1.5rem; } .product { grid-template-columns: 1fr; gap: 0.6rem; } }
    @media (max-width: 560px) { .scene { padding: 5rem 1rem; } }
  `;Ee([$()],B.prototype,"locale",2);B=Ee([w("companion-ecosystem-scene")],B);var dt=Object.defineProperty,ht=Object.getOwnPropertyDescriptor,Oe=(i,e,t,o)=>{for(var r=o>1?void 0:o?ht(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&dt(e,t,r),r};let V=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var i;super.disconnectedCallback(),(i=this.unsubscribe)==null||i.call(this)}render(){const i=this.locale==="zh-CN";return p`
      <section class="scene" id="extensions">
        <div class="inner">
          <div class="head"><h2>${i?"扩展，而不是堆功能":"Extend without feature sprawl"}</h2><p>${i?"扩展、Skill、工具、GAPP 和 Provider 都是按任务加载的运行时资源。核心保持小，能力在需要时接入。":"Extensions, skills, tools, GAPPs, and providers are runtime resources loaded for the task. The core stays small; capability plugs in when needed."}</p></div>
          <div class="layout">
            <div class="extension"><h3>${i?"当前工作集":"Current working set"}</h3><p>${i?"常用能力来自项目真实配置，不是固定功能清单。":"Common capabilities come from the project's real configuration, not a fixed feature checklist."}</p><div class="resources">ace-tool · ast-grep · codemap · diagnose · GAPP · provider-trace · role-persona</div><pre><b>pi</b>.registerTool({
  name: <em>"project_map"</em>,
  execute: async (ctx) => ctx.ui.custom(...)
})</pre></div>
            <div class="proof" id="comparison"><div class="proof-head"><div class="proof-cell">${i?"边界":"Boundary"}</div><div class="proof-cell">Pi</div><div class="proof-cell">${i?"常见工具":"Typical tool"}</div></div>${(i?[["上下文生命周期","tag / checkout / compact","会话历史"],["代码定位","语义 / 精确 / AST","基础搜索"],["交互表面","TUI / Web / GAPP","聊天界面"],["长期记忆","角色记忆 / 检索 / viewer","临时提示"],["可观测与分发","Provider Trace / Gateway RPC","单一接口"]]:[["Context lifecycle","tag / checkout / compact","session history"],["Code location","semantic / exact / AST","basic search"],["Interaction surface","TUI / Web / GAPP","chat surface"],["Durable memory","role memory / retrieval / viewer","temporary prompt"],["Observe & distribute","Provider Trace / Gateway RPC","single interface"]]).map(t=>p`<div class="proof-row"><div class="proof-cell">${t[0]}</div><div class="proof-cell pi">${t[1]}</div><div class="proof-cell">${t[2]}</div></div>`)}<div class="proof-note">${i?"这里比较的是运行时边界，不是模型排行榜。":"This compares runtime boundaries, not model rankings."}</div></div>
          </div>
        </div>
      </section>
    `}};V.styles=k`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #111113; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 5rem; margin-bottom: 4rem; align-items: end; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 10ch; }
    .head p { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 58ch; }
    .layout { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 5rem; align-items: start; }
    .extension { border-top: 1px solid #3f3f46; padding-top: 1.5rem; }
    .extension h3 { margin: 0 0 0.75rem; color: #e4e4e7; font-size: 1.2rem; font-weight: 620; }
    .extension p { margin: 0 0 1rem; color: #71717a; line-height: 1.7; font-size: 0.9rem; }
    .resources { margin: 0 0 1.5rem; color: #a1a1aa; font-size: 0.78rem; line-height: 1.8; }
    pre { margin: 0; padding: 1rem 0; overflow-x: auto; border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; color: #a1a1aa; font: 0.72rem/1.7 'JetBrains Mono', monospace; }
    pre b, pre em { color: #34d399; font-weight: 500; font-style: normal; }
    .proof { border-top: 1px solid #3f3f46; }
    .proof-head, .proof-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr; }
    .proof-cell { padding: 0.95rem 0; border-bottom: 1px solid #27272a; color: #71717a; font-size: 0.8rem; line-height: 1.5; }
    .proof-cell + .proof-cell { padding-left: 1rem; }
    .proof-head .proof-cell { color: #a1a1aa; font-size: 0.72rem; font-weight: 650; }
    .proof-cell.pi { color: #d4d4d8; font-weight: 600; }
    .proof-note { padding-top: 1rem; color: #52525b; font-size: 0.75rem; line-height: 1.6; }

    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2, .extension h3 { color: #18181b; }
      .head p, .extension p { color: #52525b; }
      .extension, pre, .proof, .proof-cell { border-color: #d4d4d8; }
      .resources, .proof-head .proof-cell { color: #71717a; }
      .proof-cell { color: #52525b; }
      .proof-cell.pi { color: #27272a; }
      .proof-note { color: #71717a; }
      pre b, pre em { color: #047857; }
    }
    @media (max-width: 850px) { .head, .layout { grid-template-columns: 1fr; gap: 2rem; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .proof { overflow-x: auto; } .proof-head, .proof-row { min-width: 620px; } }
  `;Oe([$()],V.prototype,"locale",2);V=Oe([w("extend-and-prove-scene")],V);var pt=Object.defineProperty,mt=Object.getOwnPropertyDescriptor,Te=(i,e,t,o)=>{for(var r=o>1?void 0:o?mt(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=(o?n(e,t,r):n(r))||r);return o&&r&&pt(e,t,r),r};let q=class extends g{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsub=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var i;super.disconnectedCallback(),(i=this.unsub)==null||i.call(this)}render(){const i=d.t.bind(d);return p`<section class="section"><div class="inner"><div><h2 class="title">${i("cta.title")}</h2><p class="subtitle">${i("cta.subtitle")}</p></div><a href="https://github.com/Dwsy/agent" class="cta" target="_blank" rel="noopener">${i("cta.button")}</a></div></section>`}};q.styles=k`
    :host { display: block; width: 100%; }
    .section { padding: 7rem 1.5rem; background: #09090b; border-top: 1px solid #27272a; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 3rem; align-items: center; }
    .title { margin: 0 0 0.6rem; color: #fafafa; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1; letter-spacing: -0.035em; font-weight: 620; }
    .subtitle { margin: 0; color: #71717a; font-size: 1rem; line-height: 1.7; max-width: 58ch; }
    .cta { display: inline-flex; align-items: center; min-height: 2.9rem; padding: 0 1.1rem; background: #047857; color: #fff; font-size: 0.88rem; font-weight: 650; text-decoration: none; border: 1px solid #047857; }
    .cta:hover { background: #065f46; border-color: #065f46; }
    .cta:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    @media (prefers-color-scheme: light) { .section { background: #fff; border-color: #e4e4e7; } .title { color: #18181b; } .subtitle { color: #52525b; } }
    @media (max-width: 700px) { .inner { grid-template-columns: 1fr; gap: 1.5rem; } }
  `;Te([$()],q.prototype,"locale",2);q=Te([w("cta-section")],q);var ut=Object.getOwnPropertyDescriptor,gt=(i,e,t,o)=>{for(var r=o>1?void 0:o?ut(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=n(r)||r);return r};let te=class extends g{render(){return p`
      <footer class="footer">
        <div class="inner">
          <div class="brand">
            <div class="logo">π</div>
            <div>
              <div class="brand-text">Pi Agent</div>
              <div class="tagline">Engineering-grade AI orchestration.</div>
            </div>
          </div>
          <div class="links">
            <a href="https://github.com/Dwsy/agent" class="link" target="_blank" rel="noopener">GitHub</a>
            <a href="#" class="link">Documentation</a>
            <a href="#" class="link">Discord</a>
          </div>
        </div>
      </footer>
    `}};te.styles=k`
    :host {
      display: block;
      width: 100%;
    }

    .footer {
      padding: 3rem 1.5rem;
      background: #09090b;
      border-top: 1px solid #27272a;
    }

    .inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .logo {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 0.375rem;
      background: #10b981;
      display: grid;
      place-items: center;
      font-size: 0.875rem;
      font-weight: 700;
      color: #09090b;
    }

    .brand-text {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #fafafa;
    }

    .tagline {
      font-size: 0.8125rem;
      color: #52525b;
      margin-top: 0.25rem;
    }

    .links {
      display: flex;
      gap: 2rem;
    }

    .link {
      font-size: 0.8125rem;
      color: #71717a;
      text-decoration: none;
      transition: color 0.2s;
    }

    .link:hover {
      color: #fafafa;
    }

    @media (prefers-color-scheme: light) {
      .footer { background: #f8fafc; border-top-color: #e4e4e7; }
      .brand-text { color: #18181b; }
      .tagline, .link { color: #71717a; }
      .link:hover { color: #18181b; }
    }

    @media (max-width: 640px) {
      .inner {
        flex-direction: column;
        gap: 1.5rem;
        text-align: center;
      }

      .links {
        gap: 1.5rem;
      }
    }
  `;te=gt([w("pi-footer")],te);var ft=Object.getOwnPropertyDescriptor,bt=(i,e,t,o)=>{for(var r=o>1?void 0:o?ft(e,t):e,s=i.length-1,n;s>=0;s--)(n=i[s])&&(r=n(r)||r);return r};let ye=class extends g{createRenderRoot(){return this}render(){return p`
      <pi-navbar></pi-navbar>
      <main id="main-content" style="position: relative; z-index: 1;">
        <hero-section></hero-section>
        <runtime-system-scene></runtime-system-scene>
        <companion-ecosystem-scene></companion-ecosystem-scene>
        <extend-and-prove-scene></extend-and-prove-scene>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `}};ye=bt([w("pi-app")],ye);ke(p`<pi-app></pi-app>`,document.getElementById("app"));
