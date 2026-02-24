(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))i(a);new MutationObserver(a=>{for(const r of a)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&i(o)}).observe(document,{childList:!0,subtree:!0});function s(a){const r={};return a.integrity&&(r.integrity=a.integrity),a.referrerPolicy&&(r.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?r.credentials="include":a.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(a){if(a.ep)return;a.ep=!0;const r=s(a);fetch(a.href,r)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const B=globalThis,ce=B.ShadowRoot&&(B.ShadyCSS===void 0||B.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,de=Symbol(),ue=new WeakMap;let Me=class{constructor(e,s,i){if(this._$cssResult$=!0,i!==de)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=s}get styleSheet(){let e=this.o;const s=this.t;if(ce&&e===void 0){const i=s!==void 0&&s.length===1;i&&(e=ue.get(s)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&ue.set(s,e))}return e}toString(){return this.cssText}};const We=t=>new Me(typeof t=="string"?t:t+"",void 0,de),b=(t,...e)=>{const s=t.length===1?t[0]:e.reduce((i,a,r)=>i+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(a)+t[r+1],t[0]);return new Me(s,t,de)},Ye=(t,e)=>{if(ce)t.adoptedStyleSheets=e.map(s=>s instanceof CSSStyleSheet?s:s.styleSheet);else for(const s of e){const i=document.createElement("style"),a=B.litNonce;a!==void 0&&i.setAttribute("nonce",a),i.textContent=s.cssText,t.appendChild(i)}},ge=ce?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let s="";for(const i of e.cssRules)s+=i.cssText;return We(s)})(t):t;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Fe,defineProperty:Ve,getOwnPropertyDescriptor:Je,getOwnPropertyNames:qe,getOwnPropertySymbols:Xe,getPrototypeOf:Ze}=Object,$=globalThis,fe=$.trustedTypes,Ke=fe?fe.emptyScript:"",ee=$.reactiveElementPolyfillSupport,L=(t,e)=>t,j={toAttribute(t,e){switch(e){case Boolean:t=t?Ke:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let s=t;switch(e){case Boolean:s=t!==null;break;case Number:s=t===null?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t)}catch{s=null}}return s}},pe=(t,e)=>!Fe(t,e),be={attribute:!0,type:String,converter:j,reflect:!1,useDefault:!1,hasChanged:pe};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),$.litPropertyMetadata??($.litPropertyMetadata=new WeakMap);let S=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,s=be){if(s.state&&(s.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((s=Object.create(s)).wrapped=!0),this.elementProperties.set(e,s),!s.noAccessor){const i=Symbol(),a=this.getPropertyDescriptor(e,i,s);a!==void 0&&Ve(this.prototype,e,a)}}static getPropertyDescriptor(e,s,i){const{get:a,set:r}=Je(this.prototype,e)??{get(){return this[s]},set(o){this[s]=o}};return{get:a,set(o){const c=a==null?void 0:a.call(this);r==null||r.call(this,o),this.requestUpdate(e,c,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??be}static _$Ei(){if(this.hasOwnProperty(L("elementProperties")))return;const e=Ze(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(L("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(L("properties"))){const s=this.properties,i=[...qe(s),...Xe(s)];for(const a of i)this.createProperty(a,s[a])}const e=this[Symbol.metadata];if(e!==null){const s=litPropertyMetadata.get(e);if(s!==void 0)for(const[i,a]of s)this.elementProperties.set(i,a)}this._$Eh=new Map;for(const[s,i]of this.elementProperties){const a=this._$Eu(s,i);a!==void 0&&this._$Eh.set(a,s)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const s=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const a of i)s.unshift(ge(a))}else e!==void 0&&s.push(ge(e));return s}static _$Eu(e,s){const i=s.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(s=>this.enableUpdating=s),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(s=>s(this))}addController(e){var s;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((s=e.hostConnected)==null||s.call(e))}removeController(e){var s;(s=this._$EO)==null||s.delete(e)}_$E_(){const e=new Map,s=this.constructor.elementProperties;for(const i of s.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Ye(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(s=>{var i;return(i=s.hostConnected)==null?void 0:i.call(s)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(s=>{var i;return(i=s.hostDisconnected)==null?void 0:i.call(s)})}attributeChangedCallback(e,s,i){this._$AK(e,i)}_$ET(e,s){var r;const i=this.constructor.elementProperties.get(e),a=this.constructor._$Eu(e,i);if(a!==void 0&&i.reflect===!0){const o=(((r=i.converter)==null?void 0:r.toAttribute)!==void 0?i.converter:j).toAttribute(s,i.type);this._$Em=e,o==null?this.removeAttribute(a):this.setAttribute(a,o),this._$Em=null}}_$AK(e,s){var r,o;const i=this.constructor,a=i._$Eh.get(e);if(a!==void 0&&this._$Em!==a){const c=i.getPropertyOptions(a),l=typeof c.converter=="function"?{fromAttribute:c.converter}:((r=c.converter)==null?void 0:r.fromAttribute)!==void 0?c.converter:j;this._$Em=a;const h=l.fromAttribute(s,c.type);this[a]=h??((o=this._$Ej)==null?void 0:o.get(a))??h,this._$Em=null}}requestUpdate(e,s,i,a=!1,r){var o;if(e!==void 0){const c=this.constructor;if(a===!1&&(r=this[e]),i??(i=c.getPropertyOptions(e)),!((i.hasChanged??pe)(r,s)||i.useDefault&&i.reflect&&r===((o=this._$Ej)==null?void 0:o.get(e))&&!this.hasAttribute(c._$Eu(e,i))))return;this.C(e,s,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,s,{useDefault:i,reflect:a,wrapped:r},o){i&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,o??s??this[e]),r!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(s=void 0),this._$AL.set(e,s)),a===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(s){Promise.reject(s)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var i;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}const a=this.constructor.elementProperties;if(a.size>0)for(const[r,o]of a){const{wrapped:c}=o,l=this[r];c!==!0||this._$AL.has(r)||l===void 0||this.C(r,void 0,o,l)}}let e=!1;const s=this._$AL;try{e=this.shouldUpdate(s),e?(this.willUpdate(s),(i=this._$EO)==null||i.forEach(a=>{var r;return(r=a.hostUpdate)==null?void 0:r.call(a)}),this.update(s)):this._$EM()}catch(a){throw e=!1,this._$EM(),a}e&&this._$AE(s)}willUpdate(e){}_$AE(e){var s;(s=this._$EO)==null||s.forEach(i=>{var a;return(a=i.hostUpdated)==null?void 0:a.call(i)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(s=>this._$ET(s,this[s]))),this._$EM()}updated(e){}firstUpdated(e){}};S.elementStyles=[],S.shadowRootOptions={mode:"open"},S[L("elementProperties")]=new Map,S[L("finalized")]=new Map,ee==null||ee({ReactiveElement:S}),($.reactiveElementVersions??($.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const E=globalThis,ve=t=>t,H=E.trustedTypes,ye=H?H.createPolicy("lit-html",{createHTML:t=>t}):void 0,ze="$lit$",w=`lit$${Math.random().toFixed(9).slice(2)}$`,Oe="?"+w,Qe=`<${Oe}>`,A=document,N=()=>A.createComment(""),T=t=>t===null||typeof t!="object"&&typeof t!="function",he=Array.isArray,et=t=>he(t)||typeof(t==null?void 0:t[Symbol.iterator])=="function",te=`[ 	
\f\r]`,O=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,xe=/-->/g,we=/>/g,_=RegExp(`>|${te}(?:([^\\s"'>=/]+)(${te}*=${te}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),$e=/'/g,_e=/"/g,Le=/^(?:script|style|textarea|title)$/i,tt=t=>(e,...s)=>({_$litType$:t,strings:e,values:s}),d=tt(1),P=Symbol.for("lit-noChange"),u=Symbol.for("lit-nothing"),ke=new WeakMap,k=A.createTreeWalker(A,129);function Ee(t,e){if(!he(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return ye!==void 0?ye.createHTML(e):e}const st=(t,e)=>{const s=t.length-1,i=[];let a,r=e===2?"<svg>":e===3?"<math>":"",o=O;for(let c=0;c<s;c++){const l=t[c];let h,g,p=-1,y=0;for(;y<l.length&&(o.lastIndex=y,g=o.exec(l),g!==null);)y=o.lastIndex,o===O?g[1]==="!--"?o=xe:g[1]!==void 0?o=we:g[2]!==void 0?(Le.test(g[2])&&(a=RegExp("</"+g[2],"g")),o=_):g[3]!==void 0&&(o=_):o===_?g[0]===">"?(o=a??O,p=-1):g[1]===void 0?p=-2:(p=o.lastIndex-g[2].length,h=g[1],o=g[3]===void 0?_:g[3]==='"'?_e:$e):o===_e||o===$e?o=_:o===xe||o===we?o=O:(o=_,a=void 0);const x=o===_&&t[c+1].startsWith("/>")?" ":"";r+=o===O?l+Qe:p>=0?(i.push(h),l.slice(0,p)+ze+l.slice(p)+w+x):l+w+(p===-2?c:x)}return[Ee(t,r+(t[s]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]};class D{constructor({strings:e,_$litType$:s},i){let a;this.parts=[];let r=0,o=0;const c=e.length-1,l=this.parts,[h,g]=st(e,s);if(this.el=D.createElement(h,i),k.currentNode=this.el.content,s===2||s===3){const p=this.el.content.firstChild;p.replaceWith(...p.childNodes)}for(;(a=k.nextNode())!==null&&l.length<c;){if(a.nodeType===1){if(a.hasAttributes())for(const p of a.getAttributeNames())if(p.endsWith(ze)){const y=g[o++],x=a.getAttribute(p).split(w),U=/([.?@])?(.*)/.exec(y);l.push({type:1,index:r,name:U[2],strings:x,ctor:U[1]==="."?it:U[1]==="?"?rt:U[1]==="@"?ot:K}),a.removeAttribute(p)}else p.startsWith(w)&&(l.push({type:6,index:r}),a.removeAttribute(p));if(Le.test(a.tagName)){const p=a.textContent.split(w),y=p.length-1;if(y>0){a.textContent=H?H.emptyScript:"";for(let x=0;x<y;x++)a.append(p[x],N()),k.nextNode(),l.push({type:2,index:++r});a.append(p[y],N())}}}else if(a.nodeType===8)if(a.data===Oe)l.push({type:2,index:r});else{let p=-1;for(;(p=a.data.indexOf(w,p+1))!==-1;)l.push({type:7,index:r}),p+=w.length-1}r++}}static createElement(e,s){const i=A.createElement("template");return i.innerHTML=e,i}}function M(t,e,s=t,i){var o,c;if(e===P)return e;let a=i!==void 0?(o=s._$Co)==null?void 0:o[i]:s._$Cl;const r=T(e)?void 0:e._$litDirective$;return(a==null?void 0:a.constructor)!==r&&((c=a==null?void 0:a._$AO)==null||c.call(a,!1),r===void 0?a=void 0:(a=new r(t),a._$AT(t,s,i)),i!==void 0?(s._$Co??(s._$Co=[]))[i]=a:s._$Cl=a),a!==void 0&&(e=M(t,a._$AS(t,e.values),a,i)),e}class at{constructor(e,s){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=s}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:s},parts:i}=this._$AD,a=((e==null?void 0:e.creationScope)??A).importNode(s,!0);k.currentNode=a;let r=k.nextNode(),o=0,c=0,l=i[0];for(;l!==void 0;){if(o===l.index){let h;l.type===2?h=new I(r,r.nextSibling,this,e):l.type===1?h=new l.ctor(r,l.name,l.strings,this,e):l.type===6&&(h=new nt(r,this,e)),this._$AV.push(h),l=i[++c]}o!==(l==null?void 0:l.index)&&(r=k.nextNode(),o++)}return k.currentNode=A,a}p(e){let s=0;for(const i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,s),s+=i.strings.length-2):i._$AI(e[s])),s++}}class I{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,s,i,a){this.type=2,this._$AH=u,this._$AN=void 0,this._$AA=e,this._$AB=s,this._$AM=i,this.options=a,this._$Cv=(a==null?void 0:a.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const s=this._$AM;return s!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=s.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,s=this){e=M(this,e,s),T(e)?e===u||e==null||e===""?(this._$AH!==u&&this._$AR(),this._$AH=u):e!==this._$AH&&e!==P&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):et(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==u&&T(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){var r;const{values:s,_$litType$:i}=e,a=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=D.createElement(Ee(i.h,i.h[0]),this.options)),i);if(((r=this._$AH)==null?void 0:r._$AD)===a)this._$AH.p(s);else{const o=new at(a,this),c=o.u(this.options);o.p(s),this.T(c),this._$AH=o}}_$AC(e){let s=ke.get(e.strings);return s===void 0&&ke.set(e.strings,s=new D(e)),s}k(e){he(this._$AH)||(this._$AH=[],this._$AR());const s=this._$AH;let i,a=0;for(const r of e)a===s.length?s.push(i=new I(this.O(N()),this.O(N()),this,this.options)):i=s[a],i._$AI(r),a++;a<s.length&&(this._$AR(i&&i._$AB.nextSibling,a),s.length=a)}_$AR(e=this._$AA.nextSibling,s){var i;for((i=this._$AP)==null?void 0:i.call(this,!1,!0,s);e!==this._$AB;){const a=ve(e).nextSibling;ve(e).remove(),e=a}}setConnected(e){var s;this._$AM===void 0&&(this._$Cv=e,(s=this._$AP)==null||s.call(this,e))}}class K{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,s,i,a,r){this.type=1,this._$AH=u,this._$AN=void 0,this.element=e,this.name=s,this._$AM=a,this.options=r,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=u}_$AI(e,s=this,i,a){const r=this.strings;let o=!1;if(r===void 0)e=M(this,e,s,0),o=!T(e)||e!==this._$AH&&e!==P,o&&(this._$AH=e);else{const c=e;let l,h;for(e=r[0],l=0;l<r.length-1;l++)h=M(this,c[i+l],s,l),h===P&&(h=this._$AH[l]),o||(o=!T(h)||h!==this._$AH[l]),h===u?e=u:e!==u&&(e+=(h??"")+r[l+1]),this._$AH[l]=h}o&&!a&&this.j(e)}j(e){e===u?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class it extends K{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===u?void 0:e}}class rt extends K{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==u)}}class ot extends K{constructor(e,s,i,a,r){super(e,s,i,a,r),this.type=5}_$AI(e,s=this){if((e=M(this,e,s,0)??u)===P)return;const i=this._$AH,a=e===u&&i!==u||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,r=e!==u&&(i===u||a);a&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var s;typeof this._$AH=="function"?this._$AH.call(((s=this.options)==null?void 0:s.host)??this.element,e):this._$AH.handleEvent(e)}}class nt{constructor(e,s,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=s,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){M(this,e)}}const se=E.litHtmlPolyfillSupport;se==null||se(D,I),(E.litHtmlVersions??(E.litHtmlVersions=[])).push("3.3.2");const Ne=(t,e,s)=>{const i=(s==null?void 0:s.renderBefore)??e;let a=i._$litPart$;if(a===void 0){const r=(s==null?void 0:s.renderBefore)??null;i._$litPart$=a=new I(e.insertBefore(N(),r),r,void 0,s??{})}return a._$AI(t),a};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const C=globalThis;class m extends S{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var s;const e=super.createRenderRoot();return(s=this.renderOptions).renderBefore??(s.renderBefore=e.firstChild),e}update(e){const s=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ne(s,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return P}}var Pe;m._$litElement$=!0,m.finalized=!0,(Pe=C.litElementHydrateSupport)==null||Pe.call(C,{LitElement:m});const ae=C.litElementPolyfillSupport;ae==null||ae({LitElement:m});(C.litElementVersions??(C.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const f=t=>(e,s)=>{s!==void 0?s.addInitializer(()=>{customElements.define(t,e)}):customElements.define(t,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const lt={attribute:!0,type:String,converter:j,reflect:!1,hasChanged:pe},ct=(t=lt,e,s)=>{const{kind:i,metadata:a}=s;let r=globalThis.litPropertyMetadata.get(a);if(r===void 0&&globalThis.litPropertyMetadata.set(a,r=new Map),i==="setter"&&((t=Object.create(t)).wrapped=!0),r.set(s.name,t),i==="accessor"){const{name:o}=s;return{set(c){const l=e.get.call(this);e.set.call(this,c),this.requestUpdate(o,l,t,!0,c)},init(c){return c!==void 0&&this.C(o,void 0,t,c),c}}}if(i==="setter"){const{name:o}=s;return function(c){const l=this[o];e.call(this,c),this.requestUpdate(o,l,t,!0,c)}}throw Error("Unsupported decorator location: "+i)};function dt(t){return(e,s)=>typeof s=="object"?ct(t,e,s):((i,a,r)=>{const o=a.hasOwnProperty(r);return a.constructor.createProperty(r,i),o?Object.getOwnPropertyDescriptor(a,r):void 0})(t,e,s)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function v(t){return dt({...t,state:!0,attribute:!1})}const pt={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"功能",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"v2.0 现已发布",title:{part1:"真正可用的",accent:"AI 工程师",part2:""},description:"不再当 AI 的保姆。Pi 处理上下文检索、并行子代理、安全审计和多通道部署 — 你专注于架构，而非提示词工程。",cta:{primary:"开始使用",secondary:"阅读文档"},stats:{commands:"内置命令",extensions:"扩展插件",productivity:"效率提升"}},features:{label:"核心架构",title:"编排，不只是对话",subtitle:"从语义代码搜索到多代理协作，从安全审计到生产部署。",workflow:{title:"五阶段工作流",desc:"强制管线：上下文检索 → 分析 → 原型 → 实施 → 审计。没有捷径，没有幻觉编辑。",features:["黄金法则：先检索再修改","Unified Diff 隔离","强制交付前审查","L1-L4 复杂度路由"],metrics:{tasks:"任务",success:"成功率",active:"活跃"}},skills:{title:"42 技能",desc:"语义搜索、AST 操作、系统设计、Office 自动化。",tags:["ace-tool","ast-grep","codemap","web-fetch","+38 更多"]},subagents:{title:"25+ 代理",desc:"通过 Crew 协议协调的专用代理。",agents:["侦察","规划","执行","审查","视觉","研究","API测试","安全","简化","代码图","头脑风暴","系统设计"]},search:{title:"代码搜索",desc:"自然语言到精确位置。三层搜索，零遗漏。",example:'pi /search "认证中间件"'},gateway:{title:"多通道网关",desc:"一个服务支持 Telegram、Discord、WebChat、OpenAI API。",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"网关",title:"进程编排器",subtitle:"管理 AI 代理池并路由消息。通道无关、插件优先、纵深安全。",layers:{channels:{title:"通道",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"管线",desc:"分发 → 去重 → 解析 → 处理"},plugins:{title:"插件",desc:"16 钩子 · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 路由 · 定时 · 事件"},security:{title:"安全",desc:"认证 · 执行守卫 · SSRF · 白名单"}}},workflow:{label:"工作流",title:"五阶段强制管线",subtitle:"每个任务都经过检索、分析、原型、实施和审计。质量源于设计。",phases:[{num:"01",title:"检索",desc:"语义搜索、精确匹配、语法结构"},{num:"02",title:"分析",desc:"侦察派发、策略选择"},{num:"03",title:"原型",desc:"外部模型 diff、内部重构"},{num:"04",title:"实施",desc:"精准编辑、依赖检查"},{num:"05",title:"审计",desc:"Codex 审查、测试验证"}]},extensions:{label:"扩展",title:"无限扩展",subtitle:"从 CLI 命令到 TUI 组件，从网关插件到定时任务。",categories:{commands:{title:"命令",desc:"斜杠命令和快捷键"},tools:{title:"工具",desc:"可复用能力"},gateway:{title:"网关",desc:"通道集成"}}},comparison:{label:"对比",title:"不是又一个包装器",subtitle:"为严肃工程而生，非玩具项目。",headers:{feature:"能力",pi:"Pi Agent",others:"典型工具"},rows:[{feature:"多阶段工作流",pi:"5 个强制阶段",others:"单步执行"},{feature:"上下文检索",pi:"语义 + 精确 + AST",others:"基础搜索"},{feature:"安全模型",pi:"五层防御",others:"最小化"},{feature:"子代理系统",pi:"Crew 网格协议",others:"无"},{feature:"网关",pi:"多通道 + RPC",others:"单一接口"}]},cta:{title:"准备更快交付？",subtitle:"加入那些不再当 AI 保姆、开始真正架构的工程师。",button:"开始使用"},footer:{tagline:"工程级 AI 编排。",links:{docs:"文档",github:"GitHub",discord:"Discord"},copyright:"精准构建。"}},ht={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Now in v2.0",title:{part1:"The ",accent:"AI Engineer",part2:" You Actually Want"},description:"Stop babysitting AI agents. Pi handles context retrieval, parallel subagents, security audits, and multi-channel deployment — so you focus on architecture, not prompting.",cta:{primary:"Get Started",secondary:"Read Docs"},stats:{commands:"Built-in Commands",extensions:"Extensions",productivity:"Faster Delivery"}},features:{label:"Core Architecture",title:"Orchestration, Not Just Chat",subtitle:"From semantic code search to multi-agent crews, from security audits to production deployment.",workflow:{title:"5-Phase Workflow",desc:"Mandatory pipeline: Context Retrieval → Analysis → Prototyping → Implementation → Audit. No shortcuts, no hallucinated edits.",features:["Golden Rule: retrieve before modify","Unified Diff isolation","Forced pre-delivery review","L1-L4 complexity routing"],metrics:{tasks:"Tasks",success:"Success",active:"Active"}},skills:{title:"42 Skills",desc:"Semantic search, AST manipulation, system design, Office automation.",tags:["ace-tool","ast-grep","codemap","web-fetch","+38 more"]},subagents:{title:"25+ Agents",desc:"Specialized agents coordinated via Crew protocol.",agents:["scout","planner","worker","reviewer","vision","researcher","api-tester","security","simplifier","codemap","brainstormer","system-design"]},search:{title:"Code Search",desc:"Natural language to exact location. Three layers, zero misses.",example:'pi /search "auth middleware"'},gateway:{title:"Multi-Channel Gateway",desc:"One service for Telegram, Discord, WebChat, OpenAI API.",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"Gateway",title:"Process Orchestrator",subtitle:"Manage AI agent pools and route messages. Channel-agnostic, plugin-first, security-in-depth.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Resolve → Process"},plugins:{title:"Plugins",desc:"16 Hooks · Registry · Conflicts"},runtime:{title:"Runtime",desc:"RPC Pool · Router · Cron · Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF · Allowlist"}}},workflow:{label:"Workflow",title:"5-Phase Mandatory Pipeline",subtitle:"Every task goes through retrieval, analysis, prototyping, implementation, and audit. Quality by design.",phases:[{num:"01",title:"Retrieve",desc:"Semantic search, exact match, syntax structure"},{num:"02",title:"Analyze",desc:"Scout dispatch, strategy selection"},{num:"03",title:"Prototype",desc:"External model diff, internal refactor"},{num:"04",title:"Implement",desc:"Surgical edits, dependency checks"},{num:"05",title:"Audit",desc:"Codex review, test verification"}]},extensions:{label:"Extensions",title:"Infinite Extensibility",subtitle:"From CLI commands to TUI components, from gateway plugins to cron jobs.",categories:{commands:{title:"Commands",desc:"Slash commands and shortcuts"},tools:{title:"Tools",desc:"Reusable capabilities"},gateway:{title:"Gateway",desc:"Channel integrations"}}},comparison:{label:"Comparison",title:"Not Another Wrapper",subtitle:"Purpose-built for serious engineering, not toy projects.",headers:{feature:"Capability",pi:"Pi Agent",others:"Typical Tools"},rows:[{feature:"Multi-phase workflow",pi:"5 mandatory phases",others:"Single-step"},{feature:"Context retrieval",pi:"Semantic + exact + AST",others:"Basic search"},{feature:"Security model",pi:"5-layer defense",others:"Minimal"},{feature:"Subagent system",pi:"Crew mesh protocol",others:"None"},{feature:"Gateway",pi:"Multi-channel + RPC",others:"Single interface"}]},cta:{title:"Ready to Ship Faster?",subtitle:"Join the engineers who stopped babysitting AI and started architecting.",button:"Get Started"},footer:{tagline:"Engineering-grade AI orchestration.",links:{docs:"Documentation",github:"GitHub",discord:"Discord"},copyright:"Built with precision."}},ie={"zh-CN":pt,"en-US":ht},Ce="pi-agent-locale";class mt{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const s=localStorage.getItem(Ce);if(s&&ie[s]){this.currentLocale=s;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(ie[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(Ce,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(s=>s())}}t(e){const s=e.split(".");let i=ie[this.currentLocale];for(const a of s)if(i&&typeof i=="object"&&a in i)i=i[a];else return e;return typeof i=="string"?i:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const n=new mt;var ut=Object.defineProperty,gt=Object.getOwnPropertyDescriptor,Q=(t,e,s,i)=>{for(var a=i>1?void 0:i?gt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&ut(e,s,a),a};const Ae=[{key:"features",id:"features"},{key:"gateway",id:"gateway"},{key:"workflow",id:"workflow"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],re="https://github.com/mario1ua/pi-coding-agent";let z=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=d`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`,this._burgerIcon=d`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen?d`<path d="M18 6L6 18M6 6l12 12"/>`:d`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var t,e;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const t=new Map;this._io=new IntersectionObserver(e=>{for(const a of e)a.isIntersecting?t.set(a.target.id,a.intersectionRatio):t.delete(a.target.id);let s="",i=0;t.forEach((a,r)=>{a>i&&(i=a,s=r)}),s!==this.activeId&&(this.activeId=s)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of Ae){const s=document.getElementById(e.id);s&&this._io.observe(s)}})}t(t){return n.t(t)}_toggleLocale(){n.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const t=Ae.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return d`
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
          <a href=${re} target="_blank" class="gh-btn" aria-label="GitHub">
            ${this._ghIcon}
          </a>
          <a href=${re} class="cta" target="_blank">${this.t("navbar.cta")}</a>
          <button class="burger" @click=${this._toggleMenu}>${this._burgerIcon}</button>
        </div>
      </nav>

      <div class="mobile" ?open=${this.menuOpen}>
        ${t.map(e=>d`
          <a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>
            ${e.label}
          </a>
        `)}
        <a href=${re} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
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
  `;Q([v()],z.prototype,"locale",2);Q([v()],z.prototype,"menuOpen",2);Q([v()],z.prototype,"activeId",2);z=Q([f("pi-navbar")],z);var ft=Object.defineProperty,bt=Object.getOwnPropertyDescriptor,Te=(t,e,s,i)=>{for(var a=i>1?void 0:i?bt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&ft(e,s,a),a};let G=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n);return d`
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
            <a href="https://github.com/mario1ua/pi-coding-agent" class="cta-primary" target="_blank" rel="noopener">
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
    `}};G.styles=b`
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
  `;Te([v()],G.prototype,"locale",2);G=Te([f("hero-section")],G);var vt=Object.defineProperty,yt=Object.getOwnPropertyDescriptor,De=(t,e,s,i)=>{for(var a=i>1?void 0:i?yt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&vt(e,s,a),a};let W=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}_handleMouseMove(t){const e=t.currentTarget,s=e.getBoundingClientRect(),i=(t.clientX-s.left)/s.width*100,a=(t.clientY-s.top)/s.height*100;e.style.setProperty("--mouse-x",`${i}%`),e.style.setProperty("--mouse-y",`${a}%`)}render(){const t=i=>n.t(i),e=n.getCurrentLocale()==="zh-CN",s=e?["侦察","规划","执行","审查","视觉","研究","API测","安全","简化","码图","脑暴","系统"]:["SC","PL","WR","RV","VS","RS","AP","SE","SI","CM","BR","SD"];return d`
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
                ${s.map((i,a)=>d`
                  <div class="agent-cell ${a<5?"active":""}">${i}</div>
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
    `}};W.styles=b`
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
  `;De([v()],W.prototype,"locale",2);W=De([f("bento-grid")],W);var xt=Object.defineProperty,wt=Object.getOwnPropertyDescriptor,Re=(t,e,s,i)=>{for(var a=i>1?void 0:i?wt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&xt(e,s,a),a};let Y=class extends m{constructor(){super(...arguments),this.messageCount=1247}connectedCallback(){super.connectedCallback(),this._interval=window.setInterval(()=>{this.messageCount+=Math.floor(Math.random()*3)},2e3)}disconnectedCallback(){super.disconnectedCallback(),this._interval&&clearInterval(this._interval)}render(){return d`
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
    `}};Y.styles=b`
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
  `;Re([v()],Y.prototype,"messageCount",2);Y=Re([f("gateway-visualization")],Y);var $t=Object.defineProperty,_t=Object.getOwnPropertyDescriptor,Ie=(t,e,s,i)=>{for(var a=i>1?void 0:i?_t(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&$t(e,s,a),a};let F=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=n.getCurrentLocale()==="zh-CN";return d`
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
  `;Ie([v()],F.prototype,"locale",2);F=Ie([f("gateway-section")],F);var kt=Object.defineProperty,Ct=Object.getOwnPropertyDescriptor,me=(t,e,s,i)=>{for(var a=i>1?void 0:i?Ct(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&kt(e,s,a),a};let R=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale(),this.progress=0}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()}),this._progressInterval=window.setInterval(()=>{this.progress=(this.progress+1)%100},100)}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this),this._progressInterval&&clearInterval(this._progressInterval)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=n.getCurrentLocale()==="zh-CN",s=[{num:"01",title:t("workflow.phases.0.title"),desc:t("workflow.phases.0.desc"),tools:["ace","rg","ast-grep"]},{num:"02",title:t("workflow.phases.1.title"),desc:t("workflow.phases.1.desc"),tools:["scout","planner"]},{num:"03",title:t("workflow.phases.2.title"),desc:t("workflow.phases.2.desc"),tools:["Gemini","diff"]},{num:"04",title:t("workflow.phases.3.title"),desc:t("workflow.phases.3.desc"),tools:["edit","test"]},{num:"05",title:t("workflow.phases.4.title"),desc:t("workflow.phases.4.desc"),tools:["Codex","verify"]}];return d`
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
              ${s.map((i,a)=>d`
                <div class="phase">
                  <div class="phase-node">
                    <span class="phase-number">${i.num}</span>
                    ${a<3?d`<span class="phase-status"></span>`:""}
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
  `;me([v()],R.prototype,"locale",2);me([v()],R.prototype,"progress",2);R=me([f("workflow-timeline")],R);var At=Object.getOwnPropertyDescriptor,St=(t,e,s,i)=>{for(var a=i>1?void 0:i?At(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=o(a)||a);return a};let oe=class extends m{render(){return d`<workflow-timeline></workflow-timeline>`}};oe.styles=b`
    :host { display: block; width: 100%; }
  `;oe=St([f("workflow-section")],oe);var Pt=Object.defineProperty,Mt=Object.getOwnPropertyDescriptor,Ue=(t,e,s,i)=>{for(var a=i>1?void 0:i?Mt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&Pt(e,s,a),a};let V=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=["commands","tools","gateway"];return d`
      <section class="section" id="extensions">
        <div class="inner">
          <div class="header">
            <span class="label">${t("extensions.label")}</span>
            <h2 class="title">${t("extensions.title")}</h2>
            <p class="subtitle">${t("extensions.subtitle")}</p>
          </div>

          <div class="grid">
            ${e.map(s=>d`
              <div class="card">
                <div class="card-title">${t(`extensions.categories.${s}.title`)}</div>
                <div class="card-desc">${t(`extensions.categories.${s}.desc`)}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}};V.styles=b`
    :host {
      display: block;
      width: 100%;
    }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
    }

    .inner {
      max-width: 1200px;
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

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    .card {
      padding: 1.75rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .card:hover {
      border-color: #3f3f46;
      transform: translateY(-2px);
    }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .card-desc {
      font-size: 0.9375rem;
      color: #71717a;
      line-height: 1.6;
    }

    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `;Ue([v()],V.prototype,"locale",2);V=Ue([f("extensions-section")],V);var zt=Object.defineProperty,Ot=Object.getOwnPropertyDescriptor,Be=(t,e,s,i)=>{for(var a=i>1?void 0:i?Ot(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&zt(e,s,a),a};let J=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n),e=[0,1,2,3,4];return d`
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
            ${e.map(s=>d`
              <div class="row">
                <div class="cell feature">${t(`comparison.rows.${s}.feature`)}</div>
                <div class="cell pi">${t(`comparison.rows.${s}.pi`)}</div>
                <div class="cell others">${t(`comparison.rows.${s}.others`)}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `}};J.styles=b`
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
      grid-template-columns: 1.5fr 1fr 1fr;
      border-bottom: 1px solid #27272a;
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
    }

    @media (max-width: 640px) {
      .cell {
        padding: 0.875rem 1rem;
        font-size: 0.8125rem;
      }
    }
  `;Be([v()],J.prototype,"locale",2);J=Be([f("comparison-section")],J);var Lt=Object.defineProperty,Et=Object.getOwnPropertyDescriptor,je=(t,e,s,i)=>{for(var a=i>1?void 0:i?Et(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&Lt(e,s,a),a};let q=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}render(){const t=n.getCurrentLocale()==="zh-CN";return d`
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
              <div class="layer-icon">⚡</div>
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
              <div class="layer-icon">📝</div>
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
              <div class="layer-icon">📄</div>
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
    `}};q.styles=b`
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
  `;je([v()],q.prototype,"locale",2);q=je([f("memory-section")],q);var Nt=Object.defineProperty,Tt=Object.getOwnPropertyDescriptor,He=(t,e,s,i)=>{for(var a=i>1?void 0:i?Tt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&Nt(e,s,a),a};let X=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}render(){const t=n.getCurrentLocale()==="zh-CN";return d`
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
                <div class="spec-icon runtime">⚡</div>
                <span class="spec-title">${t?"运行时":"Runtime"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${t?"语言":"Language"}</span>
                  <span class="spec-value">TypeScript 5.3</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"引擎":"Engine"}</span>
                  <span class="spec-value">Node.js 20+</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"打包":"Bundler"}</span>
                  <span class="spec-value">Vite 5</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">TUI</span>
                  <span class="spec-value highlight">React + Ink</span>
                </div>
              </div>
            </div>

            <!-- Gateway -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon gateway">🌐</div>
                <span class="spec-title">${t?"网关":"Gateway"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${t?"协议":"Protocol"}</span>
                  <span class="spec-value">WebSocket + HTTP/2</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"并发":"Concurrency"}</span>
                  <span class="spec-value highlight">1000+ sessions</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"延迟":"Latency"}</span>
                  <span class="spec-value">&lt; 10ms p99</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">RPC</span>
                  <span class="spec-value">JSON-RPC 2.0</span>
                </div>
              </div>
            </div>

            <!-- Memory -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon memory">🧠</div>
                <span class="spec-title">${t?"记忆":"Memory"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${t?"向量维度":"Vector Dim"}</span>
                  <span class="spec-value">768 (Gemma)</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"检索":"Retrieval"}</span>
                  <span class="spec-value highlight">Vector + BM25</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"数据库":"Database"}</span>
                  <span class="spec-value">LanceDB</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"存储":"Storage"}</span>
                  <span class="spec-value">Markdown + SQLite</span>
                </div>
              </div>
            </div>

            <!-- Security -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon security">🔒</div>
                <span class="spec-title">${t?"安全":"Security"}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${t?"认证":"Auth"}</span>
                  <span class="spec-value highlight">HMAC-SHA256</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"沙箱":"Sandbox"}</span>
                  <span class="spec-value">Unified Diff</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"网络":"Network"}</span>
                  <span class="spec-value">SSRF Guard</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${t?"执行":"Execution"}</span>
                  <span class="spec-value">Allowlist</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Architecture Diagram -->
          <div class="arch-diagram">
            <h3 class="arch-title">${t?"数据流架构":"Data Flow Architecture"}</h3>
            <svg class="arch-svg" viewBox="0 0 800 300">
              <!-- Core -->
              <rect class="arch-node" x="350" y="120" width="100" height="60" rx="8" />
              <text class="arch-label" x="400" y="155">Pi Core</text>

              <!-- Extensions -->
              <rect class="arch-node" x="150" y="50" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="75">Extensions</text>

              <rect class="arch-node" x="150" y="120" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="145">Skills</text>

              <rect class="arch-node" x="150" y="190" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="215">Subagents</text>

              <!-- Gateway -->
              <rect class="arch-node" x="570" y="50" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="75">Gateway</text>

              <rect class="arch-node" x="570" y="120" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="145">RPC Pool</text>

              <rect class="arch-node" x="570" y="190" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="215">Channels</text>

              <!-- Memory -->
              <rect class="arch-node" x="360" y="240" width="80" height="40" rx="6" />
              <text class="arch-label" x="400" y="265">Memory</text>

              <!-- Connections -->
              <path class="arch-connector" d="M 230 70 L 350 150" />
              <path class="arch-connector" d="M 230 140 L 350 150" />
              <path class="arch-connector" d="M 230 210 L 350 150" />
              <path class="arch-connector" d="M 450 150 L 570 70" />
              <path class="arch-connector" d="M 450 150 L 570 140" />
              <path class="arch-connector" d="M 450 150 L 570 210" />
              <path class="arch-connector" d="M 400 180 L 400 240" />
            </svg>
          </div>
        </div>
      </section>
    `}};X.styles=b`
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

    /* Specs Grid */
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
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
      font-size: 1.125rem;
    }

    .spec-icon.runtime { background: rgba(16, 185, 129, 0.1); }
    .spec-icon.gateway { background: rgba(59, 130, 246, 0.1); }
    .spec-icon.memory { background: rgba(168, 85, 247, 0.1); }
    .spec-icon.security { background: rgba(239, 68, 68, 0.1); }

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

    /* Architecture Diagram */
    .arch-diagram {
      margin-top: 4rem;
      padding: 2rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      overflow-x: auto;
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
      height: 300px;
    }

    .arch-node {
      fill: #27272a;
      stroke: #3f3f46;
      stroke-width: 1;
    }

    .arch-label {
      fill: #a1a1aa;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
    }

    .arch-connector {
      stroke: #3f3f46;
      stroke-width: 1;
      fill: none;
      stroke-dasharray: 4 2;
    }

    @media (max-width: 768px) {
      .specs-grid { grid-template-columns: 1fr; }
    }
  `;He([v()],X.prototype,"locale",2);X=He([f("tech-specs")],X);var Dt=Object.defineProperty,Rt=Object.getOwnPropertyDescriptor,Ge=(t,e,s,i)=>{for(var a=i>1?void 0:i?Rt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=(i?o(e,s,a):o(a))||a);return i&&a&&Dt(e,s,a),a};let Z=class extends m{constructor(){super(...arguments),this.locale=n.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=n.subscribe(()=>{this.locale=n.getCurrentLocale()})}disconnectedCallback(){var t;super.disconnectedCallback(),(t=this._unsub)==null||t.call(this)}t(t){return n.t(t)}render(){const t=n.t.bind(n);return d`
      <section class="section">
        <div class="inner">
          <h2 class="title">${t("cta.title")}</h2>
          <p class="subtitle">${t("cta.subtitle")}</p>
          <a href="https://github.com/mario1ua/pi-coding-agent" class="cta" target="_blank" rel="noopener">
            ${t("cta.button")}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </section>
    `}};Z.styles=b`
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
  `;Ge([v()],Z.prototype,"locale",2);Z=Ge([f("cta-section")],Z);var It=Object.getOwnPropertyDescriptor,Ut=(t,e,s,i)=>{for(var a=i>1?void 0:i?It(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=o(a)||a);return a};let ne=class extends m{render(){return d`
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
            <a href="https://github.com/mario1ua/pi-coding-agent" class="link" target="_blank" rel="noopener">GitHub</a>
            <a href="#" class="link">Documentation</a>
            <a href="#" class="link">Discord</a>
          </div>
        </div>
      </footer>
    `}};ne.styles=b`
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
  `;ne=Ut([f("pi-footer")],ne);var Bt=Object.getOwnPropertyDescriptor,jt=(t,e,s,i)=>{for(var a=i>1?void 0:i?Bt(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=o(a)||a);return a};let le=class extends m{constructor(){super(...arguments),this.particles=[],this.PARTICLE_COUNT=30,this.CONNECTION_DISTANCE=150,this.MAX_CONNECTIONS=3,this.animate=()=>{!this.ctx||!this.canvas||(this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.particles.forEach((t,e)=>{t.x+=t.vx,t.y+=t.vy,(t.x<0||t.x>this.canvas.width)&&(t.vx*=-1),(t.y<0||t.y>this.canvas.height)&&(t.vy*=-1),this.ctx.beginPath(),this.ctx.arc(t.x,t.y,t.radius,0,Math.PI*2),this.ctx.fillStyle=`rgba(16, 185, 129, ${t.opacity})`,this.ctx.fill();let s=0;for(let i=e+1;i<this.particles.length&&!(s>=this.MAX_CONNECTIONS);i++){const a=this.particles[i],r=t.x-a.x,o=t.y-a.y,c=Math.sqrt(r*r+o*o);if(c<this.CONNECTION_DISTANCE){const l=(1-c/this.CONNECTION_DISTANCE)*.15;this.ctx.beginPath(),this.ctx.moveTo(t.x,t.y),this.ctx.lineTo(a.x,a.y),this.ctx.strokeStyle=`rgba(16, 185, 129, ${l})`,this.ctx.lineWidth=.5,this.ctx.stroke(),s++}}}),this.animationId=requestAnimationFrame(this.animate))}}firstUpdated(){this.canvas=this.renderRoot.querySelector("canvas"),this.canvas&&(this.ctx=this.canvas.getContext("2d")||void 0,this.ctx&&(this.setupCanvas(),this.initParticles(),this.animate(),this.resizeObserver=new ResizeObserver(()=>{this.setupCanvas()}),this.resizeObserver.observe(this.canvas)))}setupCanvas(){var e;if(!this.canvas)return;const t=(e=this.canvas.parentElement)==null?void 0:e.getBoundingClientRect();t&&(this.canvas.width=t.width,this.canvas.height=t.height)}initParticles(){if(this.canvas){this.particles=[];for(let t=0;t<this.PARTICLE_COUNT;t++)this.particles.push({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,radius:Math.random()*1.5+.5,opacity:Math.random()*.3+.1})}}disconnectedCallback(){var t;super.disconnectedCallback(),this.animationId&&cancelAnimationFrame(this.animationId),(t=this.resizeObserver)==null||t.disconnect()}render(){return d`<canvas></canvas>`}};le.styles=b`
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
  `;le=jt([f("canvas-background")],le);var Ht=Object.getOwnPropertyDescriptor,Gt=(t,e,s,i)=>{for(var a=i>1?void 0:i?Ht(e,s):e,r=t.length-1,o;r>=0;r--)(o=t[r])&&(a=o(a)||a);return a};let Se=class extends m{createRenderRoot(){return this}render(){return d`
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
    `}};Se=Gt([f("pi-app")],Se);Ne(d`<pi-app></pi-app>`,document.getElementById("app"));
