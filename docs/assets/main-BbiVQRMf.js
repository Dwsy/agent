(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))a(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&a(o)}).observe(document,{childList:!0,subtree:!0});function s(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(r){if(r.ep)return;r.ep=!0;const i=s(r);fetch(r.href,i)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const U=globalThis,ae=U.ShadowRoot&&(U.ShadyCSS===void 0||U.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ie=Symbol(),le=new WeakMap;let ke=class{constructor(e,s,a){if(this._$cssResult$=!0,a!==ie)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=s}get styleSheet(){let e=this.o;const s=this.t;if(ae&&e===void 0){const a=s!==void 0&&s.length===1;a&&(e=le.get(s)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),a&&le.set(s,e))}return e}toString(){return this.cssText}};const Ne=t=>new ke(typeof t=="string"?t:t+"",void 0,ie),v=(t,...e)=>{const s=t.length===1?t[0]:e.reduce((a,r,i)=>a+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+t[i+1],t[0]);return new ke(s,t,ie)},Re=(t,e)=>{if(ae)t.adoptedStyleSheets=e.map(s=>s instanceof CSSStyleSheet?s:s.styleSheet);else for(const s of e){const a=document.createElement("style"),r=U.litNonce;r!==void 0&&a.setAttribute("nonce",r),a.textContent=s.cssText,t.appendChild(a)}},ce=ae?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let s="";for(const a of e.cssRules)s+=a.cssText;return Ne(s)})(t):t;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Le,defineProperty:Ge,getOwnPropertyDescriptor:Ue,getOwnPropertyNames:De,getOwnPropertySymbols:He,getPrototypeOf:je}=Object,$=globalThis,de=$.trustedTypes,Be=de?de.emptyScript:"",K=$.reactiveElementPolyfillSupport,z=(t,e)=>t,D={toAttribute(t,e){switch(e){case Boolean:t=t?Be:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let s=t;switch(e){case Boolean:s=t!==null;break;case Number:s=t===null?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t)}catch{s=null}}return s}},oe=(t,e)=>!Le(t,e),pe={attribute:!0,type:String,converter:D,reflect:!1,useDefault:!1,hasChanged:oe};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),$.litPropertyMetadata??($.litPropertyMetadata=new WeakMap);let C=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,s=pe){if(s.state&&(s.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((s=Object.create(s)).wrapped=!0),this.elementProperties.set(e,s),!s.noAccessor){const a=Symbol(),r=this.getPropertyDescriptor(e,a,s);r!==void 0&&Ge(this.prototype,e,r)}}static getPropertyDescriptor(e,s,a){const{get:r,set:i}=Ue(this.prototype,e)??{get(){return this[s]},set(o){this[s]=o}};return{get:r,set(o){const l=r==null?void 0:r.call(this);i==null||i.call(this,o),this.requestUpdate(e,l,a)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??pe}static _$Ei(){if(this.hasOwnProperty(z("elementProperties")))return;const e=je(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(z("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(z("properties"))){const s=this.properties,a=[...De(s),...He(s)];for(const r of a)this.createProperty(r,s[r])}const e=this[Symbol.metadata];if(e!==null){const s=litPropertyMetadata.get(e);if(s!==void 0)for(const[a,r]of s)this.elementProperties.set(a,r)}this._$Eh=new Map;for(const[s,a]of this.elementProperties){const r=this._$Eu(s,a);r!==void 0&&this._$Eh.set(r,s)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const s=[];if(Array.isArray(e)){const a=new Set(e.flat(1/0).reverse());for(const r of a)s.unshift(ce(r))}else e!==void 0&&s.push(ce(e));return s}static _$Eu(e,s){const a=s.attribute;return a===!1?void 0:typeof a=="string"?a:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(s=>this.enableUpdating=s),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(s=>s(this))}addController(e){var s;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((s=e.hostConnected)==null||s.call(e))}removeController(e){var s;(s=this._$EO)==null||s.delete(e)}_$E_(){const e=new Map,s=this.constructor.elementProperties;for(const a of s.keys())this.hasOwnProperty(a)&&(e.set(a,this[a]),delete this[a]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Re(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(s=>{var a;return(a=s.hostConnected)==null?void 0:a.call(s)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(s=>{var a;return(a=s.hostDisconnected)==null?void 0:a.call(s)})}attributeChangedCallback(e,s,a){this._$AK(e,a)}_$ET(e,s){var i;const a=this.constructor.elementProperties.get(e),r=this.constructor._$Eu(e,a);if(r!==void 0&&a.reflect===!0){const o=(((i=a.converter)==null?void 0:i.toAttribute)!==void 0?a.converter:D).toAttribute(s,a.type);this._$Em=e,o==null?this.removeAttribute(r):this.setAttribute(r,o),this._$Em=null}}_$AK(e,s){var i,o;const a=this.constructor,r=a._$Eh.get(e);if(r!==void 0&&this._$Em!==r){const l=a.getPropertyOptions(r),n=typeof l.converter=="function"?{fromAttribute:l.converter}:((i=l.converter)==null?void 0:i.fromAttribute)!==void 0?l.converter:D;this._$Em=r;const m=n.fromAttribute(s,l.type);this[r]=m??((o=this._$Ej)==null?void 0:o.get(r))??m,this._$Em=null}}requestUpdate(e,s,a,r=!1,i){var o;if(e!==void 0){const l=this.constructor;if(r===!1&&(i=this[e]),a??(a=l.getPropertyOptions(e)),!((a.hasChanged??oe)(i,s)||a.useDefault&&a.reflect&&i===((o=this._$Ej)==null?void 0:o.get(e))&&!this.hasAttribute(l._$Eu(e,a))))return;this.C(e,s,a)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,s,{useDefault:a,reflect:r,wrapped:i},o){a&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,o??s??this[e]),i!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||a||(s=void 0),this._$AL.set(e,s)),r===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(s){Promise.reject(s)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var a;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[i,o]of this._$Ep)this[i]=o;this._$Ep=void 0}const r=this.constructor.elementProperties;if(r.size>0)for(const[i,o]of r){const{wrapped:l}=o,n=this[i];l!==!0||this._$AL.has(i)||n===void 0||this.C(i,void 0,o,n)}}let e=!1;const s=this._$AL;try{e=this.shouldUpdate(s),e?(this.willUpdate(s),(a=this._$EO)==null||a.forEach(r=>{var i;return(i=r.hostUpdate)==null?void 0:i.call(r)}),this.update(s)):this._$EM()}catch(r){throw e=!1,this._$EM(),r}e&&this._$AE(s)}willUpdate(e){}_$AE(e){var s;(s=this._$EO)==null||s.forEach(a=>{var r;return(r=a.hostUpdated)==null?void 0:r.call(a)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(s=>this._$ET(s,this[s]))),this._$EM()}updated(e){}firstUpdated(e){}};C.elementStyles=[],C.shadowRootOptions={mode:"open"},C[z("elementProperties")]=new Map,C[z("finalized")]=new Map,K==null||K({ReactiveElement:C}),($.reactiveElementVersions??($.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const M=globalThis,me=t=>t,H=M.trustedTypes,he=H?H.createPolicy("lit-html",{createHTML:t=>t}):void 0,_e="$lit$",w=`lit$${Math.random().toFixed(9).slice(2)}$`,Pe="?"+w,We=`<${Pe}>`,A=document,I=()=>A.createComment(""),N=t=>t===null||typeof t!="object"&&typeof t!="function",ne=Array.isArray,Ve=t=>ne(t)||typeof(t==null?void 0:t[Symbol.iterator])=="function",X=`[ 	
\f\r]`,T=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,ue=/-->/g,ge=/>/g,k=RegExp(`>|${X}(?:([^\\s"'>=/]+)(${X}*=${X}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),fe=/'/g,be=/"/g,Ae=/^(?:script|style|textarea|title)$/i,Ye=t=>(e,...s)=>({_$litType$:t,strings:e,values:s}),p=Ye(1),S=Symbol.for("lit-noChange"),h=Symbol.for("lit-nothing"),ve=new WeakMap,_=A.createTreeWalker(A,129);function Ce(t,e){if(!ne(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return he!==void 0?he.createHTML(e):e}const qe=(t,e)=>{const s=t.length-1,a=[];let r,i=e===2?"<svg>":e===3?"<math>":"",o=T;for(let l=0;l<s;l++){const n=t[l];let m,u,d=-1,b=0;for(;b<n.length&&(o.lastIndex=b,u=o.exec(n),u!==null);)b=o.lastIndex,o===T?u[1]==="!--"?o=ue:u[1]!==void 0?o=ge:u[2]!==void 0?(Ae.test(u[2])&&(r=RegExp("</"+u[2],"g")),o=k):u[3]!==void 0&&(o=k):o===k?u[0]===">"?(o=r??T,d=-1):u[1]===void 0?d=-2:(d=o.lastIndex-u[2].length,m=u[1],o=u[3]===void 0?k:u[3]==='"'?be:fe):o===be||o===fe?o=k:o===ue||o===ge?o=T:(o=k,r=void 0);const x=o===k&&t[l+1].startsWith("/>")?" ":"";i+=o===T?n+We:d>=0?(a.push(m),n.slice(0,d)+_e+n.slice(d)+w+x):n+w+(d===-2?l:x)}return[Ce(t,i+(t[s]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),a]};class R{constructor({strings:e,_$litType$:s},a){let r;this.parts=[];let i=0,o=0;const l=e.length-1,n=this.parts,[m,u]=qe(e,s);if(this.el=R.createElement(m,a),_.currentNode=this.el.content,s===2||s===3){const d=this.el.content.firstChild;d.replaceWith(...d.childNodes)}for(;(r=_.nextNode())!==null&&n.length<l;){if(r.nodeType===1){if(r.hasAttributes())for(const d of r.getAttributeNames())if(d.endsWith(_e)){const b=u[o++],x=r.getAttribute(d).split(w),G=/([.?@])?(.*)/.exec(b);n.push({type:1,index:i,name:G[2],strings:x,ctor:G[1]==="."?Fe:G[1]==="?"?Ke:G[1]==="@"?Xe:J}),r.removeAttribute(d)}else d.startsWith(w)&&(n.push({type:6,index:i}),r.removeAttribute(d));if(Ae.test(r.tagName)){const d=r.textContent.split(w),b=d.length-1;if(b>0){r.textContent=H?H.emptyScript:"";for(let x=0;x<b;x++)r.append(d[x],I()),_.nextNode(),n.push({type:2,index:++i});r.append(d[b],I())}}}else if(r.nodeType===8)if(r.data===Pe)n.push({type:2,index:i});else{let d=-1;for(;(d=r.data.indexOf(w,d+1))!==-1;)n.push({type:7,index:i}),d+=w.length-1}i++}}static createElement(e,s){const a=A.createElement("template");return a.innerHTML=e,a}}function E(t,e,s=t,a){var o,l;if(e===S)return e;let r=a!==void 0?(o=s._$Co)==null?void 0:o[a]:s._$Cl;const i=N(e)?void 0:e._$litDirective$;return(r==null?void 0:r.constructor)!==i&&((l=r==null?void 0:r._$AO)==null||l.call(r,!1),i===void 0?r=void 0:(r=new i(t),r._$AT(t,s,a)),a!==void 0?(s._$Co??(s._$Co=[]))[a]=r:s._$Cl=r),r!==void 0&&(e=E(t,r._$AS(t,e.values),r,a)),e}class Je{constructor(e,s){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=s}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:s},parts:a}=this._$AD,r=((e==null?void 0:e.creationScope)??A).importNode(s,!0);_.currentNode=r;let i=_.nextNode(),o=0,l=0,n=a[0];for(;n!==void 0;){if(o===n.index){let m;n.type===2?m=new L(i,i.nextSibling,this,e):n.type===1?m=new n.ctor(i,n.name,n.strings,this,e):n.type===6&&(m=new Ze(i,this,e)),this._$AV.push(m),n=a[++l]}o!==(n==null?void 0:n.index)&&(i=_.nextNode(),o++)}return _.currentNode=A,r}p(e){let s=0;for(const a of this._$AV)a!==void 0&&(a.strings!==void 0?(a._$AI(e,a,s),s+=a.strings.length-2):a._$AI(e[s])),s++}}class L{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,s,a,r){this.type=2,this._$AH=h,this._$AN=void 0,this._$AA=e,this._$AB=s,this._$AM=a,this.options=r,this._$Cv=(r==null?void 0:r.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const s=this._$AM;return s!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=s.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,s=this){e=E(this,e,s),N(e)?e===h||e==null||e===""?(this._$AH!==h&&this._$AR(),this._$AH=h):e!==this._$AH&&e!==S&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Ve(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==h&&N(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){var i;const{values:s,_$litType$:a}=e,r=typeof a=="number"?this._$AC(e):(a.el===void 0&&(a.el=R.createElement(Ce(a.h,a.h[0]),this.options)),a);if(((i=this._$AH)==null?void 0:i._$AD)===r)this._$AH.p(s);else{const o=new Je(r,this),l=o.u(this.options);o.p(s),this.T(l),this._$AH=o}}_$AC(e){let s=ve.get(e.strings);return s===void 0&&ve.set(e.strings,s=new R(e)),s}k(e){ne(this._$AH)||(this._$AH=[],this._$AR());const s=this._$AH;let a,r=0;for(const i of e)r===s.length?s.push(a=new L(this.O(I()),this.O(I()),this,this.options)):a=s[r],a._$AI(i),r++;r<s.length&&(this._$AR(a&&a._$AB.nextSibling,r),s.length=r)}_$AR(e=this._$AA.nextSibling,s){var a;for((a=this._$AP)==null?void 0:a.call(this,!1,!0,s);e!==this._$AB;){const r=me(e).nextSibling;me(e).remove(),e=r}}setConnected(e){var s;this._$AM===void 0&&(this._$Cv=e,(s=this._$AP)==null||s.call(this,e))}}class J{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,s,a,r,i){this.type=1,this._$AH=h,this._$AN=void 0,this.element=e,this.name=s,this._$AM=r,this.options=i,a.length>2||a[0]!==""||a[1]!==""?(this._$AH=Array(a.length-1).fill(new String),this.strings=a):this._$AH=h}_$AI(e,s=this,a,r){const i=this.strings;let o=!1;if(i===void 0)e=E(this,e,s,0),o=!N(e)||e!==this._$AH&&e!==S,o&&(this._$AH=e);else{const l=e;let n,m;for(e=i[0],n=0;n<i.length-1;n++)m=E(this,l[a+n],s,n),m===S&&(m=this._$AH[n]),o||(o=!N(m)||m!==this._$AH[n]),m===h?e=h:e!==h&&(e+=(m??"")+i[n+1]),this._$AH[n]=m}o&&!r&&this.j(e)}j(e){e===h?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class Fe extends J{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===h?void 0:e}}class Ke extends J{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==h)}}class Xe extends J{constructor(e,s,a,r,i){super(e,s,a,r,i),this.type=5}_$AI(e,s=this){if((e=E(this,e,s,0)??h)===S)return;const a=this._$AH,r=e===h&&a!==h||e.capture!==a.capture||e.once!==a.once||e.passive!==a.passive,i=e!==h&&(a===h||r);r&&this.element.removeEventListener(this.name,this,a),i&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var s;typeof this._$AH=="function"?this._$AH.call(((s=this.options)==null?void 0:s.host)??this.element,e):this._$AH.handleEvent(e)}}class Ze{constructor(e,s,a){this.element=e,this.type=6,this._$AN=void 0,this._$AM=s,this.options=a}get _$AU(){return this._$AM._$AU}_$AI(e){E(this,e)}}const Z=M.litHtmlPolyfillSupport;Z==null||Z(R,L),(M.litHtmlVersions??(M.litHtmlVersions=[])).push("3.3.2");const Se=(t,e,s)=>{const a=(s==null?void 0:s.renderBefore)??e;let r=a._$litPart$;if(r===void 0){const i=(s==null?void 0:s.renderBefore)??null;a._$litPart$=r=new L(e.insertBefore(I(),i),i,void 0,s??{})}return r._$AI(t),r};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const P=globalThis;class g extends C{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var s;const e=super.createRenderRoot();return(s=this.renderOptions).renderBefore??(s.renderBefore=e.firstChild),e}update(e){const s=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Se(s,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return S}}var $e;g._$litElement$=!0,g.finalized=!0,($e=P.litElementHydrateSupport)==null||$e.call(P,{LitElement:g});const Q=P.litElementPolyfillSupport;Q==null||Q({LitElement:g});(P.litElementVersions??(P.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const f=t=>(e,s)=>{s!==void 0?s.addInitializer(()=>{customElements.define(t,e)}):customElements.define(t,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Qe={attribute:!0,type:String,converter:D,reflect:!1,hasChanged:oe},et=(t=Qe,e,s)=>{const{kind:a,metadata:r}=s;let i=globalThis.litPropertyMetadata.get(r);if(i===void 0&&globalThis.litPropertyMetadata.set(r,i=new Map),a==="setter"&&((t=Object.create(t)).wrapped=!0),i.set(s.name,t),a==="accessor"){const{name:o}=s;return{set(l){const n=e.get.call(this);e.set.call(this,l),this.requestUpdate(o,n,t,!0,l)},init(l){return l!==void 0&&this.C(o,void 0,t,l),l}}}if(a==="setter"){const{name:o}=s;return function(l){const n=this[o];e.call(this,l),this.requestUpdate(o,n,t,!0,l)}}throw Error("Unsupported decorator location: "+a)};function tt(t){return(e,s)=>typeof s=="object"?et(t,e,s):((a,r,i)=>{const o=r.hasOwnProperty(i);return r.constructor.createProperty(i,a),o?Object.getOwnPropertyDescriptor(r,i):void 0})(t,e,s)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function y(t){return tt({...t,state:!0,attribute:!1})}const st={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"功能",runtime:"运行时",ecosystem:"生态",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"持续进化的 Pi Runtime",title:{part1:"把 AI 编程变成",accent:"可编程系统",part2:""},description:"Pi 不只是聊天窗口：它把代码检索、上下文 checkpoint、角色记忆、原生 GAPP 界面、Provider 可观测性和 Gateway 编排放进同一个可扩展运行时。",cta:{primary:"开始使用",secondary:"阅读文档"},stats:{commands:"持久上下文",extensions:"原生生成式 UI",productivity:"端到端可观测"}},features:{label:"运行时能力",title:"从上下文到交付，一条可观察链路",subtitle:"检索真实代码路径，保存可恢复上下文，用扩展和 GAPP 增强交互，并把验证证据留在同一会话里。",workflow:{title:"证据驱动工作流",desc:"先定位真实实现，再形成计划、执行最小修改、运行验证并交付证据；流程随任务复杂度伸缩，而不是固定阶段表演。",features:["先读真实调用链，再动代码","checkpoint / compact 保留关键上下文","测试、diff、状态一起验证","工具与扩展按任务动态组合"],metrics:{tasks:"上下文标记",success:"工作树状态",active:"Provider 追踪"}},skills:{title:"按需技能与工具",desc:"语义检索、AST、浏览器、设计、诊断、文档与自动化能力按任务加载。",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"角色与长期记忆",desc:"角色配置、记忆检索与 viewer 贯穿会话，而不是每次从零开始。",agents:["角色","记忆","召回","整理","导出","Viewer","标签","向量","场景","提示","服务","适配"]},search:{title:"代码搜索",desc:"自然语言到精确位置。三层搜索，零遗漏。",example:'pi /search "认证中间件"'},gateway:{title:"多通道网关",desc:"一个服务支持 Telegram、Discord、WebChat、OpenAI API。",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"网关",title:"把 Pi 运行时分发到更多入口",subtitle:"Gateway 用 RPC worker pool、会话路由和插件管线把同一套 Pi 能力接到 Web、API 与消息通道，同时保持 worker 启动可控。",layers:{channels:{title:"通道",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"管线",desc:"分发 → 去重 → 解析 → 处理"},plugins:{title:"插件",desc:"16 钩子 · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 路由 · 定时 · 事件"},security:{title:"安全",desc:"认证 · 执行守卫 · SSRF · 白名单"}}},workflow:{label:"工作流",title:"证据驱动的工程闭环",subtitle:"不是固定五阶段，而是围绕真实代码、可恢复上下文和可复现验证形成闭环。",phases:[{num:"01",title:"定位",desc:"语义检索、精确匹配、调用链"},{num:"02",title:"建模",desc:"理解约束、选择最小改动面"},{num:"03",title:"保存",desc:"checkpoint、tag、compact 关键上下文"},{num:"04",title:"执行",desc:"精准编辑、扩展工具、GAPP 交互"},{num:"05",title:"验证",desc:"测试、diff、状态与可观测证据"}]},extensions:{label:"扩展",title:"无限扩展",subtitle:"从 CLI 命令到 TUI 组件，从网关插件到定时任务。",categories:{commands:{title:"命令",desc:"斜杠命令和快捷键"},tools:{title:"工具",desc:"可复用能力"},gateway:{title:"网关",desc:"通道集成"}}},comparison:{label:"对比",title:"不把 Agent 当一次性聊天",subtitle:"Pi 的差异在运行时：上下文能恢复、能力能扩展、行为能观察、界面能生成。",headers:{feature:"能力",pi:"Pi Agent",others:"典型工具"},rows:[{feature:"上下文生命周期",pi:"checkpoint + tag + compact",others:"会话即上下文"},{feature:"代码定位",pi:"语义 + 精确 + AST",others:"基础搜索"},{feature:"交互表面",pi:"TUI + Web + GAPP",others:"单一聊天界面"},{feature:"长期记忆",pi:"角色记忆 + 检索 + viewer",others:"临时提示词"},{feature:"可观测与分发",pi:"Provider Trace + Gateway/RPC",others:"单一接口"}]},cta:{title:"把你的 Pi 变成自己的工程系统",subtitle:"从一个可工作的 coding agent 开始，再按项目需要接入记忆、GAPP、可观测性与网关。",button:"开始使用"},footer:{tagline:"工程级 AI 编排。",links:{docs:"文档",github:"GitHub",discord:"Discord"},copyright:"精准构建。"}},rt={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",runtime:"Runtime",ecosystem:"Ecosystem",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Pi Runtime, continuously evolving",title:{part1:"Make AI coding a ",accent:"programmable system",part2:""},description:"Pi is more than a chat surface: code retrieval, context checkpoints, role memory, native GAPP interfaces, provider observability, and gateway orchestration live in one extensible runtime.",cta:{primary:"Get Started",secondary:"Read Docs"},stats:{commands:"Persistent Context",extensions:"Native Generative UI",productivity:"End-to-end Observability"}},features:{label:"Runtime Capabilities",title:"One observable path from context to delivery",subtitle:"Trace real code paths, preserve recoverable context, extend the runtime with tools and GAPPs, and keep verification evidence in the same session.",workflow:{title:"Evidence-driven workflow",desc:"Locate the real implementation, model constraints, make the smallest change, verify it, and ship evidence. The loop scales with the task instead of enforcing ceremony.",features:["Read the real call path before editing","Checkpoint / compact critical context","Verify tests, diff, and worktree state together","Compose tools and extensions per task"],metrics:{tasks:"Context Tag",success:"Worktree State",active:"Provider Trace"}},skills:{title:"On-demand skills & tools",desc:"Semantic retrieval, AST, browser, design, diagnosis, docs, and automation capabilities load for the task at hand.",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"Roles & durable memory",desc:"Role configuration, memory retrieval, and a viewer carry knowledge across sessions instead of starting from zero.",agents:["role","memory","recall","organize","export","viewer","tags","vector","scenarios","prompt","service","adapter"]},search:{title:"Code Search",desc:"Natural language to exact location. Three layers, zero misses.",example:'pi /search "auth middleware"'},gateway:{title:"Multi-Channel Gateway",desc:"One service for Telegram, Discord, WebChat, OpenAI API.",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"Gateway",title:"Distribute the Pi runtime beyond the terminal",subtitle:"Gateway uses an RPC worker pool, session routing, and a programmable plugin pipeline to expose the same Pi capabilities through Web, APIs, and messaging channels.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Resolve → Process"},plugins:{title:"Plugins",desc:"16 Hooks · Registry · Conflicts"},runtime:{title:"Runtime",desc:"RPC Pool · Router · Cron · Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF · Allowlist"}}},workflow:{label:"Workflow",title:"An evidence-driven engineering loop",subtitle:"Not a mandatory five-step ritual: a loop around real code, recoverable context, precise edits, and reproducible verification.",phases:[{num:"01",title:"Locate",desc:"Semantic retrieval, exact match, call paths"},{num:"02",title:"Model",desc:"Understand constraints, choose the smallest surface"},{num:"03",title:"Preserve",desc:"Checkpoint, tag, and compact critical context"},{num:"04",title:"Execute",desc:"Surgical edits, extension tools, GAPP interaction"},{num:"05",title:"Verify",desc:"Tests, diff, state, and observable evidence"}]},extensions:{label:"Extensions",title:"Infinite Extensibility",subtitle:"From CLI commands to TUI components, from gateway plugins to cron jobs.",categories:{commands:{title:"Commands",desc:"Slash commands and shortcuts"},tools:{title:"Tools",desc:"Reusable capabilities"},gateway:{title:"Gateway",desc:"Channel integrations"}}},comparison:{label:"Comparison",title:"An agent runtime, not disposable chat",subtitle:"Pi differs at the runtime layer: context can recover, capabilities can extend, behavior can be observed, and interfaces can be generated.",headers:{feature:"Capability",pi:"Pi Agent",others:"Typical Tools"},rows:[{feature:"Context lifecycle",pi:"checkpoint + tag + compact",others:"session-only context"},{feature:"Code location",pi:"semantic + exact + AST",others:"basic search"},{feature:"Interaction surface",pi:"TUI + Web + GAPP",others:"single chat surface"},{feature:"Durable memory",pi:"role memory + retrieval + viewer",others:"temporary prompts"},{feature:"Observe & distribute",pi:"Provider Trace + Gateway/RPC",others:"single interface"}]},cta:{title:"Turn Pi into your engineering system",subtitle:"Start with a working coding agent, then add memory, GAPPs, observability, and gateway capabilities as your project needs them.",button:"Get Started"},footer:{tagline:"Engineering-grade AI orchestration.",links:{docs:"Documentation",github:"GitHub",discord:"Discord"},copyright:"Built with precision."}},ee={"zh-CN":st,"en-US":rt},ye="pi-agent-locale";class at{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const s=localStorage.getItem(ye);if(s&&ee[s]){this.currentLocale=s;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(ee[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(ye,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(s=>s())}}t(e){const s=e.split(".");let a=ee[this.currentLocale];for(const r of s)if(a&&typeof a=="object"&&r in a)a=a[r];else return e;return typeof a=="string"?a:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const c=new at;var it=Object.defineProperty,ot=Object.getOwnPropertyDescriptor,F=(t,e,s,a)=>{for(var r=a>1?void 0:a?ot(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&it(e,s,r),r};const xe=[{key:"features",id:"features"},{key:"runtime",id:"runtime"},{key:"ecosystem",id:"ecosystem"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],te="https://github.com/Dwsy/agent";let O=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=p`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`,this._burgerIcon=p`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen?p`<path d="M18 6L6 18M6 6l12 12"/>`:p`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=c.subscribe(()=>{this.locale=c.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var t,e;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const t=new Map;this._io=new IntersectionObserver(e=>{for(const r of e)r.isIntersecting?t.set(r.target.id,r.intersectionRatio):t.delete(r.target.id);let s="",a=0;t.forEach((r,i)=>{r>a&&(a=r,s=i)}),s!==this.activeId&&(this.activeId=s)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of xe){const s=document.getElementById(e.id);s&&this._io.observe(s)}})}t(t){return c.t(t)}_toggleLocale(){c.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const t=xe.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return p`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-mark">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="links">
          ${t.map(e=>p`
            <a href="#${e.id}" class="link" ?active=${this.activeId===e.id}>${e.label}</a>
          `)}
        </div>

        <div class="actions">
          <button class="lang-btn" @click=${this._toggleLocale}>
            ${this.locale==="zh-CN"?"EN":"中文"}
          </button>
          <a href=${te} target="_blank" class="gh-btn" aria-label="GitHub">
            ${this._ghIcon}
          </a>
          <a href=${te} class="cta" target="_blank">${this.t("navbar.cta")}</a>
          <button class="burger" @click=${this._toggleMenu}>${this._burgerIcon}</button>
        </div>
      </nav>

      <div class="mobile" ?open=${this.menuOpen}>
        ${t.map(e=>p`
          <a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>
            ${e.label}
          </a>
        `)}
        <a href=${te} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
      </div>
    `}};O.styles=v`
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
  `;F([y()],O.prototype,"locale",2);F([y()],O.prototype,"menuOpen",2);F([y()],O.prototype,"activeId",2);O=F([f("pi-navbar")],O);var nt=Object.defineProperty,lt=Object.getOwnPropertyDescriptor,Ee=(t,e,s,a)=>{for(var r=a>1?void 0:a?lt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&nt(e,s,r),r};let j=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return c.t(t)}render(){const t=c.t.bind(c);return p`
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
              <span class="stat-value">Context</span>
              <span class="stat-label">${t("hero.stats.commands")}</span>
            </div>
            <div class="stat">
              <span class="stat-value">GAPP</span>
              <span class="stat-label">${t("hero.stats.extensions")}</span>
            </div>
            <div class="stat">
              <span class="stat-value">Trace</span>
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
                <span class="terminal-command">pi "trace the real flow, then fix it"</span>
              </div>
              <div class="terminal-output">
                retrieving symbols + callers...<br>
                checkpointing context...<br>
                applying surgical edit + verification...<br>
                <span style="color: #10b981;">evidence attached · worktree clean</span>
              </div>
              <div class="terminal-line">
                <span class="terminal-prompt">$</span>
                <span class="terminal-command">pi /gapp open dyncode-project-map</span>
                <span class="terminal-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}};j.styles=v`
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
  `;Ee([y()],j.prototype,"locale",2);j=Ee([f("hero-section")],j);var ct=Object.defineProperty,dt=Object.getOwnPropertyDescriptor,Oe=(t,e,s,a)=>{for(var r=a>1?void 0:a?dt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&ct(e,s,r),r};let B=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}_handleMouseMove(t){const e=t.currentTarget,s=e.getBoundingClientRect(),a=(t.clientX-s.left)/s.width*100,r=(t.clientY-s.top)/s.height*100;e.style.setProperty("--mouse-x",`${a}%`),e.style.setProperty("--mouse-y",`${r}%`)}render(){const t=a=>c.t(a),e=c.getCurrentLocale()==="zh-CN",s=e?["角色","记忆","召回","整理","标签","向量","Viewer","服务","适配","导出","场景","提示"]:["ROLE","MEM","RECALL","ORG","TAG","VEC","VIEW","SVC","ADAPT","EXP","SCN","PROMPT"];return p`
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
                <div class="stat-value">CTX</div>
                <div class="stat-label">${e?"可恢复上下文":"Recoverable Context"}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">UI</div>
                <div class="stat-label">${e?"GAPP 原生界面":"Native GAPP"}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">OBS</div>
                <div class="stat-label">${e?"Provider 可观测":"Provider Trace"}</div>
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
                ${[0,1,2,3].map(a=>p`<li class="feature">${t(`features.workflow.features.${a}`)}</li>`)}
              </ul>
              <div class="status-widget">
                <div class="status-header">
                  <span class="status-dot"></span>
                  <span class="status-text">Live System Status</span>
                </div>
                <div class="status-metrics">
                  <div class="metric">
                    <span class="metric-value">tag</span>
                    <span class="metric-label">${t("features.workflow.metrics.tasks")}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">clean</span>
                    <span class="metric-label">${t("features.workflow.metrics.success")}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">trace</span>
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
                ${[0,1,2,3,4].map(a=>p`<span class="skill-tag">${t(`features.skills.tags.${a}`)}</span>`)}
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
                ${s.map((a,r)=>p`
                  <div class="agent-cell ${r<5?"active":""}">${a}</div>
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
    `}};B.styles=v`
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
      min-height: 2.5rem;
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
  `;Oe([y()],B.prototype,"locale",2);B=Oe([f("bento-grid")],B);var pt=Object.defineProperty,mt=Object.getOwnPropertyDescriptor,Te=(t,e,s,a)=>{for(var r=a>1?void 0:a?mt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&pt(e,s,r),r};let W=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this.unsubscribe)==null||t.call(this)}render(){const t=this.locale==="zh-CN";return p`
      <section class="scene" id="runtime">
        <div class="inner">
          <div class="intro">
            <div class="kicker">${"PI RUNTIME SYSTEM"}</div>
            <h2>${t?"不是一条流水线，是一个可恢复的运行系统":"Not a pipeline. A recoverable runtime system."}</h2>
            <p class="lead">${t?"Pi 把代码定位、上下文生命周期、角色记忆、Gateway 分发和 Provider 可观测性放在同一个工程闭环里。每一层都能独立工作，也能在同一会话中组合。":"Pi connects code location, context lifecycle, role memory, gateway distribution, and provider observability into one engineering loop. Each layer works independently and composes inside the same session."}</p>
            <div class="principle"><strong>${t?"工程协议":"Engineering protocol"}</strong><br>${t?"L1–L4 按复杂度路由；先读真实实现，再做最小修改，最后用测试、diff 与状态交付证据。":"Route by L1–L4 complexity; read the real implementation first, make the smallest change, then ship tests, diff, and state as evidence."}</div>
          </div>

          <div class="system">
            <article class="module active">
              <div class="index">01 / context</div>
              <div class="body"><h3>${t?"上下文像 Git 一样可操作":"Context you can operate like Git"}</h3><p>${t?"关键状态可 tag、查看 history、checkout 语义节点；长会话通过 compact 保存 handoff，而不是把全部历史无限塞进窗口。":"Tag important states, inspect history, checkout semantic points, and compact long sessions while preserving the handoff instead of endlessly stuffing history into the window."}</p><div class="tokens"><span class="token green">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></div>
            </article>
            <article class="module">
              <div class="index">02 / role memory</div>
              <div class="body"><h3>${t?"角色、记忆与知识分层":"Role-scoped memory and knowledge"}</h3><p>${t?"工作目录自动映射角色；短期 session context 与长期 memory 分离，经验沿 daily → pending → consolidated / knowledge 晋升，并支持向量召回与 viewer。":"Workspace paths map to roles automatically. Short-term session context stays separate from durable memory; experience promotes through daily → pending → consolidated / knowledge with vector recall and a viewer."}</p><div class="tokens"><span class="token">role mapping</span><span class="token green">memory.search</span><span class="token">LanceDB</span><span class="token">viewer</span></div></div>
            </article>
            <article class="module">
              <div class="index">03 / gateway</div>
              <div class="body"><h3>${t?"同一个 Pi，分发到更多入口":"One Pi runtime, more entry points"}</h3><p>${t?"Gateway 用 session-aware routing、RPC worker pool 和插件管线把 Pi 接到 Web、API 与消息通道；worker 启动不依赖在线 provider。":"Gateway uses session-aware routing, an RPC worker pool, and a plugin pipeline to expose Pi through Web, APIs, and messaging channels, with network-safe worker startup."}</p><div class="tokens"><span class="token">WebSocket</span><span class="token">HTTP</span><span class="token green">RPC pool</span><span class="token">offline-safe</span></div></div>
            </article>
            <article class="module">
              <div class="index">04 / observe + verify</div>
              <div class="body"><h3>${t?"从 Provider 到工作树都留下证据":"Evidence from provider to worktree"}</h3><p>${t?"Provider Trace 观察请求与响应链路；工程闭环则把 locate → model → preserve → execute → verify 连接起来，最终检查测试、diff 与 worktree 状态。":"Provider Trace observes request/response paths while the engineering loop connects locate → model → preserve → execute → verify, ending with tests, diff, and worktree state."}</p><div class="flow"><div class="flow-step"><strong>Locate</strong>semantic · exact · AST</div><div class="flow-step"><strong>Model</strong>callers · constraints</div><div class="flow-step"><strong>Preserve</strong>tag · compact</div><div class="flow-step"><strong>Execute</strong>edit · GAPP</div><div class="flow-step"><strong>Verify</strong>test · diff · state</div></div></div>
            </article>
          </div>
        </div>
      </section>
    `}};W.styles=v`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 5rem; align-items: start; }
    .intro { position: sticky; top: 7rem; }
    .kicker { color: #10b981; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.02; letter-spacing: -0.04em; font-weight: 600; }
    .lead { color: #a1a1aa; font-size: 1.0625rem; line-height: 1.75; margin: 0 0 2rem; max-width: 46ch; }
    .principle { padding-top: 1.25rem; border-top: 1px solid #27272a; color: #71717a; font-size: 0.8125rem; line-height: 1.7; }
    .principle strong { color: #d4d4d8; }

    .system { border-left: 1px solid #27272a; }
    .module { position: relative; display: grid; grid-template-columns: 9rem 1fr; gap: 2rem; padding: 0 0 3.5rem 2.5rem; }
    .module:last-child { padding-bottom: 0; }
    .module::before { content: ''; position: absolute; left: -5px; top: 0.4rem; width: 9px; height: 9px; border-radius: 50%; background: #09090b; border: 2px solid #3f3f46; }
    .module.active::before { border-color: #10b981; box-shadow: 0 0 0 5px rgba(16,185,129,0.08); }
    .index { color: #52525b; font: 0.6875rem/1.4 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .body { padding-bottom: 3.5rem; border-bottom: 1px solid #202023; }
    .module:last-child .body { border-bottom: 0; padding-bottom: 0; }
    .body h3 { margin: 0 0 0.75rem; color: #fafafa; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
    .body p { margin: 0 0 1.25rem; color: #71717a; line-height: 1.7; font-size: 0.9375rem; }
    .tokens { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .token { padding: 0.4rem 0.65rem; border: 1px solid #2f2f33; border-radius: 0.4rem; color: #a1a1aa; background: #111113; font: 0.6875rem/1 'JetBrains Mono', monospace; }
    .token.green { color: #34d399; border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.06); }
    .flow { margin-top: 1.25rem; display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
    .flow-step { padding: 0.75rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.7rem; line-height: 1.45; }
    .flow-step strong { display: block; color: #d4d4d8; margin-bottom: 0.25rem; font-size: 0.75rem; }

    @media (max-width: 900px) { .inner { grid-template-columns: 1fr; gap: 3rem; } .intro { position: static; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .module { grid-template-columns: 1fr; gap: 0.75rem; padding-left: 1.5rem; } .flow { grid-template-columns: 1fr 1fr; } }
  `;Te([y()],W.prototype,"locale",2);W=Te([f("runtime-system-scene")],W);var ht=Object.defineProperty,ut=Object.getOwnPropertyDescriptor,ze=(t,e,s,a)=>{for(var r=a>1?void 0:a?ut(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&ht(e,s,r),r};let V=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this.unsubscribe)==null||t.call(this)}render(){const t=this.locale==="zh-CN";return p`
      <section class="scene" id="ecosystem">
        <div class="inner">
          <div class="head"><div><div class="kicker">${"COMPANION ECOSYSTEM"}</div><h2>${t?"Pi 保持核心，体验和连续性向外扩展":"Keep Pi at the core. Extend experience and continuity."}</h2></div><p>${t?"两款配套产品都不接管 Agent：grok-pi-tui 把 Pi 投射到 Grok Build 原生 Pager；Pi Session Manager 则管理 Agent 留下的 session 历史、结构和恢复入口。":"Neither companion takes over the agent. grok-pi-tui projects Pi into Grok Build's native Pager; Pi Session Manager manages the session history, structure, and resume paths agents leave behind."}</p></div>
          <div class="products">
            <article class="product grok"><div class="product-label">grok-pi-tui · remote TUI bridge</div><h3>${"Pi Runtime × Grok Pager"}</h3><p>${t?"Pi 继续拥有模型、Provider、工具、扩展、Skill、Session 与执行；Grok Pager 成为唯一终端 UI，负责输入、Markdown、Tool Card、Diff、Dialog 与 Scrollback。":"Pi keeps models, providers, tools, extensions, skills, sessions, and execution; Grok Pager becomes the only terminal UI for input, Markdown, tool cards, diffs, dialogs, and scrollback."}</p><div class="diagram"><div class="bridge"><div class="bridge-node">Grok Pager<span>native TUI</span></div><div class="bridge-node">ACP<span>interaction</span></div><div class="bridge-node">pi-grok-adapter<span>JSONL RPC ↔ ACP</span></div><div class="bridge-node">Pi Core<span>agent runtime</span></div></div><div class="actions"><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/grok-pi-tui/" target="_blank" rel="noopener">${t?"项目主页 ↗":"Project site ↗"}</a></div></div></article>
            <article class="product psm"><div class="product-label">pi-session-manager · local-first workbench</div><h3>${t?"Session 不再是一次性聊天记录":"Sessions stop being disposable chat logs"}</h3><p>${t?"跨 Agent 索引、搜索、树与 Kanban、Branch Atlas、Tool Trace、token/cost 统计，以及 resume / convert / export。管理 Agent 周围的工作，而不是替代 Agent。":"Cross-agent indexing, search, trees and Kanban, Branch Atlas, tool traces, token/cost stats, plus resume / convert / export. It manages the work around the agent, not the agent itself."}</p><div class="diagram"><div class="sources">${["Pi","Claude Code","Codex","OpenCode","Gemini CLI","Cursor","Antigravity"].map(e=>p`<span class="source">${e}</span>`)}</div><div class="psm-flow"><div class="psm-step"><strong>Index</strong>scan</div><div class="psm-step"><strong>Understand</strong>tree · trace</div><div class="psm-step"><strong>Organize</strong>search · kanban</div><div class="psm-step"><strong>Resume</strong>export · continue</div></div><div class="actions"><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/pi-session-manager/" target="_blank" rel="noopener">${t?"文档 / Demo ↗":"Docs / demo ↗"}</a></div></div></article>
          </div>
        </div>
      </section>
    `}};V.styles=v`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #0c0c0e; border-top: 1px solid #18181b; border-bottom: 1px solid #18181b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 4rem; align-items: end; margin-bottom: 4rem; }
    .kicker { color: #a1a1aa; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.02; letter-spacing: -0.04em; font-weight: 600; }
    .head p { margin: 0; color: #71717a; line-height: 1.75; max-width: 58ch; }
    .products { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1rem; }
    .product { min-height: 32rem; padding: 2rem; border: 1px solid #27272a; border-radius: 1.25rem; background: #111113; display: flex; flex-direction: column; overflow: hidden; }
    .product.grok { background: linear-gradient(145deg, rgba(249,115,22,0.08), transparent 42%), #111113; }
    .product.psm { background: linear-gradient(145deg, rgba(96,165,250,0.08), transparent 42%), #111113; }
    .product-label { font: 0.6875rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 2.5rem; }
    .grok .product-label { color: #fb923c; } .psm .product-label { color: #93c5fd; }
    .product h3 { margin: 0 0 0.9rem; color: #fafafa; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; }
    .product p { margin: 0 0 1.5rem; color: #a1a1aa; line-height: 1.7; font-size: 0.9375rem; }
    .diagram { margin-top: auto; padding-top: 2rem; border-top: 1px solid #27272a; }
    .bridge { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; align-items: stretch; }
    .bridge-node { min-height: 5rem; padding: 0.7rem; border: 1px solid #2f2f33; border-radius: 0.6rem; color: #d4d4d8; font-size: 0.7rem; line-height: 1.45; display: flex; flex-direction: column; justify-content: center; }
    .bridge-node span { color: #52525b; margin-top: 0.2rem; }
    .sources { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
    .source { padding: 0.35rem 0.55rem; border: 1px solid #2f2f33; border-radius: 0.35rem; color: #71717a; font: 0.65rem/1 'JetBrains Mono', monospace; }
    .psm-flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
    .psm-step { padding: 0.7rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.7rem; }
    .psm-step strong { display: block; color: #d4d4d8; margin-bottom: 0.25rem; }
    .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1.5rem; }
    a { color: #d4d4d8; text-decoration: none; padding: 0.65rem 0.85rem; border: 1px solid #3f3f46; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600; }
    a:hover { border-color: #71717a; color: #fafafa; }
    a:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 3px; }
    @media (max-width: 900px) { .head, .products { grid-template-columns: 1fr; } .product { min-height: auto; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .bridge, .psm-flow { grid-template-columns: 1fr 1fr; } }
  `;ze([y()],V.prototype,"locale",2);V=ze([f("companion-ecosystem-scene")],V);var gt=Object.defineProperty,ft=Object.getOwnPropertyDescriptor,Me=(t,e,s,a)=>{for(var r=a>1?void 0:a?ft(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&gt(e,s,r),r};let Y=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this.unsubscribe)==null||t.call(this)}render(){const t=this.locale==="zh-CN";return p`
      <section class="scene" id="extensions">
        <div class="inner">
          <div class="head"><div class="kicker">EXTEND & PROVE</div><h2>${t?"能力可以扩展，差异必须能解释":"Extend the capability. Prove the difference."}</h2><p>${t?"Pi 的价值不来自固定功能清单，而来自可编程扩展面与可验证运行时。左边是如何接能力，右边是为什么这些能力改变了 Agent 的工作方式。":"Pi's value is not a fixed feature checklist. It comes from a programmable extension surface and a verifiable runtime. The left shows how capability plugs in; the right shows why the runtime changes the way an agent works."}</p></div>
          <div class="layout">
            <div class="extension"><h3>${t?"按任务组合资源":"Compose resources per task"}</h3><p>${t?"扩展、Skill、工具、命令、GAPP 和 Provider 都是运行时资源；需要时加载，不需要时不把复杂度塞进核心。":"Extensions, skills, tools, commands, GAPPs, and providers are runtime resources. Load them when needed instead of baking every capability into the core."}</p><div class="resource-line"><span class="resource hot">ace-tool</span><span class="resource">ast-grep</span><span class="resource">codemap</span><span class="resource">diagnose</span><span class="resource">impeccable</span><span class="resource hot">GAPP</span><span class="resource">provider-trace</span><span class="resource">role-persona</span></div><pre><b>pi</b>.registerTool({
  name: <em>"project_map"</em>,
  execute: async (ctx) => {
    await ctx.ui.custom(...)
  }
})</pre></div>
            <div class="proof" id="comparison"><div class="proof-head"><div class="proof-cell">${t?"能力":"Capability"}</div><div class="proof-cell">Pi Runtime</div><div class="proof-cell">${t?"典型工具":"Typical tools"}</div></div>${(t?[["上下文生命周期","tag + checkout + compact","会话即上下文"],["代码定位","语义 + 精确 + AST","基础搜索"],["交互表面","TUI + Web + GAPP","单一聊天界面"],["长期记忆","角色记忆 + 检索 + viewer","临时提示词"],["可观测与分发","Provider Trace + Gateway/RPC","单一接口"]]:[["Context lifecycle","tag + checkout + compact","session-only context"],["Code location","semantic + exact + AST","basic search"],["Interaction surface","TUI + Web + GAPP","single chat surface"],["Durable memory","role memory + retrieval + viewer","temporary prompts"],["Observe & distribute","Provider Trace + Gateway/RPC","single interface"]]).map(s=>p`<div class="proof-row"><div class="proof-cell">${s[0]}</div><div class="proof-cell pi">${s[1]}</div><div class="proof-cell">${s[2]}</div></div>`)}<div class="proof-note">${t?"对比的是运行时边界，不是模型排行榜：同一个模型在不同上下文、记忆、UI、可观测与分发能力下，会形成完全不同的工程体验。":"This compares runtime boundaries, not model rankings. The same model behaves very differently when context, memory, UI, observability, and distribution capabilities change."}</div></div>
          </div>
        </div>
      </section>
    `}};Y.styles=v`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { max-width: 760px; margin-bottom: 3.5rem; }
    .kicker { color: #10b981; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.03; letter-spacing: -0.04em; font-weight: 600; }
    .head p { margin: 0; color: #71717a; font-size: 1rem; line-height: 1.75; max-width: 62ch; }
    .layout { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 1rem; align-items: stretch; }
    .extension { padding: 2rem; border: 1px solid #27272a; border-radius: 1rem; background: #111113; display: flex; flex-direction: column; }
    .extension h3 { margin: 0 0 0.75rem; color: #fafafa; font-size: 1.5rem; }
    .extension > p { margin: 0 0 1.5rem; color: #71717a; line-height: 1.65; }
    .resource-line { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem; }
    .resource { padding: 0.4rem 0.6rem; border-radius: 0.4rem; border: 1px solid #2f2f33; color: #a1a1aa; font: 0.67rem/1 'JetBrains Mono', monospace; }
    .resource.hot { color: #34d399; border-color: rgba(16,185,129,0.22); background: rgba(16,185,129,0.06); }
    pre { margin: auto 0 0; padding: 1.25rem; overflow-x: auto; border-radius: 0.75rem; background: #09090b; border: 1px solid #27272a; color: #a1a1aa; font: 0.72rem/1.7 'JetBrains Mono', monospace; }
    pre b { color: #c084fc; font-weight: 500; } pre em { color: #4ade80; font-style: normal; }
    .proof { border: 1px solid #27272a; border-radius: 1rem; overflow: hidden; background: #0c0c0e; }
    .proof-head, .proof-row { display: grid; grid-template-columns: 1.25fr 1fr 1fr; }
    .proof-head { background: #18181b; }
    .proof-cell { padding: 1rem 1.1rem; border-bottom: 1px solid #27272a; color: #71717a; font-size: 0.78rem; line-height: 1.5; }
    .proof-head .proof-cell { color: #a1a1aa; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
    .proof-cell.pi { color: #34d399; }
    .proof-row:last-child .proof-cell { border-bottom: 0; }
    .proof-note { padding: 1.25rem; border-top: 1px solid #27272a; color: #52525b; font-size: 0.72rem; line-height: 1.6; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .proof { overflow-x: auto; } .proof-head, .proof-row { min-width: 640px; } }
  `;Me([y()],Y.prototype,"locale",2);Y=Me([f("extend-and-prove-scene")],Y);var bt=Object.defineProperty,vt=Object.getOwnPropertyDescriptor,Ie=(t,e,s,a)=>{for(var r=a>1?void 0:a?vt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=(a?o(e,s,r):o(r))||r);return a&&r&&bt(e,s,r),r};let q=class extends g{constructor(){super(...arguments),this.locale=c.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=c.subscribe(()=>{this.locale=c.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return c.t(t)}render(){const t=c.t.bind(c);return p`
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
    `}};q.styles=v`
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
  `;Ie([y()],q.prototype,"locale",2);q=Ie([f("cta-section")],q);var yt=Object.getOwnPropertyDescriptor,xt=(t,e,s,a)=>{for(var r=a>1?void 0:a?yt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=o(r)||r);return r};let se=class extends g{render(){return p`
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
    `}};se.styles=v`
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
  `;se=xt([f("pi-footer")],se);var wt=Object.getOwnPropertyDescriptor,$t=(t,e,s,a)=>{for(var r=a>1?void 0:a?wt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=o(r)||r);return r};let re=class extends g{constructor(){super(...arguments),this.particles=[],this.PARTICLE_COUNT=30,this.CONNECTION_DISTANCE=150,this.MAX_CONNECTIONS=3,this.animate=()=>{!this.ctx||!this.canvas||(this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.particles.forEach((t,e)=>{t.x+=t.vx,t.y+=t.vy,(t.x<0||t.x>this.canvas.width)&&(t.vx*=-1),(t.y<0||t.y>this.canvas.height)&&(t.vy*=-1),this.ctx.beginPath(),this.ctx.arc(t.x,t.y,t.radius,0,Math.PI*2),this.ctx.fillStyle=`rgba(16, 185, 129, ${t.opacity})`,this.ctx.fill();let s=0;for(let a=e+1;a<this.particles.length&&!(s>=this.MAX_CONNECTIONS);a++){const r=this.particles[a],i=t.x-r.x,o=t.y-r.y,l=Math.sqrt(i*i+o*o);if(l<this.CONNECTION_DISTANCE){const n=(1-l/this.CONNECTION_DISTANCE)*.15;this.ctx.beginPath(),this.ctx.moveTo(t.x,t.y),this.ctx.lineTo(r.x,r.y),this.ctx.strokeStyle=`rgba(16, 185, 129, ${n})`,this.ctx.lineWidth=.5,this.ctx.stroke(),s++}}}),this.animationId=requestAnimationFrame(this.animate))}}firstUpdated(){this.canvas=this.renderRoot.querySelector("canvas"),this.canvas&&(this.ctx=this.canvas.getContext("2d")||void 0,this.ctx&&(this.setupCanvas(),this.initParticles(),this.animate(),this.resizeObserver=new ResizeObserver(()=>{this.setupCanvas()}),this.resizeObserver.observe(this.canvas)))}setupCanvas(){var e;if(!this.canvas)return;const t=(e=this.canvas.parentElement)==null?void 0:e.getBoundingClientRect();t&&(this.canvas.width=t.width,this.canvas.height=t.height)}initParticles(){if(this.canvas){this.particles=[];for(let t=0;t<this.PARTICLE_COUNT;t++)this.particles.push({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,radius:Math.random()*1.5+.5,opacity:Math.random()*.3+.1})}}disconnectedCallback(){var t;super.disconnectedCallback(),this.animationId&&cancelAnimationFrame(this.animationId),(t=this.resizeObserver)==null||t.disconnect()}render(){return p`<canvas></canvas>`}};re.styles=v`
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
  `;re=$t([f("canvas-background")],re);var kt=Object.getOwnPropertyDescriptor,_t=(t,e,s,a)=>{for(var r=a>1?void 0:a?kt(e,s):e,i=t.length-1,o;i>=0;i--)(o=t[i])&&(r=o(r)||r);return r};let we=class extends g{createRenderRoot(){return this}render(){return p`
      <canvas-background></canvas-background>
      <pi-navbar></pi-navbar>
      <main id="main-content" style="position: relative; z-index: 1;">
        <hero-section></hero-section>
        <bento-grid></bento-grid>
        <runtime-system-scene></runtime-system-scene>
        <companion-ecosystem-scene></companion-ecosystem-scene>
        <extend-and-prove-scene></extend-and-prove-scene>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `}};we=_t([f("pi-app")],we);Se(p`<pi-app></pi-app>`,document.getElementById("app"));
