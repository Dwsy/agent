(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function a(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(s){if(s.ep)return;s.ep=!0;const r=a(s);fetch(s.href,r)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const U=globalThis,de=U.ShadowRoot&&(U.ShadyCSS===void 0||U.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,pe=Symbol(),fe=new WeakMap;let Le=class{constructor(e,a,i){if(this._$cssResult$=!0,i!==pe)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=a}get styleSheet(){let e=this.o;const a=this.t;if(de&&e===void 0){const i=a!==void 0&&a.length===1;i&&(e=fe.get(a)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&fe.set(a,e))}return e}toString(){return this.cssText}};const We=t=>new Le(typeof t=="string"?t:t+"",void 0,pe),b=(t,...e)=>{const a=t.length===1?t[0]:e.reduce((i,s,r)=>i+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[r+1],t[0]);return new Le(a,t,pe)},Ye=(t,e)=>{if(de)t.adoptedStyleSheets=e.map(a=>a instanceof CSSStyleSheet?a:a.styleSheet);else for(const a of e){const i=document.createElement("style"),s=U.litNonce;s!==void 0&&i.setAttribute("nonce",s),i.textContent=a.cssText,t.appendChild(i)}},ve=de?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let a="";for(const i of e.cssRules)a+=i.cssText;return We(a)})(t):t;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Je,defineProperty:Ve,getOwnPropertyDescriptor:Fe,getOwnPropertyNames:qe,getOwnPropertySymbols:Ze,getPrototypeOf:Xe}=Object,$=globalThis,be=$.trustedTypes,Ke=be?be.emptyScript:"",te=$.reactiveElementPolyfillSupport,E=(t,e)=>t,j={toAttribute(t,e){switch(e){case Boolean:t=t?Ke:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let a=t;switch(e){case Boolean:a=t!==null;break;case Number:a=t===null?null:Number(t);break;case Object:case Array:try{a=JSON.parse(t)}catch{a=null}}return a}},he=(t,e)=>!Je(t,e),ye={attribute:!0,type:String,converter:j,reflect:!1,useDefault:!1,hasChanged:he};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),$.litPropertyMetadata??($.litPropertyMetadata=new WeakMap);let S=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,a=ye){if(a.state&&(a.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((a=Object.create(a)).wrapped=!0),this.elementProperties.set(e,a),!a.noAccessor){const i=Symbol(),s=this.getPropertyDescriptor(e,i,a);s!==void 0&&Ve(this.prototype,e,s)}}static getPropertyDescriptor(e,a,i){const{get:s,set:r}=Fe(this.prototype,e)??{get(){return this[a]},set(o){this[a]=o}};return{get:s,set(o){const c=s==null?void 0:s.call(this);r==null||r.call(this,o),this.requestUpdate(e,c,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??ye}static _$Ei(){if(this.hasOwnProperty(E("elementProperties")))return;const e=Xe(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(E("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(E("properties"))){const a=this.properties,i=[...qe(a),...Ze(a)];for(const s of i)this.createProperty(s,a[s])}const e=this[Symbol.metadata];if(e!==null){const a=litPropertyMetadata.get(e);if(a!==void 0)for(const[i,s]of a)this.elementProperties.set(i,s)}this._$Eh=new Map;for(const[a,i]of this.elementProperties){const s=this._$Eu(a,i);s!==void 0&&this._$Eh.set(s,a)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const a=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const s of i)a.unshift(ve(s))}else e!==void 0&&a.push(ve(e));return a}static _$Eu(e,a){const i=a.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(a=>this.enableUpdating=a),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(a=>a(this))}addController(e){var a;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((a=e.hostConnected)==null||a.call(e))}removeController(e){var a;(a=this._$EO)==null||a.delete(e)}_$E_(){const e=new Map,a=this.constructor.elementProperties;for(const i of a.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Ye(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(a=>{var i;return(i=a.hostConnected)==null?void 0:i.call(a)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(a=>{var i;return(i=a.hostDisconnected)==null?void 0:i.call(a)})}attributeChangedCallback(e,a,i){this._$AK(e,i)}_$ET(e,a){var r;const i=this.constructor.elementProperties.get(e),s=this.constructor._$Eu(e,i);if(s!==void 0&&i.reflect===!0){const o=(((r=i.converter)==null?void 0:r.toAttribute)!==void 0?i.converter:j).toAttribute(a,i.type);this._$Em=e,o==null?this.removeAttribute(s):this.setAttribute(s,o),this._$Em=null}}_$AK(e,a){var r,o;const i=this.constructor,s=i._$Eh.get(e);if(s!==void 0&&this._$Em!==s){const c=i.getPropertyOptions(s),l=typeof c.converter=="function"?{fromAttribute:c.converter}:((r=c.converter)==null?void 0:r.fromAttribute)!==void 0?c.converter:j;this._$Em=s;const h=l.fromAttribute(a,c.type);this[s]=h??((o=this._$Ej)==null?void 0:o.get(s))??h,this._$Em=null}}requestUpdate(e,a,i,s=!1,r){var o;if(e!==void 0){const c=this.constructor;if(s===!1&&(r=this[e]),i??(i=c.getPropertyOptions(e)),!((i.hasChanged??he)(r,a)||i.useDefault&&i.reflect&&r===((o=this._$Ej)==null?void 0:o.get(e))&&!this.hasAttribute(c._$Eu(e,i))))return;this.C(e,a,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,a,{useDefault:i,reflect:s,wrapped:r},o){i&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,o??a??this[e]),r!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(a=void 0),this._$AL.set(e,a)),s===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(a){Promise.reject(a)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var i;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}const s=this.constructor.elementProperties;if(s.size>0)for(const[r,o]of s){const{wrapped:c}=o,l=this[r];c!==!0||this._$AL.has(r)||l===void 0||this.C(r,void 0,o,l)}}let e=!1;const a=this._$AL;try{e=this.shouldUpdate(a),e?(this.willUpdate(a),(i=this._$EO)==null||i.forEach(s=>{var r;return(r=s.hostUpdate)==null?void 0:r.call(s)}),this.update(a)):this._$EM()}catch(s){throw e=!1,this._$EM(),s}e&&this._$AE(a)}willUpdate(e){}_$AE(e){var a;(a=this._$EO)==null||a.forEach(i=>{var s;return(s=i.hostUpdated)==null?void 0:s.call(i)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(a=>this._$ET(a,this[a]))),this._$EM()}updated(e){}firstUpdated(e){}};S.elementStyles=[],S.shadowRootOptions={mode:"open"},S[E("elementProperties")]=new Map,S[E("finalized")]=new Map,te==null||te({ReactiveElement:S}),($.reactiveElementVersions??($.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const O=globalThis,xe=t=>t,W=O.trustedTypes,we=W?W.createPolicy("lit-html",{createHTML:t=>t}):void 0,Ne="$lit$",w=`lit$${Math.random().toFixed(9).slice(2)}$`,Ee="?"+w,Qe=`<${Ee}>`,A=document,I=()=>A.createComment(""),D=t=>t===null||typeof t!="object"&&typeof t!="function",me=Array.isArray,et=t=>me(t)||typeof(t==null?void 0:t[Symbol.iterator])=="function",se=`[ 	
\f\r]`,N=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,$e=/-->/g,ke=/>/g,k=RegExp(`>|${se}(?:([^\\s"'>=/]+)(${se}*=${se}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),_e=/'/g,Ce=/"/g,Oe=/^(?:script|style|textarea|title)$/i,tt=t=>(e,...a)=>({_$litType$:t,strings:e,values:a}),d=tt(1),P=Symbol.for("lit-noChange"),g=Symbol.for("lit-nothing"),Ae=new WeakMap,_=A.createTreeWalker(A,129);function Ie(t,e){if(!me(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return we!==void 0?we.createHTML(e):e}const st=(t,e)=>{const a=t.length-1,i=[];let s,r=e===2?"<svg>":e===3?"<math>":"",o=N;for(let c=0;c<a;c++){const l=t[c];let h,f,p=-1,y=0;for(;y<l.length&&(o.lastIndex=y,f=o.exec(l),f!==null);)y=o.lastIndex,o===N?f[1]==="!--"?o=$e:f[1]!==void 0?o=ke:f[2]!==void 0?(Oe.test(f[2])&&(s=RegExp("</"+f[2],"g")),o=k):f[3]!==void 0&&(o=k):o===k?f[0]===">"?(o=s??N,p=-1):f[1]===void 0?p=-2:(p=o.lastIndex-f[2].length,h=f[1],o=f[3]===void 0?k:f[3]==='"'?Ce:_e):o===Ce||o===_e?o=k:o===$e||o===ke?o=N:(o=k,s=void 0);const x=o===k&&t[c+1].startsWith("/>")?" ":"";r+=o===N?l+Qe:p>=0?(i.push(h),l.slice(0,p)+Ne+l.slice(p)+w+x):l+w+(p===-2?c:x)}return[Ie(t,r+(t[a]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]};class T{constructor({strings:e,_$litType$:a},i){let s;this.parts=[];let r=0,o=0;const c=e.length-1,l=this.parts,[h,f]=st(e,a);if(this.el=T.createElement(h,i),_.currentNode=this.el.content,a===2||a===3){const p=this.el.content.firstChild;p.replaceWith(...p.childNodes)}for(;(s=_.nextNode())!==null&&l.length<c;){if(s.nodeType===1){if(s.hasAttributes())for(const p of s.getAttributeNames())if(p.endsWith(Ne)){const y=f[o++],x=s.getAttribute(p).split(w),G=/([.?@])?(.*)/.exec(y);l.push({type:1,index:r,name:G[2],strings:x,ctor:G[1]==="."?it:G[1]==="?"?rt:G[1]==="@"?ot:K}),s.removeAttribute(p)}else p.startsWith(w)&&(l.push({type:6,index:r}),s.removeAttribute(p));if(Oe.test(s.tagName)){const p=s.textContent.split(w),y=p.length-1;if(y>0){s.textContent=W?W.emptyScript:"";for(let x=0;x<y;x++)s.append(p[x],I()),_.nextNode(),l.push({type:2,index:++r});s.append(p[y],I())}}}else if(s.nodeType===8)if(s.data===Ee)l.push({type:2,index:r});else{let p=-1;for(;(p=s.data.indexOf(w,p+1))!==-1;)l.push({type:7,index:r}),p+=w.length-1}r++}}static createElement(e,a){const i=A.createElement("template");return i.innerHTML=e,i}}function M(t,e,a=t,i){var o,c;if(e===P)return e;let s=i!==void 0?(o=a._$Co)==null?void 0:o[i]:a._$Cl;const r=D(e)?void 0:e._$litDirective$;return(s==null?void 0:s.constructor)!==r&&((c=s==null?void 0:s._$AO)==null||c.call(s,!1),r===void 0?s=void 0:(s=new r(t),s._$AT(t,a,i)),i!==void 0?(a._$Co??(a._$Co=[]))[i]=s:a._$Cl=s),s!==void 0&&(e=M(t,s._$AS(t,e.values),s,i)),e}class at{constructor(e,a){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=a}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:a},parts:i}=this._$AD,s=((e==null?void 0:e.creationScope)??A).importNode(a,!0);_.currentNode=s;let r=_.nextNode(),o=0,c=0,l=i[0];for(;l!==void 0;){if(o===l.index){let h;l.type===2?h=new H(r,r.nextSibling,this,e):l.type===1?h=new l.ctor(r,l.name,l.strings,this,e):l.type===6&&(h=new nt(r,this,e)),this._$AV.push(h),l=i[++c]}o!==(l==null?void 0:l.index)&&(r=_.nextNode(),o++)}return _.currentNode=A,s}p(e){let a=0;for(const i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,a),a+=i.strings.length-2):i._$AI(e[a])),a++}}class H{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,a,i,s){this.type=2,this._$AH=g,this._$AN=void 0,this._$AA=e,this._$AB=a,this._$AM=i,this.options=s,this._$Cv=(s==null?void 0:s.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const a=this._$AM;return a!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=a.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,a=this){e=M(this,e,a),D(e)?e===g||e==null||e===""?(this._$AH!==g&&this._$AR(),this._$AH=g):e!==this._$AH&&e!==P&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):et(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==g&&D(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){var r;const{values:a,_$litType$:i}=e,s=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=T.createElement(Ie(i.h,i.h[0]),this.options)),i);if(((r=this._$AH)==null?void 0:r._$AD)===s)this._$AH.p(a);else{const o=new at(s,this),c=o.u(this.options);o.p(a),this.T(c),this._$AH=o}}_$AC(e){let a=Ae.get(e.strings);return a===void 0&&Ae.set(e.strings,a=new T(e)),a}k(e){me(this._$AH)||(this._$AH=[],this._$AR());const a=this._$AH;let i,s=0;for(const r of e)s===a.length?a.push(i=new H(this.O(I()),this.O(I()),this,this.options)):i=a[s],i._$AI(r),s++;s<a.length&&(this._$AR(i&&i._$AB.nextSibling,s),a.length=s)}_$AR(e=this._$AA.nextSibling,a){var i;for((i=this._$AP)==null?void 0:i.call(this,!1,!0,a);e!==this._$AB;){const s=xe(e).nextSibling;xe(e).remove(),e=s}}setConnected(e){var a;this._$AM===void 0&&(this._$Cv=e,(a=this._$AP)==null||a.call(this,e))}}class K{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,a,i,s,r){this.type=1,this._$AH=g,this._$AN=void 0,this.element=e,this.name=a,this._$AM=s,this.options=r,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=g}_$AI(e,a=this,i,s){const r=this.strings;let o=!1;if(r===void 0)e=M(this,e,a,0),o=!D(e)||e!==this._$AH&&e!==P,o&&(this._$AH=e);else{const c=e;let l,h;for(e=r[0],l=0;l<r.length-1;l++)h=M(this,c[i+l],a,l),h===P&&(h=this._$AH[l]),o||(o=!D(h)||h!==this._$AH[l]),h===g?e=g:e!==g&&(e+=(h??"")+r[l+1]),this._$AH[l]=h}o&&!s&&this.j(e)}j(e){e===g?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class it extends K{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===g?void 0:e}}class rt extends K{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==g)}}class ot extends K{constructor(e,a,i,s,r){super(e,a,i,s,r),this.type=5}_$AI(e,a=this){if((e=M(this,e,a,0)??g)===P)return;const i=this._$AH,s=e===g&&i!==g||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,r=e!==g&&(i===g||s);s&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var a;typeof this._$AH=="function"?this._$AH.call(((a=this.options)==null?void 0:a.host)??this.element,e):this._$AH.handleEvent(e)}}class nt{constructor(e,a,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=a,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){M(this,e)}}const ae=O.litHtmlPolyfillSupport;ae==null||ae(T,H),(O.litHtmlVersions??(O.litHtmlVersions=[])).push("3.3.2");const De=(t,e,a)=>{const i=(a==null?void 0:a.renderBefore)??e;let s=i._$litPart$;if(s===void 0){const r=(a==null?void 0:a.renderBefore)??null;i._$litPart$=s=new H(e.insertBefore(I(),r),r,void 0,a??{})}return s._$AI(t),s};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const C=globalThis;class m extends S{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var a;const e=super.createRenderRoot();return(a=this.renderOptions).renderBefore??(a.renderBefore=e.firstChild),e}update(e){const a=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=De(a,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return P}}var ze;m._$litElement$=!0,m.finalized=!0,(ze=C.litElementHydrateSupport)==null||ze.call(C,{LitElement:m});const ie=C.litElementPolyfillSupport;ie==null||ie({LitElement:m});(C.litElementVersions??(C.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const v=t=>(e,a)=>{a!==void 0?a.addInitializer(()=>{customElements.define(t,e)}):customElements.define(t,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const lt={attribute:!0,type:String,converter:j,reflect:!1,hasChanged:he},ct=(t=lt,e,a)=>{const{kind:i,metadata:s}=a;let r=globalThis.litPropertyMetadata.get(s);if(r===void 0&&globalThis.litPropertyMetadata.set(s,r=new Map),i==="setter"&&((t=Object.create(t)).wrapped=!0),r.set(a.name,t),i==="accessor"){const{name:o}=a;return{set(c){const l=e.get.call(this);e.set.call(this,c),this.requestUpdate(o,l,t,!0,c)},init(c){return c!==void 0&&this.C(o,void 0,t,c),c}}}if(i==="setter"){const{name:o}=a;return function(c){const l=this[o];e.call(this,c),this.requestUpdate(o,l,t,!0,c)}}throw Error("Unsupported decorator location: "+i)};function dt(t){return(e,a)=>typeof a=="object"?ct(t,e,a):((i,s,r)=>{const o=s.hasOwnProperty(r);return s.constructor.createProperty(r,i),o?Object.getOwnPropertyDescriptor(s,r):void 0})(t,e,a)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function u(t){return dt({...t,state:!0,attribute:!1})}const pt={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"功能",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"v2.0 现已发布",title:{part1:"真正可用的",accent:"AI 工程师",part2:""},description:"不再当 AI 的保姆。Pi 处理上下文检索、并行子代理、安全审计和多通道部署 — 你专注于架构，而非提示词工程。",cta:{primary:"开始使用",secondary:"阅读文档"},stats:{commands:"内置命令",extensions:"扩展插件",productivity:"效率提升"}},features:{label:"核心架构",title:"编排，不只是对话",subtitle:"从语义代码搜索到多代理协作，从安全审计到生产部署。",workflow:{title:"五阶段工作流",desc:"强制管线：上下文检索 → 分析 → 原型 → 实施 → 审计。没有捷径，没有幻觉编辑。",features:["黄金法则：先检索再修改","Unified Diff 隔离","强制交付前审查","L1-L4 复杂度路由"],metrics:{tasks:"任务",success:"成功率",active:"活跃"}},skills:{title:"42 技能",desc:"语义搜索、AST 操作、系统设计、Office 自动化。",tags:["ace-tool","ast-grep","codemap","web-fetch","+38 更多"]},subagents:{title:"25+ 代理",desc:"通过 Crew 协议协调的专用代理。",agents:["侦察","规划","执行","审查","视觉","研究","API测试","安全","简化","代码图","头脑风暴","系统设计"]},search:{title:"代码搜索",desc:"自然语言到精确位置。三层搜索，零遗漏。",example:'pi /search "认证中间件"'},gateway:{title:"多通道网关",desc:"一个服务支持 Telegram、Discord、WebChat、OpenAI API。",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"网关",title:"进程编排器",subtitle:"管理 AI 代理池并路由消息。通道无关、插件优先、纵深安全。",layers:{channels:{title:"通道",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"管线",desc:"分发 → 去重 → 解析 → 处理"},plugins:{title:"插件",desc:"16 钩子 · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 路由 · 定时 · 事件"},security:{title:"安全",desc:"认证 · 执行守卫 · SSRF · 白名单"}}},workflow:{label:"工作流",title:"五阶段强制管线",subtitle:"每个任务都经过检索、分析、原型、实施和审计。质量源于设计。",phases:[{num:"01",title:"检索",desc:"语义搜索、精确匹配、语法结构"},{num:"02",title:"分析",desc:"侦察派发、策略选择"},{num:"03",title:"原型",desc:"外部模型 diff、内部重构"},{num:"04",title:"实施",desc:"精准编辑、依赖检查"},{num:"05",title:"审计",desc:"Codex 审查、测试验证"}]},extensions:{label:"扩展",title:"无限扩展",subtitle:"从 CLI 命令到 TUI 组件，从网关插件到定时任务。",categories:{commands:{title:"命令",desc:"斜杠命令和快捷键"},tools:{title:"工具",desc:"可复用能力"},gateway:{title:"网关",desc:"通道集成"}}},comparison:{label:"对比",title:"不是又一个包装器",subtitle:"为严肃工程而生，非玩具项目。",headers:{feature:"能力",pi:"Pi Agent",others:"典型工具"},rows:[{feature:"多阶段工作流",pi:"5 个强制阶段",others:"单步执行"},{feature:"上下文检索",pi:"语义 + 精确 + AST",others:"基础搜索"},{feature:"安全模型",pi:"五层防御",others:"最小化"},{feature:"子代理系统",pi:"Crew 网格协议",others:"无"},{feature:"网关",pi:"多通道 + RPC",others:"单一接口"}]},cta:{title:"准备更快交付？",subtitle:"加入那些不再当 AI 保姆、开始真正架构的工程师。",button:"开始使用"},footer:{tagline:"工程级 AI 编排。",links:{docs:"文档",github:"GitHub",discord:"Discord"},copyright:"精准构建。"}},ht={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Now in v2.0",title:{part1:"The ",accent:"AI Engineer",part2:" You Actually Want"},description:"Stop babysitting AI agents. Pi handles context retrieval, parallel subagents, security audits, and multi-channel deployment — so you focus on architecture, not prompting.",cta:{primary:"Get Started",secondary:"Read Docs"},stats:{commands:"Built-in Commands",extensions:"Extensions",productivity:"Faster Delivery"}},features:{label:"Core Architecture",title:"Orchestration, Not Just Chat",subtitle:"From semantic code search to multi-agent crews, from security audits to production deployment.",workflow:{title:"5-Phase Workflow",desc:"Mandatory pipeline: Context Retrieval → Analysis → Prototyping → Implementation → Audit. No shortcuts, no hallucinated edits.",features:["Golden Rule: retrieve before modify","Unified Diff isolation","Forced pre-delivery review","L1-L4 complexity routing"],metrics:{tasks:"Tasks",success:"Success",active:"Active"}},skills:{title:"42 Skills",desc:"Semantic search, AST manipulation, system design, Office automation.",tags:["ace-tool","ast-grep","codemap","web-fetch","+38 more"]},subagents:{title:"25+ Agents",desc:"Specialized agents coordinated via Crew protocol.",agents:["scout","planner","worker","reviewer","vision","researcher","api-tester","security","simplifier","codemap","brainstormer","system-design"]},search:{title:"Code Search",desc:"Natural language to exact location. Three layers, zero misses.",example:'pi /search "auth middleware"'},gateway:{title:"Multi-Channel Gateway",desc:"One service for Telegram, Discord, WebChat, OpenAI API.",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"Gateway",title:"Process Orchestrator",subtitle:"Manage AI agent pools and route messages. Channel-agnostic, plugin-first, security-in-depth.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Resolve → Process"},plugins:{title:"Plugins",desc:"16 Hooks · Registry · Conflicts"},runtime:{title:"Runtime",desc:"RPC Pool · Router · Cron · Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF · Allowlist"}}},workflow:{label:"Workflow",title:"5-Phase Mandatory Pipeline",subtitle:"Every task goes through retrieval, analysis, prototyping, implementation, and audit. Quality by design.",phases:[{num:"01",title:"Retrieve",desc:"Semantic search, exact match, syntax structure"},{num:"02",title:"Analyze",desc:"Scout dispatch, strategy selection"},{num:"03",title:"Prototype",desc:"External model diff, internal refactor"},{num:"04",title:"Implement",desc:"Surgical edits, dependency checks"},{num:"05",title:"Audit",desc:"Codex review, test verification"}]},extensions:{label:"Extensions",title:"Infinite Extensibility",subtitle:"From CLI commands to TUI components, from gateway plugins to cron jobs.",categories:{commands:{title:"Commands",desc:"Slash commands and shortcuts"},tools:{title:"Tools",desc:"Reusable capabilities"},gateway:{title:"Gateway",desc:"Channel integrations"}}},comparison:{label:"Comparison",title:"Not Another Wrapper",subtitle:"Purpose-built for serious engineering, not toy projects.",headers:{feature:"Capability",pi:"Pi Agent",others:"Typical Tools"},rows:[{feature:"Multi-phase workflow",pi:"5 mandatory phases",others:"Single-step"},{feature:"Context retrieval",pi:"Semantic + exact + AST",others:"Basic search"},{feature:"Security model",pi:"5-layer defense",others:"Minimal"},{feature:"Subagent system",pi:"Crew mesh protocol",others:"None"},{feature:"Gateway",pi:"Multi-channel + RPC",others:"Single interface"}]},cta:{title:"Ready to Ship Faster?",subtitle:"Join the engineers who stopped babysitting AI and started architecting.",button:"Get Started"},footer:{tagline:"Engineering-grade AI orchestration.",links:{docs:"Documentation",github:"GitHub",discord:"Discord"},copyright:"Built with precision."}},re={"zh-CN":pt,"en-US":ht},Se="pi-agent-locale";class mt{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const a=localStorage.getItem(Se);if(a&&re[a]){this.currentLocale=a;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(re[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(Se,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(a=>a())}}t(e){const a=e.split(".");let i=re[this.currentLocale];for(const s of a)if(i&&typeof i=="object"&&s in i)i=i[s];else return e;return typeof i=="string"?i:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const n=new mt;var gt=Object.defineProperty,ut=Object.getOwnPropertyDescriptor,Q=(t,e,a,i)=>{for(var s=i>1?void 0:i?ut(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&gt(e,a,s),s};const Pe=[{key:"features",id:"features"},{key:"gateway",id:"gateway"},{key:"workflow",id:"workflow"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],oe="https://github.com/Dwsy/agent";let z=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=d`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`,this._burgerIcon=d`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen?d`<path d="M18 6L6 18M6 6l12 12"/>`:d`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var t,e;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const t=new Map;this._io=new IntersectionObserver(e=>{for(const s of e)s.isIntersecting?t.set(s.target.id,s.intersectionRatio):t.delete(s.target.id);let a="",i=0;t.forEach((s,r)=>{s>i&&(i=s,a=r)}),a!==this.activeId&&(this.activeId=a)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of Pe){const a=document.getElementById(e.id);a&&this._io.observe(a)}})}t(t){return n.t(t)}_toggleLocale(){n.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const t=Pe.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return d`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-mark">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="links">
          ${t.map(e=>d`
            <a href="#${e.id}" class="link" ?active=${this.activeId===e.id}>${e.label}</a>
          `)}
        </div>

        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale}>
            ${this.locale==="zh-CN"?"EN":"中文"}
          </button>
          <a href=${oe} target="_blank" class="gh-btn" aria-label="GitHub">
            ${this._ghIcon}
          </a>
          <a href=${oe} class="cta" target="_blank">${this.t("navbar.cta")}</a>
          <button class="burger" @click=${this._toggleMenu}>${this._burgerIcon}</button>
        </div>
      </nav>

      <div class="mobile" ?open=${this.menuOpen}>
        ${t.map(e=>d`
          <a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>
            ${e.label}
          </a>
        `)}
        <a href=${oe} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
      </div>
    `}};z.styles=b`
    :host {
      display: block;
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      width: calc(100% - 2rem);
      max-width: 1200px;
    }

    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 1rem;
      background: rgba(24, 24, 27, 0.7);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 20px 40px -15px rgba(0, 0, 0, 0.3);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    :host([scrolled]) .nav {
      background: rgba(24, 24, 27, 0.9);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 25px 50px -12px rgba(0, 0, 0, 0.4);
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

    .link:hover {
      color: #fafafa;
      background: rgba(255, 255, 255, 0.05);
    }

    .link[active] {
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
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

    .cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .cta:active {
      transform: translateY(0) scale(0.98);
    }

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
      background: rgba(24, 24, 27, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
      padding: 0.75rem;
      flex-direction: column;
      gap: 0.25rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
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
    @media (max-width: 768px) {
      .links, .cta { display: none; }
      .burger { display: block; }
    }
  `;Q([u()],z.prototype,"locale",2);Q([u()],z.prototype,"menuOpen",2);Q([u()],z.prototype,"activeId",2);z=Q([v("pi-navbar")],z);var ft=Object.defineProperty,vt=Object.getOwnPropertyDescriptor,Te=(t,e,a,i)=>{for(var s=i>1?void 0:i?vt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&ft(e,a,s),s};let Y=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n);return d`
      <section class="hero" id="features">
        <div class="content">
          <div class="badge">
            <span class="badge-dot"></span>
            ${t("hero.badge")}
          </div>

          <h1>
            ${t("hero.title.part1")}
            <span class="accent">${t("hero.title.accent")}</span>
            ${t("hero.title.part2")}
          </h1>

          <p class="description">${t("hero.description")}</p>

          <div class="cta-group">
            <a href="https://github.com/Dwsy/agent" class="cta-primary" target="_blank" rel="noopener">
              ${t("hero.cta.primary")}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
            <a href="#gateway" class="cta-secondary">
              ${t("hero.cta.secondary")}
            </a>
          </div>

          <div class="stats">
            <div class="stat">
              <span class="stat-value">50+</span>
              <span class="stat-label">${t("hero.stats.commands")}</span>
            </div>
            <div class="stat">
              <span class="stat-value">20+</span>
              <span class="stat-label">${t("hero.stats.extensions")}</span>
            </div>
            <div class="stat">
              <span class="stat-value">10x</span>
              <span class="stat-label">${t("hero.stats.productivity")}</span>
            </div>
          </div>
        </div>

        <div class="visual">
          <div class="terminal">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
              <span class="terminal-title">pi-agent</span>
            </div>
            <div class="terminal-body">
              <div class="terminal-line">
                <span class="terminal-prompt">$</span>
                <span class="terminal-command">pi "Create a React app"</span>
              </div>
              <div class="terminal-output">
                Analyzing requirements...<br>
                Creating project structure...<br>
                Installing dependencies...<br>
                <span style="color: #10b981;">Done in 3.2s</span>
              </div>
              <div class="terminal-line">
                <span class="terminal-prompt">$</span>
                <span class="terminal-command">pi /research "AI trends 2025"</span>
                <span class="terminal-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}};Y.styles=b`
    :host {
      display: block;
      width: 100%;
    }

    .hero {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: center;
      padding: 6rem 4rem 4rem;
      position: relative;
      overflow: hidden;
    }

    /* Background - Subtle Grid + Gradient */
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 20% 40%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 80% 60%, rgba(16, 185, 129, 0.05) 0%, transparent 50%);
      pointer-events: none;
    }

    .hero::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(63, 63, 70, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(63, 63, 70, 0.05) 1px, transparent 1px);
      background-size: 80px 80px;
      pointer-events: none;
    }

    /* Left Content - Asymmetric Alignment */
    .content {
      position: relative;
      z-index: 1;
      padding-left: 5vw;
      max-width: 640px;
    }

    /* Status Badge */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 9999px;
      color: #34d399;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 2rem;
      width: fit-content;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse-dot 2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.8); }
    }

    /* Typography - Geist, Tight Tracking */
    h1 {
      font-size: clamp(2.75rem, 5vw, 4.5rem);
      font-weight: 600;
      line-height: 1.05;
      margin-bottom: 1.5rem;
      color: #fafafa;
      letter-spacing: -0.03em;
    }

    h1 .accent {
      color: #10b981;
      font-weight: 700;
    }

    .description {
      font-size: 1.125rem;
      line-height: 1.7;
      color: #a1a1aa;
      max-width: 480px;
      margin-bottom: 2.5rem;
    }

    /* CTA Group */
    .cta-group {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 3rem;
    }

    .cta-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.75rem;
      background: #10b981;
      color: #09090b;
      font-weight: 600;
      font-size: 0.9375rem;
      border-radius: 0.625rem;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
    }

    .cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
    }

    .cta-primary:active {
      transform: translateY(0) scale(0.98);
    }

    .cta-secondary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      background: transparent;
      color: #a1a1aa;
      font-weight: 500;
      font-size: 0.9375rem;
      border: 1px solid #3f3f46;
      border-radius: 0.625rem;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cta-secondary:hover {
      border-color: #52525b;
      color: #fafafa;
      background: rgba(255, 255, 255, 0.03);
    }

    /* Stats Row */
    .stats {
      display: flex;
      gap: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #27272a;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      letter-spacing: -0.02em;
    }

    .stat-label {
      font-size: 0.8125rem;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Right Side - Visual */
    .visual {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-right: 2rem;
    }

    .terminal {
      width: 100%;
      max-width: 520px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      overflow: hidden;
      box-shadow:
        0 40px 80px -20px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.03);
      animation: float 6s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-12px) rotate(0.5deg); }
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      background: #27272a;
      border-bottom: 1px solid #3f3f46;
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .terminal-dot.red { background: #ef4444; }
    .terminal-dot.yellow { background: #eab308; }
    .terminal-dot.green { background: #22c55e; }

    .terminal-title {
      margin-left: 0.5rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .terminal-body {
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      line-height: 1.7;
      color: #a1a1aa;
    }

    .terminal-line {
      display: flex;
      gap: 0.75rem;
    }

    .terminal-prompt {
      color: #10b981;
      flex-shrink: 0;
    }

    .terminal-cursor {
      display: inline-block;
      width: 8px;
      height: 1.2em;
      background: #10b981;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 2px;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .terminal-command {
      color: #fafafa;
    }

    .terminal-output {
      color: #71717a;
      margin: 0.5rem 0 1rem 1.5rem;
    }

    /* Mobile Override - Single Column */
    @media (max-width: 1024px) {
      .hero {
        grid-template-columns: 1fr;
        gap: 3rem;
        padding: 6rem 1.5rem 4rem;
      }

      .content {
        padding-left: 0;
        max-width: 100%;
      }

      .visual {
        padding-right: 0;
        order: -1;
      }

      .terminal {
        max-width: 100%;
      }

      .stats {
        gap: 2rem;
      }
    }

    @media (max-width: 640px) {
      h1 {
        font-size: 2.25rem;
      }

      .description {
        font-size: 1rem;
      }

      .cta-group {
        flex-direction: column;
        align-items: stretch;
      }

      .stats {
        flex-direction: column;
        gap: 1.5rem;
      }
    }
  `;Te([u()],Y.prototype,"locale",2);Y=Te([v("hero-section")],Y);var bt=Object.defineProperty,yt=Object.getOwnPropertyDescriptor,Re=(t,e,a,i)=>{for(var s=i>1?void 0:i?yt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&bt(e,a,s),s};let J=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}_handleMouseMove(t){const e=t.currentTarget,a=e.getBoundingClientRect(),i=(t.clientX-a.left)/a.width*100,s=(t.clientY-a.top)/a.height*100;e.style.setProperty("--mouse-x",`${i}%`),e.style.setProperty("--mouse-y",`${s}%`)}render(){const t=i=>n.t(i),e=n.getCurrentLocale()==="zh-CN",a=e?["侦察","规划","执行","审查","视觉","研究","API测","安全","简化","码图","脑暴","系统"]:["SC","PL","WR","RV","VS","RS","AP","SE","SI","CM","BR","SD"];return d`
      <section class="section" id="features">
        <div class="inner">
          <div class="header">
            <div class="header-left">
              <span class="label">${t("features.label")}</span>
              <h2 class="title">${t("features.title").replace(", ",",<br>")}</h2>
              <p class="subtitle">${t("features.subtitle")}</p>
            </div>
            <div class="header-right">
              <div class="stat-block">
                <div class="stat-value">42</div>
                <div class="stat-label">${e?"技能":"Skills"}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">25+</div>
                <div class="stat-label">${e?"代理":"Agents"}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">5</div>
                <div class="stat-label">${e?"阶段":"Phases"}</div>
              </div>
            </div>
          </div>

          <div class="grid">
            <!-- Row 1: Workflow (Large) -->
            <div class="card span-6 row-4" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon accent">WF</div>
                <span class="card-title">${t("features.workflow.title")}</span>
              </div>
              <p class="card-desc">${t("features.workflow.desc")}</p>
              <ul class="features">
                ${[0,1,2,3].map(i=>d`<li class="feature">${t(`features.workflow.features.${i}`)}</li>`)}
              </ul>
              <div class="status-widget">
                <div class="status-header">
                  <span class="status-dot"></span>
                  <span class="status-text">Live System Status</span>
                </div>
                <div class="status-metrics">
                  <div class="metric">
                    <span class="metric-value">2.4k</span>
                    <span class="metric-label">${t("features.workflow.metrics.tasks")}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">98.7%</span>
                    <span class="metric-label">${t("features.workflow.metrics.success")}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">142</span>
                    <span class="metric-label">${t("features.workflow.metrics.active")}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Skills -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon purple">SK</div>
                <span class="card-title">${t("features.skills.title")}</span>
              </div>
              <p class="card-desc">${t("features.skills.desc")}</p>
              <div class="skill-tags">
                ${[0,1,2,3,4].map(i=>d`<span class="skill-tag">${t(`features.skills.tags.${i}`)}</span>`)}
              </div>
            </div>

            <!-- Subagents Grid -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon blue">SA</div>
                <span class="card-title">${t("features.subagents.title")}</span>
              </div>
              <p class="card-desc">${t("features.subagents.desc")}</p>
              <div class="agent-grid">
                ${a.map((i,s)=>d`
                  <div class="agent-cell ${s<5?"active":""}">${i}</div>
                `)}
              </div>
            </div>

            <!-- Search -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon accent">SR</div>
                <span class="card-title">${t("features.search.title")}</span>
              </div>
              <p class="card-desc">${t("features.search.desc")}</p>
              <div class="terminal">
                <div class="terminal-line">
                  <span class="terminal-prompt">$</span>
                  <span class="terminal-command">${t("features.search.example")}</span>
                </div>
                <div class="terminal-line">
                  <span class="terminal-prompt">$</span>
                  <span class="terminal-command">ace "find middleware"</span>
                  <span class="terminal-cursor"></span>
                </div>
              </div>
            </div>

            <!-- Gateway Code -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon orange">GW</div>
                <span class="card-title">${t("features.gateway.title")}</span>
              </div>
              <p class="card-desc">${t("features.gateway.desc")}</p>
              <div class="code-preview">
                <div class="code-line">
                  <span class="code-num">1</span>
                  <span class="code-plain"><span class="code-keyword">await</span> <span class="code-func">gateway</span>.route({</span>
                </div>
                <div class="code-line">
                  <span class="code-num">2</span>
                  <span class="code-plain">  channel: <span class="code-string">'telegram'</span>,</span>
                </div>
                <div class="code-line">
                  <span class="code-num">3</span>
                  <span class="code-plain">  session: <span class="code-func">uuid</span>()</span>
                </div>
                <div class="code-line">
                  <span class="code-num">4</span>
                  <span class="code-plain">});</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}};J.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      margin-bottom: 5rem;
      align-items: end;
    }

    .header-left { max-width: 480px; }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1.25rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    .header-right {
      display: flex;
      gap: 3rem;
      justify-content: flex-end;
    }

    .stat-block {
      text-align: right;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 0.5rem;
    }

    /* Bento Grid - Asymmetric Masonry */
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      grid-auto-rows: 140px;
      gap: 1.25rem;
    }

    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
    }

    .card:hover {
      transform: translateY(-4px);
      border-color: #3f3f46;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(500px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(16, 185, 129, 0.08), transparent 40%);
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .card:hover::before { opacity: 1; }

    /* Card Sizes - True Asymmetric */
    .card.span-6 { grid-column: span 6; }
    .card.span-4 { grid-column: span 4; }
    .card.span-3 { grid-column: span 3; }
    .card.row-2 { grid-row: span 2; }
    .card.row-3 { grid-row: span 3; }
    .card.row-4 { grid-row: span 4; }

    /* Card Types */
    .card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .card-icon {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
      font-size: 0.875rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .card-icon.accent {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }

    .card-icon.purple {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
    }

    .card-icon.blue {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }

    .card-icon.orange {
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.01em;
    }

    .card-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
    }

    /* Feature List */
    .features {
      list-style: none;
      padding: 0;
      margin: auto 0 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.8125rem;
      color: #a1a1aa;
    }

    .feature::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #10b981;
      flex-shrink: 0;
    }

    /* Live Status Widget */
    .status-widget {
      margin-top: auto;
      padding: 1rem;
      background: rgba(16, 185, 129, 0.05);
      border-radius: 0.75rem;
      border: 1px solid rgba(16, 185, 129, 0.1);
    }

    .status-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    }

    .status-text {
      font-size: 0.6875rem;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .status-metrics {
      display: flex;
      gap: 1.5rem;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .metric-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: #fafafa;
      font-family: 'JetBrains Mono', monospace;
    }

    .metric-label {
      font-size: 0.6875rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Terminal Widget */
    .terminal {
      background: #0c0c0e;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }

    .terminal-line {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }

    .terminal-prompt {
      color: #10b981;
      flex-shrink: 0;
    }

    .terminal-command {
      color: #a1a1aa;
    }

    .terminal-cursor {
      display: inline-block;
      width: 6px;
      height: 1.2em;
      background: #10b981;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Code Preview */
    .code-preview {
      background: #0c0c0e;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6875rem;
      line-height: 1.7;
      overflow-x: auto;
    }

    .code-line { display: flex; gap: 0.75rem; }
    .code-num { color: #3f3f46; user-select: none; min-width: 1.5rem; }
    .code-keyword { color: #c084fc; }
    .code-string { color: #4ade80; }
    .code-func { color: #60a5fa; }
    .code-plain { color: #a1a1aa; }
    .code-comment { color: #52525b; }

    /* Skill Tags */
    .skill-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: auto;
    }

    .skill-tag {
      padding: 0.375rem 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #a1a1aa;
      transition: all 0.2s;
    }

    .skill-tag:hover {
      border-color: #3f3f46;
      color: #fafafa;
    }

    /* Agent Grid */
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin-top: auto;
    }

    .agent-cell {
      aspect-ratio: 1;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 0.5rem;
      display: grid;
      place-items: center;
      font-size: 0.625rem;
      color: #52525b;
      font-weight: 600;
      transition: all 0.3s;
    }

    .agent-cell:hover {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .agent-cell.active {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .header {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
      .header-right { justify-content: flex-start; }
      .grid {
        grid-template-columns: repeat(6, 1fr);
      }
      .card.span-6 { grid-column: span 6; }
      .card.span-4 { grid-column: span 3; }
      .card.span-3 { grid-column: span 3; }
    }

    @media (max-width: 640px) {
      .grid {
        grid-template-columns: 1fr;
        grid-auto-rows: auto;
      }
      .card.span-6,
      .card.span-4,
      .card.span-3 {
        grid-column: span 1;
      }
      .card.row-2,
      .card.row-3,
      .card.row-4 {
        grid-row: span 1;
      }
      .agent-grid {
        grid-template-columns: repeat(5, 1fr);
      }
    }
  `;Re([u()],J.prototype,"locale",2);J=Re([v("bento-grid")],J);var xt=Object.defineProperty,wt=Object.getOwnPropertyDescriptor,Be=(t,e,a,i)=>{for(var s=i>1?void 0:i?wt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&xt(e,a,s),s};let V=class extends m{constructor(){super(...arguments),this.messageCount=1247}connectedCallback(){super.connectedCallback(),this._interval=window.setInterval(()=>{this.messageCount+=Math.floor(Math.random()*3)},2e3)}disconnectedCallback(){super.disconnectedCallback(),this._interval&&clearInterval(this._interval)}render(){return d`
      <div class="viz-container">
        <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0" />
              <stop offset="50%" style="stop-color:#3b82f6;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Connection Paths -->
          <!-- Channels to Dispatcher -->
          <path class="connection" d="M 100 100 L 250 250" />
          <path class="connection" d="M 100 250 L 250 250" />
          <path class="connection" d="M 100 400 L 250 250" />
          
          <!-- Dispatcher to Pipeline -->
          <path class="connection" d="M 350 250 L 450 250" />
          
          <!-- Pipeline to Runtime -->
          <path class="connection" d="M 550 250 L 650 150" />
          <path class="connection" d="M 550 250 L 650 250" />
          <path class="connection" d="M 550 250 L 650 350" />

          <!-- Animated Flow Lines -->
          <path class="path-flow" d="M 100 100 L 250 250" />
          <path class="path-flow path-flow-purple" d="M 100 250 L 250 250" />
          <path class="path-flow path-flow-green" d="M 100 400 L 250 250" />
          <path class="path-flow" d="M 350 250 L 450 250" />
          <path class="path-flow path-flow-purple" d="M 550 250 L 650 150" />
          <path class="path-flow path-flow-green" d="M 550 250 L 650 350" />

          <!-- Channel Nodes -->
          <g transform="translate(60, 70)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">Telegram</text>
            <text class="node-label" x="40" y="42">Webhook</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <g transform="translate(60, 220)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">Discord</text>
            <text class="node-label" x="40" y="42">Gateway</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <g transform="translate(60, 370)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">WebChat</text>
            <text class="node-label" x="40" y="42">WebSocket</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <!-- Dispatcher -->
          <g transform="translate(250, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" fill="#1e293b" stroke="#3b82f6" />
            <text class="node-title" x="50" y="30">Dispatcher</text>
            <text class="node-label" x="50" y="50">Route & Load</text>
            <text class="node-label" x="50" y="65">Balance</text>
          </g>

          <!-- Pipeline -->
          <g transform="translate(450, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" fill="#1e293b" stroke="#a855f7" />
            <text class="node-title" x="50" y="30">Pipeline</text>
            <text class="node-label" x="50" y="50">16 Hooks</text>
            <text class="node-label" x="50" y="65">Transform</text>
          </g>

          <!-- Runtime Nodes -->
          <g transform="translate(650, 110)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">RPC Pool</text>
            <text class="node-label" x="50" y="50">Process</text>
            <text class="node-label" x="50" y="65">Manager</text>
          </g>

          <g transform="translate(650, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">Session</text>
            <text class="node-label" x="50" y="50">State</text>
            <text class="node-label" x="50" y="65">Router</text>
          </g>

          <g transform="translate(650, 310)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">Cron</text>
            <text class="node-label" x="50" y="50">Scheduled</text>
            <text class="node-label" x="50" y="65">Tasks</text>
          </g>

          <!-- Animated Particles -->
          <circle class="particle" cx="175" cy="175" r="4">
            <animate attributeName="cx" values="100;250" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="cy" values="100;250" dur="1.5s" repeatCount="indefinite" />
          </circle>

          <circle class="particle-purple" cx="175" cy="250" r="4">
            <animate attributeName="cx" values="100;250" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="cy" values="250;250" dur="1.2s" repeatCount="indefinite" />
          </circle>

          <circle class="particle-green" cx="175" cy="325" r="4">
            <animate attributeName="cx" values="100;250" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="cy" values="400;250" dur="1.8s" repeatCount="indefinite" />
          </circle>

          <circle class="particle" cx="400" cy="250" r="4">
            <animate attributeName="cx" values="350;550" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div class="legend">
          <div class="legend-item">
            <div class="legend-dot blue"></div>
            <span>Message Flow</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot purple"></div>
            <span>Transform</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot green"></div>
            <span>Response</span>
          </div>
        </div>

        <div class="counter">
          Messages: <span class="counter-value">${this.messageCount.toLocaleString()}</span>/s
        </div>
      </div>
    `}};V.styles=b`
    :host { display: block; width: 100%; }

    .viz-container {
      position: relative;
      width: 100%;
      height: 500px;
      background: #0c0c0e;
      border-radius: 1.25rem;
      overflow: hidden;
      border: 1px solid #27272a;
    }

    /* SVG Styles */
    svg {
      width: 100%;
      height: 100%;
    }

    .node {
      fill: #18181b;
      stroke: #27272a;
      stroke-width: 1;
      transition: all 0.3s ease;
    }

    .node:hover {
      stroke: #3b82f6;
      fill: #1e293b;
    }

    .node-label {
      fill: #a1a1aa;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    .node-title {
      fill: #fafafa;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Geist', sans-serif;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    /* Animated Particles */
    .particle {
      fill: #3b82f6;
      filter: drop-shadow(0 0 4px #3b82f6);
    }

    .particle-purple {
      fill: #a855f7;
      filter: drop-shadow(0 0 4px #a855f7);
    }

    .particle-green {
      fill: #10b981;
      filter: drop-shadow(0 0 4px #10b981);
    }

    /* Connection Lines */
    .connection {
      fill: none;
      stroke: #27272a;
      stroke-width: 1.5;
    }

    .connection.active {
      stroke: url(#gradient-blue);
      stroke-width: 2;
    }

    /* Animated Path */
    .path-flow {
      fill: none;
      stroke: #3b82f6;
      stroke-width: 2;
      stroke-dasharray: 8 4;
      animation: dash 1s linear infinite;
      opacity: 0.6;
    }

    .path-flow-purple {
      stroke: #a855f7;
      animation-delay: 0.3s;
    }

    .path-flow-green {
      stroke: #10b981;
      animation-delay: 0.6s;
    }

    @keyframes dash {
      to { stroke-dashoffset: -12; }
    }

    /* Status Indicators */
    .status-dot {
      animation: pulse-status 2s ease-in-out infinite;
    }

    @keyframes pulse-status {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Legend */
    .legend {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      display: flex;
      gap: 1.5rem;
      padding: 0.75rem 1rem;
      background: rgba(24, 24, 27, 0.9);
      border: 1px solid #27272a;
      border-radius: 0.625rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.6875rem;
      color: #a1a1aa;
    }

    .legend-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .legend-dot.blue { background: #3b82f6; }
    .legend-dot.purple { background: #a855f7; }
    .legend-dot.green { background: #10b981; }

    /* Data Counter */
    .counter {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.5rem 0.875rem;
      background: rgba(24, 24, 27, 0.9);
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #a1a1aa;
    }

    .counter-value {
      color: #10b981;
      font-weight: 600;
    }
  `;Be([u()],V.prototype,"messageCount",2);V=Be([v("gateway-visualization")],V);var $t=Object.defineProperty,kt=Object.getOwnPropertyDescriptor,He=(t,e,a,i)=>{for(var s=i>1?void 0:i?kt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&$t(e,a,s),s};let F=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=n.getCurrentLocale()==="zh-CN";return d`
      <section class="section" id="gateway">
        <div class="inner">
          <div class="header">
            <span class="label">${t("gateway.label")}</span>
            <h2 class="title">${t("gateway.title")}</h2>
            <p class="subtitle">${t("gateway.subtitle")}</p>
          </div>

          <gateway-visualization></gateway-visualization>

          <div class="features">
            <div class="feature">
              <div class="feature-value">65+</div>
              <div class="feature-label">${e?"模块":"Modules"}</div>
            </div>
            <div class="feature">
              <div class="feature-value">16</div>
              <div class="feature-label">${e?"生命周期钩子":"Lifecycle Hooks"}</div>
            </div>
            <div class="feature">
              <div class="feature-value">3</div>
              <div class="feature-label">${e?"通道":"Channels"}</div>
            </div>
            <div class="feature">
              <div class="feature-value">&lt;10ms</div>
              <div class="feature-label">${e?"延迟":"Latency"}</div>
            </div>
          </div>
        </div>
      </section>
    `}};F.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      margin-bottom: 4rem;
      max-width: 480px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #3b82f6;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #3b82f6;
    }

    .title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Feature Grid */
    .features {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-top: 3rem;
    }

    .feature {
      padding: 1.25rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      transition: all 0.3s ease;
    }

    .feature:hover {
      border-color: #3b82f6;
      transform: translateY(-2px);
    }

    .feature-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      margin-bottom: 0.25rem;
    }

    .feature-label {
      font-size: 0.8125rem;
      color: #71717a;
    }

    @media (max-width: 768px) {
      .features { grid-template-columns: repeat(2, 1fr); }
    }
  `;He([u()],F.prototype,"locale",2);F=He([v("gateway-section")],F);var _t=Object.defineProperty,Ct=Object.getOwnPropertyDescriptor,ge=(t,e,a,i)=>{for(var s=i>1?void 0:i?Ct(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&_t(e,a,s),s};let R=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.progress=0}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._progressInterval=window.setInterval(()=>{this.progress=(this.progress+1)%100},100)}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),this._progressInterval&&clearInterval(this._progressInterval)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=n.getCurrentLocale()==="zh-CN",a=[{num:"01",title:t("workflow.phases.0.title"),desc:t("workflow.phases.0.desc"),tools:["ace","rg","ast-grep"]},{num:"02",title:t("workflow.phases.1.title"),desc:t("workflow.phases.1.desc"),tools:["scout","planner"]},{num:"03",title:t("workflow.phases.2.title"),desc:t("workflow.phases.2.desc"),tools:["Gemini","diff"]},{num:"04",title:t("workflow.phases.3.title"),desc:t("workflow.phases.3.desc"),tools:["edit","test"]},{num:"05",title:t("workflow.phases.4.title"),desc:t("workflow.phases.4.desc"),tools:["Codex","verify"]}];return d`
      <section class="section" id="workflow">
        <div class="inner">
          <div class="header">
            <span class="label">${e?"工作流管线":"Workflow Pipeline"}</span>
            <h2 class="title">${t("workflow.title")}</h2>
            <p class="subtitle">${t("workflow.subtitle")}</p>
          </div>

          <div class="timeline">
            <!-- Connecting Line SVG -->
            <svg class="timeline-svg" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="timeline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#f97316;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#fb923c;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#f97316;stop-opacity:1" />
                </linearGradient>
              </defs>
              <!-- Background path -->
              <path class="path-bg" d="M 100 50 L 900 50" />
              <!-- Active animated path -->
              <path class="path-active" d="M 100 50 L 900 50" />
            </svg>

            <div class="phases">
              ${a.map((i,s)=>d`
                <div class="phase">
                  <div class="phase-node">
                    <span class="phase-number">${i.num}</span>
                    ${s<3?d`<span class="phase-status"></span>`:""}
                  </div>
                  <h3 class="phase-title">${i.title}</h3>
                  <p class="phase-desc">${i.desc}</p>
                  <div class="phase-tools">
                    ${i.tools.map(r=>d`<span class="tool-tag">${r}</span>`)}
                  </div>
                </div>
              `)}
            </div>
          </div>

          <div class="progress-container">
            <div class="progress-header">
              <span class="progress-label">${e?"当前任务进度":"Current Task Progress"}</span>
              <span class="progress-value">${this.progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${this.progress}%"></div>
            </div>
          </div>
        </div>
      </section>
    `}};R.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      text-align: center;
      margin-bottom: 5rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #f97316;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Timeline Container */
    .timeline {
      position: relative;
      padding: 2rem 0;
    }

    /* SVG Path */
    .timeline-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .path-bg {
      fill: none;
      stroke: #27272a;
      stroke-width: 2;
      stroke-dasharray: 8 4;
    }

    .path-active {
      fill: none;
      stroke: url(#timeline-gradient);
      stroke-width: 3;
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: draw-path 3s ease-out forwards;
    }

    @keyframes draw-path {
      to { stroke-dashoffset: 0; }
    }

    /* Phase Nodes */
    .phases {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .phase {
      text-align: center;
      opacity: 0;
      transform: translateY(20px);
      animation: fade-up 0.6s ease-out forwards;
    }

    .phase:nth-child(1) { animation-delay: 0.2s; }
    .phase:nth-child(2) { animation-delay: 0.6s; }
    .phase:nth-child(3) { animation-delay: 1.0s; }
    .phase:nth-child(4) { animation-delay: 1.4s; }
    .phase:nth-child(5) { animation-delay: 1.8s; }

    @keyframes fade-up {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .phase-node {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.25rem;
      background: #18181b;
      border: 2px solid #27272a;
      border-radius: 50%;
      display: grid;
      place-items: center;
      position: relative;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .phase:hover .phase-node {
      border-color: #f97316;
      box-shadow: 0 0 30px rgba(249, 115, 22, 0.2);
      transform: scale(1.05);
    }

    .phase-number {
      font-size: 1.25rem;
      font-weight: 700;
      color: #52525b;
      font-family: 'JetBrains Mono', monospace;
      transition: color 0.3s;
    }

    .phase:hover .phase-number {
      color: #f97316;
    }

    .phase-status {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: #10b981;
      border: 3px solid #18181b;
      border-radius: 50%;
      animation: pulse-status 2s ease-in-out infinite;
    }

    @keyframes pulse-status {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.7; }
    }

    .phase-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .phase-desc {
      font-size: 0.8125rem;
      color: #71717a;
      line-height: 1.6;
      max-width: 180px;
      margin: 0 auto;
    }

    /* Tools Tags */
    .phase-tools {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.375rem;
      margin-top: 1rem;
    }

    .tool-tag {
      padding: 0.25rem 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Arrow Indicators */
    .arrow {
      position: absolute;
      top: 32px;
      width: 40px;
      height: 2px;
      background: linear-gradient(90deg, #27272a, #3f3f46);
    }

    .arrow::after {
      content: '';
      position: absolute;
      right: 0;
      top: -3px;
      border: 4px solid transparent;
      border-left: 6px solid #3f3f46;
    }

    /* Progress Bar */
    .progress-container {
      margin-top: 4rem;
      padding: 1.5rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .progress-label {
      font-size: 0.8125rem;
      color: #a1a1aa;
    }

    .progress-value {
      font-size: 0.8125rem;
      color: #f97316;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .progress-bar {
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #f97316, #fb923c);
      border-radius: 2px;
      animation: shimmer-progress 2s linear infinite;
      background-size: 200% 100%;
    }

    @keyframes shimmer-progress {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .phases {
        grid-template-columns: repeat(3, 1fr);
        gap: 2rem;
      }
    }

    @media (max-width: 640px) {
      .phases {
        grid-template-columns: 1fr;
        gap: 2.5rem;
      }

      .phase-node {
        width: 56px;
        height: 56px;
      }
    }
  `;ge([u()],R.prototype,"locale",2);ge([u()],R.prototype,"progress",2);R=ge([v("workflow-timeline")],R);var At=Object.getOwnPropertyDescriptor,St=(t,e,a,i)=>{for(var s=i>1?void 0:i?At(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=o(s)||s);return s};let ne=class extends m{render(){return d`<workflow-timeline></workflow-timeline>`}};ne.styles=b`
    :host { display: block; width: 100%; }
  `;ne=St([v("workflow-section")],ne);var Pt=Object.defineProperty,Mt=Object.getOwnPropertyDescriptor,ue=(t,e,a,i)=>{for(var s=i>1?void 0:i?Mt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&Pt(e,a,s),s};let B=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.activeTab=0}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=n.getCurrentLocale()==="zh-CN",a=e?["/research","/scout","/plan","/work","/review","/brainstorm"]:["/research","/scout","/plan","/work","/review","/brainstorm"],i=e?["web-fetch","ast-grep","ace-tool","codemap","send-request","tmux"]:["web-fetch","ast-grep","ace-tool","codemap","send-request","tmux"],s=e?["Telegram","Discord","WebChat","API","Cron","Webhook"]:["Telegram","Discord","WebChat","API","Cron","Webhook"],r=e?["git-commit","notify","continue","handoff","hash-trigger","pi-messenger"]:["git-commit","notify","continue","handoff","hash-trigger","pi-messenger"];return d`
      <section class="section" id="extensions">
        <div class="bg-grid"></div>
        <div class="bg-glow"></div>

        <div class="inner">
          <div class="header">
            <span class="label">${t("extensions.label")}</span>
            <h2 class="title">${e?"无限扩展生态":"Infinite Extensibility"}</h2>
            <p class="subtitle">${e?"从 CLI 命令到 TUI 组件，从网关插件到定时任务。每个人都是扩展作者。":"From CLI commands to TUI components, from gateway plugins to cron jobs. Everyone is an extension author."}</p>
          </div>

          <!-- Stats Bar -->
          <div class="stats-bar">
            <div class="stat">
              <span class="stat-value">26+</span>
              <span class="stat-label">${e?"内置扩展":"Built-in"}</span>
            </div>
            <div class="stat">
              <span class="stat-value">42</span>
              <span class="stat-label">${e?"技能":"Skills"}</span>
            </div>
            <div class="stat">
              <span class="stat-value">16</span>
              <span class="stat-label">${e?"网关钩子":"Hooks"}</span>
            </div>
            <div class="stat">
              <span class="stat-value">0</span>
              <span class="stat-label">${e?"配置复杂度":"Config Complexity"}</span>
            </div>
          </div>

          <!-- Extension Categories -->
          <div class="categories">
            <!-- Commands -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">/</div>
                <span class="category-title">${e?"斜杠命令":"Slash Commands"}</span>
                <span class="category-count">15</span>
              </div>
              <p class="category-desc">${e?"交互式命令系统。支持参数补全、历史记录、上下文感知。":"Interactive command system. Supports arg completion, history, context awareness."}</p>
              <div class="ext-list">
                ${a.map(o=>d`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${o}</span>
                  </div>
                `)}
              </div>
            </div>

            <!-- Tools -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">T</div>
                <span class="category-title">${e?"工具技能":"Tool Skills"}</span>
                <span class="category-count">42</span>
              </div>
              <p class="category-desc">${e?"可复用的能力单元。每个技能都是独立的 npm 包，按需加载。":"Reusable capability units. Each skill is an independent npm package, loaded on demand."}</p>
              <div class="ext-list">
                ${i.map(o=>d`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${o}</span>
                  </div>
                `)}
              </div>
            </div>

            <!-- Gateway -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">G</div>
                <span class="category-title">${e?"网关插件":"Gateway Plugins"}</span>
                <span class="category-count">8</span>
              </div>
              <p class="category-desc">${e?"多通道接入。16 个生命周期钩子，消息管道可编程。":"Multi-channel access. 16 lifecycle hooks, programmable message pipeline."}</p>
              <div class="ext-list">
                ${s.map(o=>d`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${o}</span>
                  </div>
                `)}
              </div>
            </div>
          </div>

          <!-- Code Demo -->
          <div class="code-section">
            <div class="code-panel">
              <div class="code-header">
                <span class="code-dot red"></span>
                <span class="code-dot yellow"></span>
                <span class="code-dot green"></span>
                <span class="code-title">extension.ts</span>
              </div>
              <div class="code-body">
                <div><span class="code-keyword">export default</span> <span class="code-keyword">function</span> <span class="code-func">myExtension</span>(pi) {</div>
                <div>&nbsp;&nbsp;<span class="code-comment">// Register a slash command</span></div>
                <div>&nbsp;&nbsp;pi.<span class="code-func">registerCommand</span>({</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;name: <span class="code-string">'/hello'</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-keyword">async</span> <span class="code-func">handler</span>(args) {</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-keyword">return</span> <span class="code-string">'Hello from my extension!'</span>;</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;}</div>
                <div>&nbsp;&nbsp;});</div>
                <div>&nbsp;&nbsp;<span class="code-comment">// Register a tool</span></div>
                <div>&nbsp;&nbsp;pi.<span class="code-func">registerTool</span>({</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;name: <span class="code-string">'my_tool'</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;description: <span class="code-string">'Does something cool'</span></div>
                <div>&nbsp;&nbsp;});</div>
                <div>}</div>
              </div>
            </div>

            <div class="code-panel">
              <div class="code-header">
                <span class="code-dot red"></span>
                <span class="code-dot yellow"></span>
                <span class="code-dot green"></span>
                <span class="code-title">skill.json</span>
              </div>
              <div class="code-body">
                <div>{</div>
                <div>&nbsp;&nbsp;<span class="code-string">"name"</span>: <span class="code-string">"my-skill"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"version"</span>: <span class="code-string">"1.0.0"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"description"</span>: <span class="code-string">"A reusable skill"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"entry"</span>: <span class="code-string">"./index.ts"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"permissions"</span>: [<span class="code-string">"fs:read"</span>],</div>
                <div>&nbsp;&nbsp;<span class="code-string">"hooks"</span>: {</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-string">"onInit"</span>: <span class="code-string">"init"</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-string">"onMessage"</span>: <span class="code-string">"handleMessage"</span></div>
                <div>&nbsp;&nbsp;}</div>
                <div>}</div>
              </div>
            </div>
          </div>

          <!-- Extension Gallery -->
          <div class="gallery">
            ${r.map(o=>d`
              <div class="gallery-item">
                <div class="gallery-icon">${o.charAt(0).toUpperCase()}</div>
                <span class="gallery-name">${o}</span>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}};B.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 1; }

    .header {
      margin-bottom: 4rem;
      max-width: 600px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #f59e0b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #f59e0b;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Stats Bar */
    .stats-bar {
      display: flex;
      gap: 3rem;
      padding: 1.5rem 2rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      margin-bottom: 3rem;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Extension Categories Grid */
    .categories {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .category {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
    }

    .category::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .category:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
    }

    .category:hover::before {
      opacity: 1;
    }

    .category:nth-child(1) { --accent: #10b981; }
    .category:nth-child(2) { --accent: #3b82f6; }
    .category:nth-child(3) { --accent: #f59e0b; }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      margin-bottom: 1.25rem;
    }

    .category-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
      font-size: 1.125rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.05);
      color: var(--accent);
    }

    .category-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
    }

    .category-count {
      margin-left: auto;
      padding: 0.25rem 0.625rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .category-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }

    /* Extension List */
    .ext-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ext-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.875rem;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      color: #a1a1aa;
      transition: all 0.2s;
      cursor: pointer;
    }

    .ext-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fafafa;
    }

    .ext-status {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse-dot 2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { opacity: 0.8; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
    }

    /* Code Demo Section */
    .code-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .code-panel {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      overflow: hidden;
    }

    .code-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      background: #27272a;
      border-bottom: 1px solid #3f3f46;
    }

    .code-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .code-dot.red { background: #ef4444; }
    .code-dot.yellow { background: #eab308; }
    .code-dot.green { background: #22c55e; }

    .code-title {
      margin-left: 0.5rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .code-body {
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      line-height: 1.8;
      color: #a1a1aa;
      overflow-x: auto;
    }

    .code-keyword { color: #c084fc; }
    .code-string { color: #4ade80; }
    .code-func { color: #60a5fa; }
    .code-comment { color: #52525b; }
    .code-plain { color: #a1a1aa; }

    /* Extension Gallery */
    .gallery {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
    }

    .gallery-item {
      aspect-ratio: 1;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    }

    .gallery-item:hover {
      transform: translateY(-4px) scale(1.02);
      border-color: #f59e0b;
      background: #1c1c1f;
    }

    .gallery-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.75rem;
      background: rgba(245, 158, 11, 0.1);
      display: grid;
      place-items: center;
      font-size: 1rem;
      font-weight: 700;
      color: #f59e0b;
    }

    .gallery-name {
      font-size: 0.75rem;
      color: #a1a1aa;
      font-weight: 500;
    }

    /* Background Decoration */
    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(245, 158, 11, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(245, 158, 11, 0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
    }

    .bg-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      height: 800px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 70%);
      pointer-events: none;
    }

    @media (max-width: 1024px) {
      .categories { grid-template-columns: 1fr; }
      .code-section { grid-template-columns: 1fr; }
      .gallery { grid-template-columns: repeat(4, 1fr); }
      .stats-bar { flex-wrap: wrap; gap: 1.5rem; }
    }

    @media (max-width: 640px) {
      .gallery { grid-template-columns: repeat(3, 1fr); }
    }
  `;ue([u()],B.prototype,"locale",2);ue([u()],B.prototype,"activeTab",2);B=ue([v("extensions-section")],B);var zt=Object.defineProperty,Lt=Object.getOwnPropertyDescriptor,Ge=(t,e,a,i)=>{for(var s=i>1?void 0:i?Lt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&zt(e,a,s),s};let q=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=[0,1,2,3,4];return d`
      <section class="section" id="comparison">
        <div class="inner">
          <div class="header">
            <span class="label">${t("comparison.label")}</span>
            <h2 class="title">${t("comparison.title")}</h2>
            <p class="subtitle">${t("comparison.subtitle")}</p>
          </div>

          <div class="table">
            <div class="row header">
              <div class="cell feature">${t("comparison.headers.feature")}</div>
              <div class="cell pi">${t("comparison.headers.pi")}</div>
              <div class="cell others">${t("comparison.headers.others")}</div>
            </div>
            ${e.map(a=>d`
              <div class="row">
                <div class="cell feature">${t(`comparison.rows.${a}.feature`)}</div>
                <div class="cell pi">${t(`comparison.rows.${a}.pi`)}</div>
                <div class="cell others">${t(`comparison.rows.${a}.others`)}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}};q.styles=b`
    :host {
      display: block;
      width: 100%;
    }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
    }

    .inner {
      max-width: 900px;
      margin: 0 auto;
    }

    .header {
      margin-bottom: 4rem;
      max-width: 480px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #10b981;
    }

    .title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Comparison Table */
    .table {
      border: 1px solid #27272a;
      border-radius: 1rem;
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: 2fr 1.25fr 1.25fr;
      border-bottom: 1px solid #27272a;
      align-items: center;
      min-height: 56px;
    }

    .row:last-child {
      border-bottom: none;
    }

    .row.header {
      background: #18181b;
    }

    .cell {
      padding: 1rem 1.5rem;
      font-size: 0.9375rem;
      display: flex;
      align-items: center;
      min-height: 56px;
    }

    .cell.feature {
      color: #a1a1aa;
    }

    .cell.pi {
      color: #10b981;
      font-weight: 500;
    }

    .cell.others {
      color: #52525b;
    }

    .row.header .cell {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #71717a;
      min-height: 48px;
    }

    @media (max-width: 640px) {
      .row {
        min-height: auto;
      }
      .cell {
        padding: 0.875rem 1rem;
        font-size: 0.8125rem;
        min-height: auto;
      }
    }
  `;Ge([u()],q.prototype,"locale",2);q=Ge([v("comparison-section")],q);var Nt=Object.defineProperty,Et=Object.getOwnPropertyDescriptor,Ue=(t,e,a,i)=>{for(var s=i>1?void 0:i?Et(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&Nt(e,a,s),s};let Z=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}render(){const t=n.getCurrentLocale()==="zh-CN";return d`
      <section class="section" id="memory">
        <div class="data-flow">
          <div class="flow-line"></div>
          <div class="flow-line"></div>
          <div class="flow-line"></div>
        </div>

        <div class="inner">
          <div class="header">
            <div class="header-left">
              <span class="label">${t?"记忆架构":"Memory System"}</span>
              <h2 class="title">${t?"三层记忆栈":"3-Layer Memory Stack"}</h2>
              <p class="subtitle">${t?"L3 运行时向量检索 + L2 结构化合并 + L1 原始日志。记忆塑造智能。":"L3 runtime vector search + L2 structured consolidation + L1 raw logs. Memory shapes intelligence."}</p>
            </div>
          </div>

          <div class="memory-stack">
            <!-- L3: Runtime -->
            <div class="memory-layer">
              <span class="layer-badge">L3</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
              <h3 class="layer-title">${t?"运行时记忆":"Runtime Memory"}</h3>
              <p class="layer-desc">${t?"实时向量检索、标签索引、每日日志。毫秒级语义搜索。":"Real-time vector retrieval, tag indexing, daily logs. Millisecond semantic search."}</p>
              <div class="layer-tech">
                <span class="tech-tag">LanceDB</span>
                <span class="tech-tag">768-dim</span>
                <span class="tech-tag">BM25</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">> query: "auth patterns"</div>
                <div class="vector-result">
                  <span>auth.ts</span>
                  <div class="similarity-bar"><div class="similarity-fill" style="width: 94%"></div></div>
                  <span>0.94</span>
                </div>
                <div class="vector-result">
                  <span>middleware.ts</span>
                  <div class="similarity-bar"><div class="similarity-fill" style="width: 87%"></div></div>
                  <span>0.87</span>
                </div>
              </div>
            </div>

            <!-- L2: Consolidated -->
            <div class="memory-layer">
              <span class="layer-badge">L2</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
              <h3 class="layer-title">${t?"结构化记忆":"Consolidated Memory"}</h3>
              <p class="layer-desc">${t?"自动提取关键经验，去重降噪，合并为持久知识。跨会话可用。":"Auto-extract key learnings, dedupe noise, merge into persistent knowledge. Cross-session durable."}</p>
              <div class="layer-tech">
                <span class="tech-tag">Markdown</span>
                <span class="tech-tag">LLM Extraction</span>
                <span class="tech-tag">7-day Cycle</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query"># Learnings (High Priority)</div>
                <div class="vector-result" style="color: #52525b;">- [3x] Retrieve before modify</div>
                <div class="vector-result" style="color: #52525b;">- [3x] Unified Diff protocol</div>
              </div>
            </div>

            <!-- L1: Daily -->
            <div class="memory-layer">
              <span class="layer-badge">L1</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              <h3 class="layer-title">${t?"原始日志":"Raw Logs"}</h3>
              <p class="layer-desc">${t?"每日完整会话记录，原始思考链，失败经验。回溯的根基。":"Daily complete session transcripts, raw thought chains, failures. Foundation for recall."}</p>
              <div class="layer-tech">
                <span class="tech-tag">Daily.md</span>
                <span class="tech-tag">JSONL</span>
                <span class="tech-tag">Immutable</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">2026-02-24.md</div>
                <div class="vector-result" style="color: #52525b;">- [14:32] Context retrieval</div>
                <div class="vector-result" style="color: #52525b;">- [15:45] Subagent dispatch</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}};Z.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 1; }

    .header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      margin-bottom: 5rem;
      align-items: end;
    }

    .header-left { max-width: 480px; }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #a855f7;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #a855f7;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1.25rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Memory Stack Visualization */
    .memory-stack {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      position: relative;
    }

    .memory-layer {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      position: relative;
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .memory-layer:hover {
      transform: translateY(-8px);
      border-color: #a855f7;
      box-shadow: 0 20px 60px -20px rgba(168, 85, 247, 0.2);
    }

    .layer-badge {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.25rem 0.625rem;
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.2);
      border-radius: 0.375rem;
      font-size: 0.6875rem;
      font-weight: 600;
      color: #a855f7;
      font-family: 'JetBrains Mono', monospace;
    }

    .layer-icon {
      width: 3rem;
      height: 3rem;
      border-radius: 0.875rem;
      background: rgba(168, 85, 247, 0.1);
      display: grid;
      place-items: center;
      font-size: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .layer-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .layer-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }

    .layer-tech {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .tech-tag {
      padding: 0.25rem 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      color: #a1a1aa;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Animated Data Flow */
    .data-flow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .flow-line {
      position: absolute;
      height: 1px;
      background: linear-gradient(90deg, transparent, #a855f7, transparent);
      opacity: 0.3;
      animation: flow 3s linear infinite;
    }

    .flow-line:nth-child(1) { top: 30%; left: 0; width: 100%; animation-delay: 0s; }
    .flow-line:nth-child(2) { top: 50%; left: 0; width: 100%; animation-delay: 1s; }
    .flow-line:nth-child(3) { top: 70%; left: 0; width: 100%; animation-delay: 2s; }

    @keyframes flow {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* Memory Particles */
    .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #a855f7;
      border-radius: 50%;
      opacity: 0.4;
      animation: float-particle 8s ease-in-out infinite;
    }

    @keyframes float-particle {
      0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
      50% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
    }

    /* Vector Search Demo */
    .vector-demo {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #0c0c0e;
      border-radius: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }

    .vector-query {
      color: #a855f7;
      margin-bottom: 0.5rem;
    }

    .vector-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.375rem 0;
      color: #a1a1aa;
    }

    .similarity-bar {
      width: 60px;
      height: 3px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
    }

    .similarity-fill {
      height: 100%;
      background: linear-gradient(90deg, #a855f7, #c084fc);
      border-radius: 2px;
      animation: fill-bar 2s ease-out forwards;
    }

    @keyframes fill-bar {
      from { width: 0; }
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .header { grid-template-columns: 1fr; gap: 2rem; }
      .memory-stack { grid-template-columns: 1fr; }
    }
  `;Ue([u()],Z.prototype,"locale",2);Z=Ue([v("memory-section")],Z);var Ot=Object.defineProperty,It=Object.getOwnPropertyDescriptor,ee=(t,e,a,i)=>{for(var s=i>1?void 0:i?It(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&Ot(e,a,s),s};let L=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.activeNode=null,this.packetCount=0}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._counterInterval=window.setInterval(()=>{this.packetCount+=Math.floor(Math.random()*5)+1},1e3)}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),this._counterInterval&&clearInterval(this._counterInterval)}_handleNodeHover(t){this.activeNode=t}_handleNodeLeave(){this.activeNode=null}_getNodeInfo(t,e){const i={core:{zh:"Pi Core",en:"Pi Core",descZh:"核心编排引擎，管理扩展生命周期",descEn:"Core orchestration engine managing extension lifecycle"},extensions:{zh:"扩展系统",en:"Extensions",descZh:"插件化架构，支持命令、工具、钩子",descEn:"Plugin architecture supporting commands, tools, hooks"},skills:{zh:"技能系统",en:"Skills",descZh:"42+ 可复用技能单元",descEn:"42+ reusable capability units"},subagents:{zh:"子代理网格",en:"Subagents",descZh:"25+ 专用代理通过 Crew 协议协调",descEn:"25+ specialized agents coordinated via Crew protocol"},gateway:{zh:"网关",en:"Gateway",descZh:"多通道接入，16 个生命周期钩子",descEn:"Multi-channel access with 16 lifecycle hooks"},rpc:{zh:"RPC 池",en:"RPC Pool",descZh:"进程池管理，会话路由",descEn:"Process pool management, session routing"},channels:{zh:"通道",en:"Channels",descZh:"Telegram / Discord / WebChat / API",descEn:"Telegram / Discord / WebChat / API"},memory:{zh:"记忆系统",en:"Memory",descZh:"三层记忆栈：L3 运行时 + L2 合并 + L1 日志",descEn:"3-layer memory: L3 runtime + L2 consolidated + L1 logs"}}[t];return{title:e?i.zh:i.en,desc:e?i.descZh:i.descEn}}render(){const t=n.getCurrentLocale()==="zh-CN",e=this.activeNode?this._getNodeInfo(this.activeNode,t):null;return d`
      <section class="section" id="specs">
        <div class="inner">
          <div class="header">
            <span class="label">${t?"技术规格":"Technical Specifications"}</span>
            <h2 class="title">${t?"系统架构":"System Architecture"}</h2>
          </div>

          <div class="specs-grid">
            <!-- Runtime -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon runtime"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
                <span class="spec-title">${t?"运行时":"Runtime"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${t?"语言":"Language"}</span><span class="spec-value">TypeScript 5.3</span></div>
                <div class="spec-item"><span class="spec-label">${t?"引擎":"Engine"}</span><span class="spec-value">Node.js 20+</span></div>
                <div class="spec-item"><span class="spec-label">${t?"打包":"Bundler"}</span><span class="spec-value">Vite 5</span></div>
                <div class="spec-item"><span class="spec-label">TUI</span><span class="spec-value highlight">React + Ink</span></div>
              </div>
            </div>

            <!-- Gateway -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon gateway"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
                <span class="spec-title">${t?"网关":"Gateway"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${t?"协议":"Protocol"}</span><span class="spec-value">WebSocket + HTTP/2</span></div>
                <div class="spec-item"><span class="spec-label">${t?"并发":"Concurrency"}</span><span class="spec-value highlight">1000+ sessions</span></div>
                <div class="spec-item"><span class="spec-label">${t?"延迟":"Latency"}</span><span class="spec-value">&lt; 10ms p99</span></div>
                <div class="spec-item"><span class="spec-label">RPC</span><span class="spec-value">JSON-RPC 2.0</span></div>
              </div>
            </div>

            <!-- Memory -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon memory"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z"/><circle cx="12" cy="13" r="2"/></svg></div>
                <span class="spec-title">${t?"记忆":"Memory"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${t?"向量维度":"Vector Dim"}</span><span class="spec-value">768 (Gemma)</span></div>
                <div class="spec-item"><span class="spec-label">${t?"检索":"Retrieval"}</span><span class="spec-value highlight">Vector + BM25</span></div>
                <div class="spec-item"><span class="spec-label">${t?"数据库":"Database"}</span><span class="spec-value">LanceDB</span></div>
                <div class="spec-item"><span class="spec-label">${t?"存储":"Storage"}</span><span class="spec-value">Markdown + SQLite</span></div>
              </div>
            </div>

            <!-- Security -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon security"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <span class="spec-title">${t?"安全":"Security"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${t?"认证":"Auth"}</span><span class="spec-value highlight">HMAC-SHA256</span></div>
                <div class="spec-item"><span class="spec-label">${t?"沙箱":"Sandbox"}</span><span class="spec-value">Unified Diff</span></div>
                <div class="spec-item"><span class="spec-label">${t?"网络":"Network"}</span><span class="spec-value">SSRF Guard</span></div>
                <div class="spec-item"><span class="spec-label">${t?"执行":"Execution"}</span><span class="spec-value">Allowlist</span></div>
              </div>
            </div>
          </div>

          <!-- Interactive Architecture Diagram -->
          <div class="arch-diagram">
            <h3 class="arch-title">${t?"数据流架构 (悬停查看详情)":"Data Flow Architecture (hover for details)"}</h3>
            
            <div class="traffic-counter">
              ${t?"数据包":"Packets"}: <span>${this.packetCount.toLocaleString()}</span>
            </div>

            <svg class="arch-svg" viewBox="0 0 900 380">
              <defs>
                <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#3f3f46;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#10b981;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#3f3f46;stop-opacity:1" />
                </linearGradient>
                <filter id="node-glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <!-- Connection Lines - Extensions to Core -->
              <path class="arch-connector ${this.activeNode==="extensions"||this.activeNode==="core"?"active":""}" d="M 230 70 L 350 190" />
              <path class="arch-connector ${this.activeNode==="skills"||this.activeNode==="core"?"active":""}" d="M 230 160 L 350 190" />
              <path class="arch-connector ${this.activeNode==="subagents"||this.activeNode==="core"?"active":""}" d="M 230 250 L 350 190" />
              
              <!-- Connection Lines - Core to Gateway -->
              <path class="arch-connector ${this.activeNode==="core"||this.activeNode==="gateway"?"active":""}" d="M 450 190 L 570 70" />
              <path class="arch-connector ${this.activeNode==="core"||this.activeNode==="rpc"?"active":""}" d="M 450 190 L 570 160" />
              <path class="arch-connector ${this.activeNode==="core"||this.activeNode==="channels"?"active":""}" d="M 450 190 L 570 250" />
              
              <!-- Connection Line - Core to Memory -->
              <path class="arch-connector ${this.activeNode==="core"||this.activeNode==="memory"?"active":""}" d="M 400 230 L 400 290" />

              <!-- Pulse Rings -->
              <circle class="pulse-ring ${this.activeNode==="core"?"animating":""}" cx="400" cy="190" />

              <!-- Extension Nodes -->
              <rect class="arch-node ${this.activeNode==="extensions"?"active":""}" 
                x="150" y="50" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("extensions")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="75">Extensions</text>

              <rect class="arch-node ${this.activeNode==="skills"?"active":""}" 
                x="150" y="140" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("skills")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="165">Skills</text>

              <rect class="arch-node ${this.activeNode==="subagents"?"active":""}" 
                x="150" y="230" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("subagents")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="255">Subagents</text>

              <!-- Core Node -->
              <rect class="arch-node ${this.activeNode==="core"?"active":""}" 
                x="350" y="160" width="100" height="70" rx="8" 
                @mouseenter="${()=>this._handleNodeHover("core")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="400" y="200" style="font-size: 14px; font-weight: 600;">Pi Core</text>

              <!-- Gateway Nodes -->
              <rect class="arch-node ${this.activeNode==="gateway"?"active":""}" 
                x="570" y="50" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("gateway")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="75">Gateway</text>

              <rect class="arch-node ${this.activeNode==="rpc"?"active":""}" 
                x="570" y="140" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("rpc")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="165">RPC Pool</text>

              <rect class="arch-node ${this.activeNode==="channels"?"active":""}" 
                x="570" y="230" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("channels")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="255">Channels</text>

              <!-- Memory Node -->
              <rect class="arch-node ${this.activeNode==="memory"?"active":""}" 
                x="360" y="290" width="80" height="40" rx="6" 
                @mouseenter="${()=>this._handleNodeHover("memory")}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="400" y="315">Memory</text>

              <!-- Data Packets -->
              <circle class="data-packet" cx="290" cy="130" r="4">
                <animate attributeName="cx" values="230;350" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="cy" values="70;190" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <circle class="data-packet" cx="290" cy="175" r="4">
                <animate attributeName="cx" values="350;570" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="cy" values="190;70" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <circle class="data-packet" cx="400" cy="260" r="4">
                <animate attributeName="cy" values="190;290" dur="2s" repeatCount="indefinite" />
              </circle>
            </svg>

            <div class="node-info ${this.activeNode?"visible":""}">
              ${e?d`
                <div class="node-info-title">${e.title}</div>
                <div class="node-info-desc">${e.desc}</div>
              `:d`
                <div class="node-info-title">${t?"悬停节点查看详情":"Hover nodes for details"}</div>
                <div class="node-info-desc">${t?"数据包在节点间实时流动":"Data packets flow between nodes in real-time"}</div>
              `}
            </div>
          </div>
        </div>
      </section>
    `}};L.styles=b`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #ec4899;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
    }

    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-bottom: 4rem;
    }

    .spec-category {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      transition: all 0.3s ease;
    }

    .spec-category:hover {
      border-color: #3f3f46;
      transform: translateY(-2px);
    }

    .spec-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #27272a;
    }

    .spec-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
    }

    .spec-icon svg {
      width: 20px;
      height: 20px;
    }

    .spec-icon.runtime { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .spec-icon.gateway { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    .spec-icon.memory { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
    .spec-icon.security { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

    .spec-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
    }

    .spec-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .spec-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .spec-label {
      color: #71717a;
    }

    .spec-value {
      color: #a1a1aa;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    .spec-value.highlight {
      color: #10b981;
    }

    /* Architecture Diagram - Interactive */
    .arch-diagram {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 2rem;
      overflow-x: auto;
      position: relative;
    }

    .arch-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .arch-svg {
      width: 100%;
      min-width: 800px;
      height: 350px;
    }

    /* Nodes */
    .arch-node {
      fill: #27272a;
      stroke: #3f3f46;
      stroke-width: 1.5;
      transition: all 0.3s ease;
      cursor: pointer;
    }

    .arch-node:hover {
      fill: #3f3f46;
      stroke: #10b981;
      filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.3));
    }

    .arch-node.active {
      fill: #1e293b;
      stroke: #10b981;
      filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.4));
    }

    /* Node Labels */
    .arch-label {
      fill: #a1a1aa;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
      pointer-events: none;
      transition: all 0.3s ease;
    }

    .arch-node:hover + .arch-label,
    .arch-node.active + .arch-label {
      fill: #fafafa;
      font-weight: 600;
    }

    /* Connection Lines */
    .arch-connector {
      stroke: #3f3f46;
      stroke-width: 1.5;
      fill: none;
      stroke-dasharray: 4 4;
      transition: all 0.3s ease;
    }

    .arch-connector.active {
      stroke: #10b981;
      stroke-width: 2;
      animation: flow 1s linear infinite;
    }

    @keyframes flow {
      to { stroke-dashoffset: -8; }
    }

    /* Data Flow Animation */
    .data-packet {
      fill: #10b981;
      filter: drop-shadow(0 0 4px #10b981);
    }

    /* Pulse Effect */
    .pulse-ring {
      fill: none;
      stroke: #10b981;
      stroke-width: 2;
      opacity: 0;
    }

    .pulse-ring.animating {
      animation: pulse-ring 2s ease-out infinite;
    }

    @keyframes pulse-ring {
      0% { r: 30; opacity: 0.6; stroke-width: 2; }
      100% { r: 50; opacity: 0; stroke-width: 0; }
    }

    /* Node Info Panel */
    .node-info {
      position: absolute;
      bottom: 1.5rem;
      left: 1.5rem;
      right: 1.5rem;
      padding: 1rem 1.25rem;
      background: rgba(24, 24, 27, 0.95);
      border: 1px solid #27272a;
      border-radius: 0.75rem;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
      pointer-events: none;
    }

    .node-info.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .node-info-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #10b981;
      margin-bottom: 0.375rem;
    }

    .node-info-desc {
      font-size: 0.8125rem;
      color: #71717a;
    }

    /* Traffic Counter */
    .traffic-counter {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      padding: 0.5rem 0.875rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #10b981;
    }

    .traffic-counter span {
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .specs-grid { grid-template-columns: 1fr; }
      .arch-svg { min-width: 600px; height: 280px; }
    }
  `;ee([u()],L.prototype,"locale",2);ee([u()],L.prototype,"activeNode",2);ee([u()],L.prototype,"packetCount",2);L=ee([v("tech-specs")],L);var Dt=Object.defineProperty,Tt=Object.getOwnPropertyDescriptor,je=(t,e,a,i)=>{for(var s=i>1?void 0:i?Tt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=(i?o(e,a,s):o(s))||s);return i&&s&&Dt(e,a,s),s};let X=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n);return d`
      <section class="section">
        <div class="inner">
          <h2 class="title">${t("cta.title")}</h2>
          <p class="subtitle">${t("cta.subtitle")}</p>
          <a href="https://github.com/Dwsy/agent" class="cta" target="_blank" rel="noopener">
            ${t("cta.button")}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </section>
    `}};X.styles=b`
    :host {
      display: block;
      width: 100%;
    }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
    }

    .inner {
      max-width: 720px;
      margin: 0 auto;
      text-align: center;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.125rem;
      color: #71717a;
      line-height: 1.7;
      margin-bottom: 2.5rem;
    }

    .cta {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 2rem;
      background: #10b981;
      color: #09090b;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 0.75rem;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
    }

    .cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
    }

    .cta:active {
      transform: translateY(0) scale(0.98);
    }

    /* Decorative gradient orb */
    .section::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%);
      pointer-events: none;
    }
  `;je([u()],X.prototype,"locale",2);X=je([v("cta-section")],X);var Rt=Object.getOwnPropertyDescriptor,Bt=(t,e,a,i)=>{for(var s=i>1?void 0:i?Rt(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=o(s)||s);return s};let le=class extends m{render(){return d`
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
    `}};le.styles=b`
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
  `;le=Bt([v("pi-footer")],le);var Ht=Object.getOwnPropertyDescriptor,Gt=(t,e,a,i)=>{for(var s=i>1?void 0:i?Ht(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=o(s)||s);return s};let ce=class extends m{constructor(){super(...arguments),this.particles=[],this.PARTICLE_COUNT=30,this.CONNECTION_DISTANCE=150,this.MAX_CONNECTIONS=3,this.animate=()=>{!this.ctx||!this.canvas||(this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.particles.forEach((t,e)=>{t.x+=t.vx,t.y+=t.vy,(t.x<0||t.x>this.canvas.width)&&(t.vx*=-1),(t.y<0||t.y>this.canvas.height)&&(t.vy*=-1),this.ctx.beginPath(),this.ctx.arc(t.x,t.y,t.radius,0,Math.PI*2),this.ctx.fillStyle=`rgba(16, 185, 129, ${t.opacity})`,this.ctx.fill();let a=0;for(let i=e+1;i<this.particles.length&&!(a>=this.MAX_CONNECTIONS);i++){const s=this.particles[i],r=t.x-s.x,o=t.y-s.y,c=Math.sqrt(r*r+o*o);if(c<this.CONNECTION_DISTANCE){const l=(1-c/this.CONNECTION_DISTANCE)*.15;this.ctx.beginPath(),this.ctx.moveTo(t.x,t.y),this.ctx.lineTo(s.x,s.y),this.ctx.strokeStyle=`rgba(16, 185, 129, ${l})`,this.ctx.lineWidth=.5,this.ctx.stroke(),a++}}}),this.animationId=requestAnimationFrame(this.animate))}}firstUpdated(){this.canvas=this.renderRoot.querySelector("canvas"),this.canvas&&(this.ctx=this.canvas.getContext("2d")||void 0,this.ctx&&(this.setupCanvas(),this.initParticles(),this.animate(),this.resizeObserver=new ResizeObserver(()=>{this.setupCanvas()}),this.resizeObserver.observe(this.canvas)))}setupCanvas(){var e;if(!this.canvas)return;const t=(e=this.canvas.parentElement)==null?void 0:e.getBoundingClientRect();t&&(this.canvas.width=t.width,this.canvas.height=t.height)}initParticles(){if(this.canvas){this.particles=[];for(let t=0;t<this.PARTICLE_COUNT;t++)this.particles.push({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,radius:Math.random()*1.5+.5,opacity:Math.random()*.3+.1})}}disconnectedCallback(){var t;super.disconnectedCallback(),this.animationId&&cancelAnimationFrame(this.animationId),(t=this.resizeObserver)==null||t.disconnect()}render(){return d`<canvas></canvas>`}};ce.styles=b`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    canvas {
      width: 100%;
      height: 100%;
      opacity: 0.4;
    }
  `;ce=Gt([v("canvas-background")],ce);var Ut=Object.getOwnPropertyDescriptor,jt=(t,e,a,i)=>{for(var s=i>1?void 0:i?Ut(e,a):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(s=o(s)||s);return s};let Me=class extends m{createRenderRoot(){return this}render(){return d`
      <canvas-background></canvas-background>
      <pi-navbar></pi-navbar>
      <main id="main-content" style="position: relative; z-index: 1; padding-top: 5rem;">
        <hero-section></hero-section>
        <bento-grid></bento-grid>
        <memory-section></memory-section>
        <gateway-section></gateway-section>
        <workflow-section></workflow-section>
        <extensions-section></extensions-section>
        <comparison-section></comparison-section>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `}};Me=jt([v("pi-app")],Me);De(d`<pi-app></pi-app>`,document.getElementById("app"));
