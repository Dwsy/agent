(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function e(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=e(i);fetch(i.href,r)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const D=globalThis,F=D.ShadowRoot&&(D.ShadyCSS===void 0||D.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,K=Symbol(),Z=new WeakMap;let ut=class{constructor(t,e,s){if(this._$cssResult$=!0,s!==K)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const e=this.t;if(F&&t===void 0){const s=e!==void 0&&e.length===1;s&&(t=Z.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),s&&Z.set(e,t))}return t}toString(){return this.cssText}};const $t=n=>new ut(typeof n=="string"?n:n+"",void 0,K),wt=(n,...t)=>{const e=n.length===1?n[0]:t.reduce((s,i,r)=>s+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+n[r+1],n[0]);return new ut(e,n,K)},_t=(n,t)=>{if(F)n.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const e of t){const s=document.createElement("style"),i=D.litNonce;i!==void 0&&s.setAttribute("nonce",i),s.textContent=e.cssText,n.appendChild(s)}},X=F?n=>n:n=>n instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return $t(e)})(n):n;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:At,defineProperty:kt,getOwnPropertyDescriptor:Et,getOwnPropertyNames:St,getOwnPropertySymbols:Mt,getPrototypeOf:Ct}=Object,b=globalThis,Q=b.trustedTypes,Pt=Q?Q.emptyScript:"",B=b.reactiveElementPolyfillSupport,C=(n,t)=>n,j={toAttribute(n,t){switch(t){case Boolean:n=n?Pt:null;break;case Object:case Array:n=n==null?n:JSON.stringify(n)}return n},fromAttribute(n,t){let e=n;switch(t){case Boolean:e=n!==null;break;case Number:e=n===null?null:Number(n);break;case Object:case Array:try{e=JSON.parse(n)}catch{e=null}}return e}},Y=(n,t)=>!At(n,t),tt={attribute:!0,type:String,converter:j,reflect:!1,useDefault:!1,hasChanged:Y};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),b.litPropertyMetadata??(b.litPropertyMetadata=new WeakMap);let E=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??(this.l=[])).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=tt){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){const s=Symbol(),i=this.getPropertyDescriptor(t,s,e);i!==void 0&&kt(this.prototype,t,i)}}static getPropertyDescriptor(t,e,s){const{get:i,set:r}=Et(this.prototype,t)??{get(){return this[e]},set(a){this[e]=a}};return{get:i,set(a){const l=i==null?void 0:i.call(this);r==null||r.call(this,a),this.requestUpdate(t,l,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??tt}static _$Ei(){if(this.hasOwnProperty(C("elementProperties")))return;const t=Ct(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(C("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(C("properties"))){const e=this.properties,s=[...St(e),...Mt(e)];for(const i of s)this.createProperty(i,e[i])}const t=this[Symbol.metadata];if(t!==null){const e=litPropertyMetadata.get(t);if(e!==void 0)for(const[s,i]of e)this.elementProperties.set(s,i)}this._$Eh=new Map;for(const[e,s]of this.elementProperties){const i=this._$Eu(e,s);i!==void 0&&this._$Eh.set(i,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const s=new Set(t.flat(1/0).reverse());for(const i of s)e.unshift(X(i))}else t!==void 0&&e.push(X(t));return e}static _$Eu(t,e){const s=e.attribute;return s===!1?void 0:typeof s=="string"?s:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var t;this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),(t=this.constructor.l)==null||t.forEach(e=>e(this))}addController(t){var e;(this._$EO??(this._$EO=new Set)).add(t),this.renderRoot!==void 0&&this.isConnected&&((e=t.hostConnected)==null||e.call(t))}removeController(t){var e;(e=this._$EO)==null||e.delete(t)}_$E_(){const t=new Map,e=this.constructor.elementProperties;for(const s of e.keys())this.hasOwnProperty(s)&&(t.set(s,this[s]),delete this[s]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return _t(t,this.constructor.elementStyles),t}connectedCallback(){var t;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(t=this._$EO)==null||t.forEach(e=>{var s;return(s=e.hostConnected)==null?void 0:s.call(e)})}enableUpdating(t){}disconnectedCallback(){var t;(t=this._$EO)==null||t.forEach(e=>{var s;return(s=e.hostDisconnected)==null?void 0:s.call(e)})}attributeChangedCallback(t,e,s){this._$AK(t,s)}_$ET(t,e){var r;const s=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,s);if(i!==void 0&&s.reflect===!0){const a=(((r=s.converter)==null?void 0:r.toAttribute)!==void 0?s.converter:j).toAttribute(e,s.type);this._$Em=t,a==null?this.removeAttribute(i):this.setAttribute(i,a),this._$Em=null}}_$AK(t,e){var r,a;const s=this.constructor,i=s._$Eh.get(t);if(i!==void 0&&this._$Em!==i){const l=s.getPropertyOptions(i),o=typeof l.converter=="function"?{fromAttribute:l.converter}:((r=l.converter)==null?void 0:r.fromAttribute)!==void 0?l.converter:j;this._$Em=i;const d=o.fromAttribute(e,l.type);this[i]=d??((a=this._$Ej)==null?void 0:a.get(i))??d,this._$Em=null}}requestUpdate(t,e,s,i=!1,r){var a;if(t!==void 0){const l=this.constructor;if(i===!1&&(r=this[t]),s??(s=l.getPropertyOptions(t)),!((s.hasChanged??Y)(r,e)||s.useDefault&&s.reflect&&r===((a=this._$Ej)==null?void 0:a.get(t))&&!this.hasAttribute(l._$Eu(t,s))))return;this.C(t,e,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,e,{useDefault:s,reflect:i,wrapped:r},a){s&&!(this._$Ej??(this._$Ej=new Map)).has(t)&&(this._$Ej.set(t,a??e??this[t]),r!==!0||a!==void 0)||(this._$AL.has(t)||(this.hasUpdated||s||(e=void 0),this._$AL.set(t,e)),i===!0&&this._$Em!==t&&(this._$Eq??(this._$Eq=new Set)).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}const t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var s;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[r,a]of this._$Ep)this[r]=a;this._$Ep=void 0}const i=this.constructor.elementProperties;if(i.size>0)for(const[r,a]of i){const{wrapped:l}=a,o=this[r];l!==!0||this._$AL.has(r)||o===void 0||this.C(r,void 0,a,o)}}let t=!1;const e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),(s=this._$EO)==null||s.forEach(i=>{var r;return(r=i.hostUpdate)==null?void 0:r.call(i)}),this.update(e)):this._$EM()}catch(i){throw t=!1,this._$EM(),i}t&&this._$AE(e)}willUpdate(t){}_$AE(t){var e;(e=this._$EO)==null||e.forEach(s=>{var i;return(i=s.hostUpdated)==null?void 0:i.call(s)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(t){}firstUpdated(t){}};E.elementStyles=[],E.shadowRootOptions={mode:"open"},E[C("elementProperties")]=new Map,E[C("finalized")]=new Map,B==null||B({ReactiveElement:E}),(b.reactiveElementVersions??(b.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const P=globalThis,et=n=>n,R=P.trustedTypes,st=R?R.createPolicy("lit-html",{createHTML:n=>n}):void 0,ft="$lit$",x=`lit$${Math.random().toFixed(9).slice(2)}$`,mt="?"+x,Ot=`<${mt}>`,_=document,H=()=>_.createComment(""),U=n=>n===null||typeof n!="object"&&typeof n!="function",J=Array.isArray,Ht=n=>J(n)||typeof(n==null?void 0:n[Symbol.iterator])=="function",G=`[ 	
\f\r]`,M=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,it=/-->/g,nt=/>/g,y=RegExp(`>|${G}(?:([^\\s"'>=/]+)(${G}*=${G}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),rt=/'/g,at=/"/g,gt=/^(?:script|style|textarea|title)$/i,Ut=n=>(t,...e)=>({_$litType$:n,strings:t,values:e}),f=Ut(1),A=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),ot=new WeakMap,$=_.createTreeWalker(_,129);function vt(n,t){if(!J(n)||!n.hasOwnProperty("raw"))throw Error("invalid template strings array");return st!==void 0?st.createHTML(t):t}const Tt=(n,t)=>{const e=n.length-1,s=[];let i,r=t===2?"<svg>":t===3?"<math>":"",a=M;for(let l=0;l<e;l++){const o=n[l];let d,m,c=-1,g=0;for(;g<o.length&&(a.lastIndex=g,m=a.exec(o),m!==null);)g=a.lastIndex,a===M?m[1]==="!--"?a=it:m[1]!==void 0?a=nt:m[2]!==void 0?(gt.test(m[2])&&(i=RegExp("</"+m[2],"g")),a=y):m[3]!==void 0&&(a=y):a===y?m[0]===">"?(a=i??M,c=-1):m[1]===void 0?c=-2:(c=a.lastIndex-m[2].length,d=m[1],a=m[3]===void 0?y:m[3]==='"'?at:rt):a===at||a===rt?a=y:a===it||a===nt?a=M:(a=y,i=void 0);const v=a===y&&n[l+1].startsWith("/>")?" ":"";r+=a===M?o+Ot:c>=0?(s.push(d),o.slice(0,c)+ft+o.slice(c)+x+v):o+x+(c===-2?l:v)}return[vt(n,r+(n[e]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),s]};class T{constructor({strings:t,_$litType$:e},s){let i;this.parts=[];let r=0,a=0;const l=t.length-1,o=this.parts,[d,m]=Tt(t,e);if(this.el=T.createElement(d,s),$.currentNode=this.el.content,e===2||e===3){const c=this.el.content.firstChild;c.replaceWith(...c.childNodes)}for(;(i=$.nextNode())!==null&&o.length<l;){if(i.nodeType===1){if(i.hasAttributes())for(const c of i.getAttributeNames())if(c.endsWith(ft)){const g=m[a++],v=i.getAttribute(c).split(x),z=/([.?@])?(.*)/.exec(g);o.push({type:1,index:r,name:z[2],strings:v,ctor:z[1]==="."?zt:z[1]==="?"?Dt:z[1]==="@"?jt:L}),i.removeAttribute(c)}else c.startsWith(x)&&(o.push({type:6,index:r}),i.removeAttribute(c));if(gt.test(i.tagName)){const c=i.textContent.split(x),g=c.length-1;if(g>0){i.textContent=R?R.emptyScript:"";for(let v=0;v<g;v++)i.append(c[v],H()),$.nextNode(),o.push({type:2,index:++r});i.append(c[g],H())}}}else if(i.nodeType===8)if(i.data===mt)o.push({type:2,index:r});else{let c=-1;for(;(c=i.data.indexOf(x,c+1))!==-1;)o.push({type:7,index:r}),c+=x.length-1}r++}}static createElement(t,e){const s=_.createElement("template");return s.innerHTML=t,s}}function S(n,t,e=n,s){var a,l;if(t===A)return t;let i=s!==void 0?(a=e._$Co)==null?void 0:a[s]:e._$Cl;const r=U(t)?void 0:t._$litDirective$;return(i==null?void 0:i.constructor)!==r&&((l=i==null?void 0:i._$AO)==null||l.call(i,!1),r===void 0?i=void 0:(i=new r(n),i._$AT(n,e,s)),s!==void 0?(e._$Co??(e._$Co=[]))[s]=i:e._$Cl=i),i!==void 0&&(t=S(n,i._$AS(n,t.values),i,s)),t}class Nt{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:s}=this._$AD,i=((t==null?void 0:t.creationScope)??_).importNode(e,!0);$.currentNode=i;let r=$.nextNode(),a=0,l=0,o=s[0];for(;o!==void 0;){if(a===o.index){let d;o.type===2?d=new N(r,r.nextSibling,this,t):o.type===1?d=new o.ctor(r,o.name,o.strings,this,t):o.type===6&&(d=new Rt(r,this,t)),this._$AV.push(d),o=s[++l]}a!==(o==null?void 0:o.index)&&(r=$.nextNode(),a++)}return $.currentNode=_,i}p(t){let e=0;for(const s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(t,s,e),e+=s.strings.length-2):s._$AI(t[e])),e++}}class N{get _$AU(){var t;return((t=this._$AM)==null?void 0:t._$AU)??this._$Cv}constructor(t,e,s,i){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=s,this.options=i,this._$Cv=(i==null?void 0:i.isConnected)??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return e!==void 0&&(t==null?void 0:t.nodeType)===11&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=S(this,t,e),U(t)?t===p||t==null||t===""?(this._$AH!==p&&this._$AR(),this._$AH=p):t!==this._$AH&&t!==A&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):Ht(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==p&&U(this._$AH)?this._$AA.nextSibling.data=t:this.T(_.createTextNode(t)),this._$AH=t}$(t){var r;const{values:e,_$litType$:s}=t,i=typeof s=="number"?this._$AC(t):(s.el===void 0&&(s.el=T.createElement(vt(s.h,s.h[0]),this.options)),s);if(((r=this._$AH)==null?void 0:r._$AD)===i)this._$AH.p(e);else{const a=new Nt(i,this),l=a.u(this.options);a.p(e),this.T(l),this._$AH=a}}_$AC(t){let e=ot.get(t.strings);return e===void 0&&ot.set(t.strings,e=new T(t)),e}k(t){J(this._$AH)||(this._$AH=[],this._$AR());const e=this._$AH;let s,i=0;for(const r of t)i===e.length?e.push(s=new N(this.O(H()),this.O(H()),this,this.options)):s=e[i],s._$AI(r),i++;i<e.length&&(this._$AR(s&&s._$AB.nextSibling,i),e.length=i)}_$AR(t=this._$AA.nextSibling,e){var s;for((s=this._$AP)==null?void 0:s.call(this,!1,!0,e);t!==this._$AB;){const i=et(t).nextSibling;et(t).remove(),t=i}}setConnected(t){var e;this._$AM===void 0&&(this._$Cv=t,(e=this._$AP)==null||e.call(this,t))}}class L{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,s,i,r){this.type=1,this._$AH=p,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=r,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=p}_$AI(t,e=this,s,i){const r=this.strings;let a=!1;if(r===void 0)t=S(this,t,e,0),a=!U(t)||t!==this._$AH&&t!==A,a&&(this._$AH=t);else{const l=t;let o,d;for(t=r[0],o=0;o<r.length-1;o++)d=S(this,l[s+o],e,o),d===A&&(d=this._$AH[o]),a||(a=!U(d)||d!==this._$AH[o]),d===p?t=p:t!==p&&(t+=(d??"")+r[o+1]),this._$AH[o]=d}a&&!i&&this.j(t)}j(t){t===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}}class zt extends L{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===p?void 0:t}}class Dt extends L{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==p)}}class jt extends L{constructor(t,e,s,i,r){super(t,e,s,i,r),this.type=5}_$AI(t,e=this){if((t=S(this,t,e,0)??p)===A)return;const s=this._$AH,i=t===p&&s!==p||t.capture!==s.capture||t.once!==s.once||t.passive!==s.passive,r=t!==p&&(s===p||i);i&&this.element.removeEventListener(this.name,this,s),r&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){var e;typeof this._$AH=="function"?this._$AH.call(((e=this.options)==null?void 0:e.host)??this.element,t):this._$AH.handleEvent(t)}}class Rt{constructor(t,e,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(t){S(this,t)}}const V=P.litHtmlPolyfillSupport;V==null||V(T,N),(P.litHtmlVersions??(P.litHtmlVersions=[])).push("3.3.2");const xt=(n,t,e)=>{const s=(e==null?void 0:e.renderBefore)??t;let i=s._$litPart$;if(i===void 0){const r=(e==null?void 0:e.renderBefore)??null;s._$litPart$=i=new N(t.insertBefore(H(),r),r,void 0,e??{})}return i._$AI(n),i};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const w=globalThis;let O=class extends E{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;const t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=xt(e,this.renderRoot,this.renderOptions)}connectedCallback(){var t;super.connectedCallback(),(t=this._$Do)==null||t.setConnected(!0)}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._$Do)==null||t.setConnected(!1)}render(){return A}};var ht;O._$litElement$=!0,O.finalized=!0,(ht=w.litElementHydrateSupport)==null||ht.call(w,{LitElement:O});const W=w.litElementPolyfillSupport;W==null||W({LitElement:O});(w.litElementVersions??(w.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const It=n=>(t,e)=>{e!==void 0?e.addInitializer(()=>{customElements.define(n,t)}):customElements.define(n,t)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Lt={attribute:!0,type:String,converter:j,reflect:!1,hasChanged:Y},Bt=(n=Lt,t,e)=>{const{kind:s,metadata:i}=e;let r=globalThis.litPropertyMetadata.get(i);if(r===void 0&&globalThis.litPropertyMetadata.set(i,r=new Map),s==="setter"&&((n=Object.create(n)).wrapped=!0),r.set(e.name,n),s==="accessor"){const{name:a}=e;return{set(l){const o=t.get.call(this);t.set.call(this,l),this.requestUpdate(a,o,n,!0,l)},init(l){return l!==void 0&&this.C(a,void 0,n,l),l}}}if(s==="setter"){const{name:a}=e;return function(l){const o=this[a];t.call(this,l),this.requestUpdate(a,o,n,!0,l)}}throw Error("Unsupported decorator location: "+s)};function Gt(n){return(t,e)=>typeof e=="object"?Bt(n,t,e):((s,i,r)=>{const a=i.hasOwnProperty(r);return i.constructor.createProperty(r,s),a?Object.getOwnPropertyDescriptor(i,r):void 0})(n,t,e)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function Vt(n){return Gt({...n,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Wt={CHILD:2},qt=n=>(...t)=>({_$litDirective$:n,values:t});class Ft{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,s){this._$Ct=t,this._$AM=e,this._$Ci=s}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class q extends Ft{constructor(t){if(super(t),this.it=p,t.type!==Wt.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(t){if(t===p||t==null)return this._t=void 0,this.it=t;if(t===A)return t;if(typeof t!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(t===this.it)return this._t;this.it=t;const e=[t];return e.raw=e,this._t={_$litType$:this.constructor.resultType,strings:e,values:[]}}}q.directiveName="unsafeHTML",q.resultType=1;const Kt=qt(q);/**
 * @license lucide v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Yt={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const bt=([n,t,e])=>{const s=document.createElementNS("http://www.w3.org/2000/svg",n);return Object.keys(t).forEach(i=>{s.setAttribute(i,String(t[i]))}),e!=null&&e.length&&e.forEach(i=>{const r=bt(i);s.appendChild(r)}),s},Jt=(n,t={})=>{const s={...Yt,...t};return bt(["svg",s,n])},Zt={xs:"w-3 h-3",sm:"w-4 h-4",md:"w-5 h-5",lg:"w-6 h-6",xl:"w-8 h-8"};function h(n,t="md",e){return f`${Kt(Xt(n,t).outerHTML)}`}function Xt(n,t="md",e){return Jt(n,{class:Zt[t]+""})}/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qt=["svg",u,[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=["svg",u,[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=["svg",u,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"m9 12 2 2 4-4"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=["svg",u,[["path",{d:"m18 16 4-4-4-4"}],["path",{d:"m6 8-4 4 4 4"}],["path",{d:"m14.5 4-5 16"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const lt=["svg",u,[["rect",{width:"16",height:"16",x:"4",y:"4",rx:"2"}],["rect",{width:"6",height:"6",x:"9",y:"9",rx:"1"}],["path",{d:"M15 2v2"}],["path",{d:"M15 20v2"}],["path",{d:"M2 15h2"}],["path",{d:"M2 9h2"}],["path",{d:"M20 15h2"}],["path",{d:"M20 9h2"}],["path",{d:"M9 2v2"}],["path",{d:"M9 20v2"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=["svg",u,[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{d:"M3 12A9 3 0 0 0 21 12"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=["svg",u,[["path",{d:"M15 3h6v6"}],["path",{d:"M10 14 21 3"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=["svg",u,[["line",{x1:"6",x2:"6",y1:"3",y2:"15"}],["circle",{cx:"18",cy:"6",r:"3"}],["circle",{cx:"6",cy:"18",r:"3"}],["path",{d:"M18 9a9 9 0 0 1-9 9"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ct=["svg",u,[["path",{d:"M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"}],["path",{d:"M9 18c-4.51 2-5-2-7-2"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=["svg",u,[["circle",{cx:"12",cy:"12",r:"10"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{d:"M2 12h20"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=["svg",u,[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=["svg",u,[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=["svg",u,[["path",{d:"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"}],["path",{d:"m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"}],["path",{d:"M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"}],["path",{d:"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dt=["svg",u,[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=["svg",u,[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=["svg",u,[["polyline",{points:"4 17 10 11 4 5"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=["svg",u,[["rect",{width:"8",height:"8",x:"3",y:"3",rx:"2"}],["path",{d:"M7 11v4a2 2 0 0 0 2 2h4"}],["rect",{width:"8",height:"8",x:"13",y:"13",rx:"2"}]]];/**
 * @license lucide v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=["svg",u,[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]]];var ue=Object.defineProperty,fe=Object.getOwnPropertyDescriptor,yt=(n,t,e,s)=>{for(var i=s>1?void 0:s?fe(t,e):t,r=n.length-1,a;r>=0;r--)(a=n[r])&&(i=(s?a(t,e,i):a(i))||i);return s&&i&&ue(t,e,i),i};let I=class extends O{constructor(){super(...arguments),this.mobileMenuOpen=!1}render(){return f`
      <div class="content-wrapper min-h-screen">
        ${this.renderNavbar()}
        ${this.renderHero()}
        ${this.renderStats()}
        ${this.renderFeatures()}
        ${this.renderWorkflow()}
        ${this.renderSkills()}
        ${this.renderCodeExample()}
        ${this.renderCTA()}
        ${this.renderFooter()}
      </div>
    `}renderNavbar(){return f`
      <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-custom border-b border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#7000ff] flex items-center justify-center">
                <span class="text-[#0a0a0f] font-bold text-xl">π</span>
              </div>
              <span class="text-white font-bold text-xl">Pi Agent</span>
            </div>

            <div class="hidden md:flex items-center gap-8">
              <a href="#features" class="text-gray-300 hover:text-[#00f0ff] transition-colors">特性</a>
              <a href="#workflow" class="text-gray-300 hover:text-[#00f0ff] transition-colors">工作流</a>
              <a href="#skills" class="text-gray-300 hover:text-[#00f0ff] transition-colors">技能</a>
              <a href="https://github.com/Dwsy/agent" target="_blank" class="text-gray-300 hover:text-[#00f0ff] transition-colors flex items-center gap-2">
                ${h(ct,{})}
                <span>GitHub</span>
              </a>
            </div>

            <div class="flex items-center gap-4">
              <button
                class="btn-primary hidden md:flex"
                @click="${()=>window.open("https://github.com/Dwsy/agent","_blank")}"
              >
                开始使用
                ${h(Qt,{})}
              </button>
            </div>
          </div>
        </div>
      </nav>
    `}renderHero(){return f`
      <section class="pt-32 pb-20 px-6 relative overflow-hidden">
        <div class="max-w-7xl mx-auto">
          <div class="grid lg:grid-cols-2 gap-12 items-center">
            <div class="animate-fade-in-up">
              <div class="inline-flex items-center gap-2 bg-[#00f0ff]/10 border border-[#00f0ff]/20 rounded-full px-4 py-2 mb-6">
                ${h(he,{})}
                <span class="text-[#00f0ff] text-sm font-medium">企业级 AI 编排系统</span>
              </div>

              <h1 class="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                <span class="block">下一代</span>
                <span class="block text-gradient">AI 智能体</span>
                <span class="block">编排引擎</span>
              </h1>

              <p class="text-xl text-gray-400 mb-8 leading-relaxed max-w-xl">
                通过结构化技能系统和多模型协作，实现代码生成、分析和编排的自动化工作流。
                <span class="text-[#00f0ff]">精简、高效、企业级</span>。
              </p>

              <div class="flex flex-wrap gap-4 mb-12">
                <button
                  class="btn-primary"
                  @click="${()=>window.open("https://github.com/Dwsy/agent","_blank")}"
                >
                  ${h(le,{})}
                  立即开始
                </button>
                <button
                  class="btn-secondary"
                  @click="${()=>window.open("https://github.com/Dwsy/agent/blob/main/README.zh-CN.md","_blank")}"
                >
                  ${h(pt,{})}
                  查看文档
                </button>
              </div>

              <div class="flex items-center gap-8 text-sm text-gray-500">
                <div class="flex items-center gap-2">
                  ${h(k,{})}
                  <span>开源免费</span>
                </div>
                <div class="flex items-center gap-2">
                  ${h(k,{})}
                  <span>类型安全</span>
                </div>
                <div class="flex items-center gap-2">
                  ${h(k,{})}
                  <span>生产就绪</span>
                </div>
              </div>
            </div>

            <div class="animate-scale-in delay-200">
              <div class="terminal-window">
                <div class="terminal-header">
                  <div class="terminal-dot bg-red-500"></div>
                  <div class="terminal-dot bg-yellow-500"></div>
                  <div class="terminal-dot bg-green-500"></div>
                  <span class="ml-4 text-gray-500 text-sm">pi-agent — zsh</span>
                </div>
                <div class="terminal-body">
                  <div class="terminal-line" style="animation-delay: 0.1s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-white"> pi init my-project</span>
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.2s">
                    ✓ Initializing Pi Agent workspace...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.3s">
                    ✓ Creating documentation structure...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.4s">
                    ✓ Setting up skill system...
                  </div>
                  <div class="terminal-line terminal-success" style="animation-delay: 0.5s">
                    ✓ Project initialized successfully!
                  </div>
                  <div class="terminal-line" style="animation-delay: 0.6s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-white"> pi /scout authentication flow</span>
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.7s">
                    → Scanning codebase...
                  </div>
                  <div class="terminal-line terminal-output" style="animation-delay: 0.8s">
                    → Found 12 authentication-related files
                  </div>
                  <div class="terminal-line terminal-success" style="animation-delay: 0.9s">
                    ✓ Analysis complete. See report for details.
                  </div>
                  <div class="terminal-line" style="animation-delay: 1s">
                    <span class="terminal-prompt">➜</span>
                    <span class="terminal-command"> ~</span>
                    <span class="text-gray-500 animate-pulse">█</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}renderStats(){return f`
      <section class="py-16 border-t border-b border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto px-6">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
            ${[{value:"14+",label:"内置技能"},{value:"5",label:"阶段工作流"},{value:"3",label:"协作模型"},{value:"100%",label:"类型安全"}].map((t,e)=>f`
              <div class="text-center animate-fade-in-up" style="animation-delay: ${e*.1}s">
                <div class="stat-number text-5xl font-bold mb-2">${t.value}</div>
                <div class="text-gray-400 text-lg">${t.label}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}renderFeatures(){return f`
      <section id="features" class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              核心特性
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              企业级设计原则，专业开发流程
            </p>
          </div>

          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${[{icon:dt,title:"沙箱安全",description:"外部模型无法直接写入，所有修改需人工审查，强制执行 Phase 5 审计流程"},{icon:ae,title:"SSOT 原则",description:"单数据源架构，通过 workhub 管理文档，每个知识域只有一份权威文档"},{icon:ne,title:"多模型协作",description:"Codex 算法实现、Gemini UI 设计、ace-tool 语义搜索，各司其职"},{icon:lt,title:"模块化技能",description:"14+ 独立技能，清晰接口，可测试验证，按需组合"},{icon:oe,title:"代码主权",description:"AI 生成代码仅作参考，必须重构为精简高效的企业级代码"},{icon:pe,title:"结构化工作流",description:"从上下文检索到审计交付，5 阶段标准化流程确保质量"}].map((t,e)=>f`
              <div
                class="feature-card animate-fade-in-up"
                style="animation-delay: ${e*.1}s"
              >
                <div class="w-12 h-12 rounded-lg bg-[#00f0ff]/10 flex items-center justify-center mb-4">
                  ${h(t.icon,{})}
                </div>
                <h3 class="text-xl font-bold text-white mb-3">${t.title}</h3>
                <p class="text-gray-400 leading-relaxed">${t.description}</p>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}renderWorkflow(){return f`
      <section id="workflow" class="py-24 px-6 relative">
        <div class="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f] to-transparent pointer-events-none"></div>

        <div class="max-w-7xl mx-auto relative z-10">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              5 阶段工作流
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              结构化流程，确保每一步都精准高效
            </p>
          </div>

          <div class="grid md:grid-cols-5 gap-4">
            ${[{number:"01",title:"上下文检索",description:"ace-tool 语义搜索 / ast-grep 语法感知，递归获取完整定义",icon:se},{number:"02",title:"分析规划",description:"Gemini 多模型协作，交叉验证，输出 Step-by-step 计划",icon:lt},{number:"03",title:"原型获取",description:"前端/UI → Gemini，后端/逻辑 → Gemini，仅提供 Diff Patch",icon:ee},{number:"04",title:"编码实施",description:"逻辑重构，去除冗余，精简高效，最小作用域",icon:de},{number:"05",title:"审计交付",description:"Codex 自动代码审查，审计通过后交付用户",icon:dt}].map((t,e)=>f`
              <div class="workflow-step animate-fade-in-up" style="animation-delay: ${e*.15}s">
                <div class="feature-card text-center h-full">
                  <div class="text-[#00f0ff]/30 text-5xl font-bold mb-4">${t.number}</div>
                  <div class="w-12 h-12 rounded-lg bg-[#7000ff]/20 flex items-center justify-center mx-auto mb-4">
                    ${h(t.icon,{})}
                  </div>
                  <h3 class="text-lg font-bold text-white mb-2">${t.title}</h3>
                  <p class="text-sm text-gray-400">${t.description}</p>
                </div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}renderSkills(){return f`
      <section id="skills" class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-16">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
              技能系统
            </h2>
            <p class="text-xl text-gray-400 max-w-2xl mx-auto">
              14+ 专业化技能，覆盖开发全流程
            </p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            ${[{name:"workhub",desc:"文档管理与任务跟踪"},{name:"ace-tool",desc:"语义化代码搜索"},{name:"ast-grep",desc:"语法感知代码重写"},{name:"codemap",desc:"代码流程可视化"},{name:"context7",desc:"GitHub Issues/PRs 搜索"},{name:"deepwiki",desc:"GitHub 仓库文档获取"},{name:"exa",desc:"高质量互联网搜索"},{name:"tmux",desc:"终端会话管理"},{name:"project-planner",desc:"项目规划与文档生成"},{name:"system-design",desc:"系统架构设计"},{name:"web-browser",desc:"Chrome DevTools 协议"},{name:"zai-vision",desc:"MCP 视觉服务器"}].map((t,e)=>f`
              <div
                class="skill-item animate-fade-in-up"
                style="animation-delay: ${e*.05}s"
              >
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-8 h-8 rounded bg-[#00f0ff]/10 flex items-center justify-center">
                    ${h(te,{})}
                  </div>
                  <span class="text-white font-mono text-sm">${t.name}</span>
                </div>
                <p class="text-gray-500 text-xs">${t.desc}</p>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}renderCodeExample(){return f`
      <section class="py-24 px-6">
        <div class="max-w-7xl mx-auto">
          <div class="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
                简洁高效
              </h2>
              <p class="text-xl text-gray-400 mb-8 leading-relaxed">
                从 22KB 优化到 8.8KB，减少 59% 代码量。
                <span class="text-[#00f0ff]">自解释代码，最小注释，零冗余</span>。
              </p>

              <div class="space-y-4">
                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${h(k,{})}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">Token 优化</h4>
                    <p class="text-gray-400 text-sm">15,000 → 8,814 字符，节省 41%</p>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${h(k,{})}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">引用优先</h4>
                    <p class="text-gray-400 text-sm">详细内容在技能文档，避免重复</p>
                  </div>
                </div>

                <div class="flex items-start gap-4">
                  <div class="w-8 h-8 rounded-full bg-[#00f0ff]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    ${h(k,{})}
                  </div>
                  <div>
                    <h4 class="text-white font-semibold mb-1">文件系统即记忆</h4>
                    <p class="text-gray-400 text-sm">大内容存储文件，上下文仅保留路径</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="code-block">
              <pre><code><span class="code-comment">// Before: 500+ lines, 22KB</span>
<span class="code-keyword">const</span> <span class="code-function">executeWorkflow</span> = (<span class="code-keyword">async</span> () => {
  <span class="code-comment">// ... lots of redundant code</span>
  <span class="code-keyword">if</span> (condition) {
    <span class="code-comment">// ... 50 lines</span>
  }
  <span class="code-comment">// ... 400 more lines</span>
});

<span class="code-comment">// After: 214 lines, 8.8KB</span>
<span class="code-keyword">const</span> <span class="code-function">executeWorkflow</span> = <span class="code-keyword">async</span> (phase, input) => {
  <span class="code-keyword">const</span> tools = { aceTool, astGrep };
  <span class="code-keyword">const</span> models = { codex, gemini };
  <span class="code-keyword">return</span> tools[phase]?.(input) ?? models[phase]?.(input);
};</code></pre>
            </div>
          </div>
        </div>
      </section>
    `}renderCTA(){return f`
      <section class="py-24 px-6">
        <div class="max-w-4xl mx-auto">
          <div class="feature-card text-center glow">
            <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
              准备好开始了吗？
            </h2>
            <p class="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              加入下一代 AI 开发工作流，提升生产力，确保代码质量。
            </p>

            <div class="flex flex-wrap justify-center gap-4">
              <button
                class="btn-primary text-lg px-8 py-4"
                @click="${()=>window.open("https://github.com/Dwsy/agent","_blank")}"
              >
                ${h(ct,{})}
                在 GitHub 上查看
              </button>
              <button
                class="btn-secondary text-lg px-8 py-4"
                @click="${()=>window.open("https://github.com/Dwsy/agent/blob/main/README.zh-CN.md","_blank")}"
              >
                ${h(pt,{})}
                阅读文档
              </button>
            </div>

            <div class="mt-12 flex items-center justify-center gap-8 text-sm text-gray-500">
              <div class="flex items-center gap-2">
                ${h(ce,{})}
                <span>Star on GitHub</span>
              </div>
              <div class="flex items-center gap-2">
                ${h(re,{})}
                <span>MIT License</span>
              </div>
              <div class="flex items-center gap-2">
                ${h(ie,{})}
                <span>Production Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `}renderFooter(){return f`
      <footer class="py-12 px-6 border-t border-[#00f0ff]/10">
        <div class="max-w-7xl mx-auto">
          <div class="flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#7000ff] flex items-center justify-center">
                <span class="text-[#0a0a0f] font-bold">π</span>
              </div>
              <span class="text-white font-semibold">Pi Agent</span>
            </div>

            <div class="flex items-center gap-6 text-sm text-gray-400">
              <a href="https://github.com/Dwsy/agent" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                GitHub
              </a>
              <a href="https://github.com/Dwsy/agent/blob/main/README.zh-CN.md" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                文档
              </a>
              <a href="https://github.com/Dwsy/agent/issues" target="_blank" class="hover:text-[#00f0ff] transition-colors">
                Issues
              </a>
            </div>

            <div class="text-sm text-gray-500">
              © 2026 Pi Agent. MIT License.
            </div>
          </div>
        </div>
      </footer>
    `}};I.styles=wt`
    :host {
      display: block;
    }

    .content-wrapper {
      position: relative;
      z-index: 1;
    }

    /* Smooth scroll */
    html {
      scroll-behavior: smooth;
    }

    /* Custom animations */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .animate-fade-in-up {
      animation: fadeInUp 0.8s ease-out forwards;
    }

    .animate-scale-in {
      animation: scaleIn 0.6s ease-out forwards;
    }

    .delay-100 { animation-delay: 0.1s; }
    .delay-200 { animation-delay: 0.2s; }
    .delay-300 { animation-delay: 0.3s; }
    .delay-400 { animation-delay: 0.4s; }
    .delay-500 { animation-delay: 0.5s; }

    /* Terminal styling */
    .terminal-window {
      background: linear-gradient(180deg, #0d0d12 0%, #0a0a0f 100%);
      border: 1px solid rgba(0, 240, 255, 0.2);
      border-radius: 12px;
      overflow: hidden;
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.5),
        0 0 60px rgba(0, 240, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .terminal-header {
      background: rgba(0, 240, 255, 0.05);
      border-bottom: 1px solid rgba(0, 240, 255, 0.1);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .terminal-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .terminal-body {
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.8;
    }

    .terminal-line {
      opacity: 0;
      animation: fadeInUp 0.5s ease-out forwards;
    }

    .terminal-prompt {
      color: #00f0ff;
    }

    .terminal-command {
      color: #7000ff;
    }

    .terminal-output {
      color: rgba(255, 255, 255, 0.7);
      margin-left: 16px;
    }

    .terminal-success {
      color: #22c55e;
    }

    .terminal-warning {
      color: #f59e0b;
    }

    /* Feature cards */
    .feature-card {
      background: rgba(10, 10, 15, 0.6);
      border: 1px solid rgba(0, 240, 255, 0.15);
      border-radius: 16px;
      padding: 32px;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(20px);
    }

    .feature-card:hover {
      border-color: rgba(0, 240, 255, 0.4);
      transform: translateY(-8px);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        0 0 80px rgba(0, 240, 255, 0.1);
    }

    /* Workflow steps */
    .workflow-step {
      position: relative;
    }

    .workflow-step::after {
      content: '';
      position: absolute;
      top: 50%;
      right: -32px;
      width: 32px;
      height: 2px;
      background: linear-gradient(90deg, rgba(0, 240, 255, 0.5), rgba(112, 0, 255, 0.5));
    }

    .workflow-step:last-child::after {
      display: none;
    }

    /* Skill grid */
    .skill-item {
      background: rgba(10, 10, 15, 0.4);
      border: 1px solid rgba(0, 240, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      transition: all 0.3s ease;
    }

    .skill-item:hover {
      border-color: rgba(0, 240, 255, 0.3);
      background: rgba(10, 10, 15, 0.8);
    }

    /* Stats */
    .stat-number {
      background: linear-gradient(135deg, #00f0ff 0%, #7000ff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Button styles */
    .btn-primary {
      background: linear-gradient(135deg, #00f0ff 0%, #7000ff 100%);
      color: #0a0a0f;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 12px;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0, 240, 255, 0.3);
    }

    .btn-secondary {
      background: rgba(0, 240, 255, 0.1);
      color: #00f0ff;
      font-weight: 500;
      padding: 14px 32px;
      border-radius: 12px;
      transition: all 0.3s ease;
      border: 1px solid rgba(0, 240, 255, 0.3);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
    }

    .btn-secondary:hover {
      background: rgba(0, 240, 255, 0.2);
      border-color: rgba(0, 240, 255, 0.5);
      transform: translateY(-2px);
    }

    /* Section divider */
    .section-divider {
      height: 1px;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(0, 240, 255, 0.3) 20%,
        rgba(112, 0, 255, 0.3) 50%,
        rgba(0, 240, 255, 0.3) 80%,
        transparent 100%
      );
    }

    /* Code block */
    .code-block {
      background: #0d0d12;
      border: 1px solid rgba(0, 240, 255, 0.15);
      border-radius: 8px;
      padding: 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      line-height: 1.6;
      overflow-x: auto;
    }

    .code-keyword { color: #ff79c6; }
    .code-string { color: #f1fa8c; }
    .code-comment { color: #6272a4; }
    .code-function { color: #8be9fd; }
    .code-number { color: #bd93f9; }
  `;yt([Vt()],I.prototype,"mobileMenuOpen",2);I=yt([It("pi-app")],I);const pt={name:"book-open",render:()=>f`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  `};xt(f`<pi-app></pi-app>`,document.getElementById("app"));
