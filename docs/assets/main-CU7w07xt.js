(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))s(o);new MutationObserver(o=>{for(const i of o)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function t(o){const i={};return o.integrity&&(i.integrity=o.integrity),o.referrerPolicy&&(i.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?i.credentials="include":o.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(o){if(o.ep)return;o.ep=!0;const i=t(o);fetch(o.href,i)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const G=globalThis,oe=G.ShadowRoot&&(G.ShadyCSS===void 0||G.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,se=Symbol(),ne=new WeakMap;let ke=class{constructor(e,t,s){if(this._$cssResult$=!0,s!==se)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(oe&&e===void 0){const s=t!==void 0&&t.length===1;s&&(e=ne.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),s&&ne.set(t,e))}return e}toString(){return this.cssText}};const ze=r=>new ke(typeof r=="string"?r:r+"",void 0,se),x=(r,...e)=>{const t=r.length===1?r[0]:e.reduce((s,o,i)=>s+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(o)+r[i+1],r[0]);return new ke(t,r,se)},Ie=(r,e)=>{if(oe)r.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const s=document.createElement("style"),o=G.litNonce;o!==void 0&&s.setAttribute("nonce",o),s.textContent=t.cssText,r.appendChild(s)}},ce=oe?r=>r:r=>r instanceof CSSStyleSheet?(e=>{let t="";for(const s of e.cssRules)t+=s.cssText;return ze(t)})(r):r;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Re,defineProperty:Ne,getOwnPropertyDescriptor:Ue,getOwnPropertyNames:Le,getOwnPropertySymbols:Ge,getPrototypeOf:De}=Object,w=globalThis,le=w.trustedTypes,He=le?le.emptyScript:"",F=w.reactiveElementPolyfillSupport,M=(r,e)=>r,D={toAttribute(r,e){switch(e){case Boolean:r=r?He:null;break;case Object:case Array:r=r==null?r:JSON.stringify(r)}return r},fromAttribute(r,e){let t=r;switch(e){case Boolean:t=r!==null;break;case Number:t=r===null?null:Number(r);break;case Object:case Array:try{t=JSON.parse(r)}catch{t=null}}return t}},ie=(r,e)=>!Re(r,e),de={attribute:!0,type:String,converter:D,reflect:!1,useDefault:!1,hasChanged:ie};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),w.litPropertyMetadata??(w.litPropertyMetadata=new WeakMap);let C=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=de){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const s=Symbol(),o=this.getPropertyDescriptor(e,s,t);o!==void 0&&Ne(this.prototype,e,o)}}static getPropertyDescriptor(e,t,s){const{get:o,set:i}=Ue(this.prototype,e)??{get(){return this[t]},set(a){this[t]=a}};return{get:o,set(a){const c=o==null?void 0:o.call(this);i==null||i.call(this,a),this.requestUpdate(e,c,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??de}static _$Ei(){if(this.hasOwnProperty(M("elementProperties")))return;const e=De(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(M("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(M("properties"))){const t=this.properties,s=[...Le(t),...Ge(t)];for(const o of s)this.createProperty(o,t[o])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[s,o]of t)this.elementProperties.set(s,o)}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const o=this._$Eu(t,s);o!==void 0&&this._$Eh.set(o,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const s=new Set(e.flat(1/0).reverse());for(const o of s)t.unshift(ce(o))}else e!==void 0&&t.push(ce(e));return t}static _$Eu(e,t){const s=t.attribute;return s===!1?void 0:typeof s=="string"?s:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(t=>t(this))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const s of t.keys())this.hasOwnProperty(s)&&(e.set(s,this[s]),delete this[s]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Ie(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(t=>{var s;return(s=t.hostConnected)==null?void 0:s.call(t)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(t=>{var s;return(s=t.hostDisconnected)==null?void 0:s.call(t)})}attributeChangedCallback(e,t,s){this._$AK(e,s)}_$ET(e,t){var i;const s=this.constructor.elementProperties.get(e),o=this.constructor._$Eu(e,s);if(o!==void 0&&s.reflect===!0){const a=(((i=s.converter)==null?void 0:i.toAttribute)!==void 0?s.converter:D).toAttribute(t,s.type);this._$Em=e,a==null?this.removeAttribute(o):this.setAttribute(o,a),this._$Em=null}}_$AK(e,t){var i,a;const s=this.constructor,o=s._$Eh.get(e);if(o!==void 0&&this._$Em!==o){const c=s.getPropertyOptions(o),n=typeof c.converter=="function"?{fromAttribute:c.converter}:((i=c.converter)==null?void 0:i.fromAttribute)!==void 0?c.converter:D;this._$Em=o;const p=n.fromAttribute(t,c.type);this[o]=p??((a=this._$Ej)==null?void 0:a.get(o))??p,this._$Em=null}}requestUpdate(e,t,s,o=!1,i){var a;if(e!==void 0){const c=this.constructor;if(o===!1&&(i=this[e]),s??(s=c.getPropertyOptions(e)),!((s.hasChanged??ie)(i,t)||s.useDefault&&s.reflect&&i===((a=this._$Ej)==null?void 0:a.get(e))&&!this.hasAttribute(c._$Eu(e,s))))return;this.C(e,t,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:s,reflect:o,wrapped:i},a){s&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,a??t??this[e]),i!==!0||a!==void 0)||(this._$AL.has(e)||(this.hasUpdated||s||(t=void 0),this._$AL.set(e,t)),o===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var s;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[i,a]of this._$Ep)this[i]=a;this._$Ep=void 0}const o=this.constructor.elementProperties;if(o.size>0)for(const[i,a]of o){const{wrapped:c}=a,n=this[i];c!==!0||this._$AL.has(i)||n===void 0||this.C(i,void 0,a,n)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(s=this._$EO)==null||s.forEach(o=>{var i;return(i=o.hostUpdate)==null?void 0:i.call(o)}),this.update(t)):this._$EM()}catch(o){throw e=!1,this._$EM(),o}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach(s=>{var o;return(o=s.hostUpdated)==null?void 0:o.call(s)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(e){}firstUpdated(e){}};C.elementStyles=[],C.shadowRootOptions={mode:"open"},C[M("elementProperties")]=new Map,C[M("finalized")]=new Map,F==null||F({ReactiveElement:C}),(w.reactiveElementVersions??(w.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const z=globalThis,pe=r=>r,H=z.trustedTypes,he=H?H.createPolicy("lit-html",{createHTML:r=>r}):void 0,$e="$lit$",y=`lit$${Math.random().toFixed(9).slice(2)}$`,_e="?"+y,je=`<${_e}>`,A=document,I=()=>A.createComment(""),R=r=>r===null||typeof r!="object"&&typeof r!="function",ae=Array.isArray,Be=r=>ae(r)||typeof(r==null?void 0:r[Symbol.iterator])=="function",K=`[ 	
\f\r]`,T=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,me=/-->/g,ge=/>/g,$=RegExp(`>|${K}(?:([^\\s"'>=/]+)(${K}*=${K}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),fe=/'/g,ue=/"/g,Pe=/^(?:script|style|textarea|title)$/i,We=r=>(e,...t)=>({_$litType$:r,strings:e,values:t}),h=We(1),S=Symbol.for("lit-noChange"),m=Symbol.for("lit-nothing"),be=new WeakMap,_=A.createTreeWalker(A,129);function Ae(r,e){if(!ae(r)||!r.hasOwnProperty("raw"))throw Error("invalid template strings array");return he!==void 0?he.createHTML(e):e}const Je=(r,e)=>{const t=r.length-1,s=[];let o,i=e===2?"<svg>":e===3?"<math>":"",a=T;for(let c=0;c<t;c++){const n=r[c];let p,g,l=-1,u=0;for(;u<n.length&&(a.lastIndex=u,g=a.exec(n),g!==null);)u=a.lastIndex,a===T?g[1]==="!--"?a=me:g[1]!==void 0?a=ge:g[2]!==void 0?(Pe.test(g[2])&&(o=RegExp("</"+g[2],"g")),a=$):g[3]!==void 0&&(a=$):a===$?g[0]===">"?(a=o??T,l=-1):g[1]===void 0?l=-2:(l=a.lastIndex-g[2].length,p=g[1],a=g[3]===void 0?$:g[3]==='"'?ue:fe):a===ue||a===fe?a=$:a===me||a===ge?a=T:(a=$,o=void 0);const v=a===$&&r[c+1].startsWith("/>")?" ":"";i+=a===T?n+je:l>=0?(s.push(p),n.slice(0,l)+$e+n.slice(l)+y+v):n+y+(l===-2?c:v)}return[Ae(r,i+(r[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),s]};class N{constructor({strings:e,_$litType$:t},s){let o;this.parts=[];let i=0,a=0;const c=e.length-1,n=this.parts,[p,g]=Je(e,t);if(this.el=N.createElement(p,s),_.currentNode=this.el.content,t===2||t===3){const l=this.el.content.firstChild;l.replaceWith(...l.childNodes)}for(;(o=_.nextNode())!==null&&n.length<c;){if(o.nodeType===1){if(o.hasAttributes())for(const l of o.getAttributeNames())if(l.endsWith($e)){const u=g[a++],v=o.getAttribute(l).split(y),L=/([.?@])?(.*)/.exec(u);n.push({type:1,index:i,name:L[2],strings:v,ctor:L[1]==="."?qe:L[1]==="?"?Ye:L[1]==="@"?Fe:q}),o.removeAttribute(l)}else l.startsWith(y)&&(n.push({type:6,index:i}),o.removeAttribute(l));if(Pe.test(o.tagName)){const l=o.textContent.split(y),u=l.length-1;if(u>0){o.textContent=H?H.emptyScript:"";for(let v=0;v<u;v++)o.append(l[v],I()),_.nextNode(),n.push({type:2,index:++i});o.append(l[u],I())}}}else if(o.nodeType===8)if(o.data===_e)n.push({type:2,index:i});else{let l=-1;for(;(l=o.data.indexOf(y,l+1))!==-1;)n.push({type:7,index:i}),l+=y.length-1}i++}}static createElement(e,t){const s=A.createElement("template");return s.innerHTML=e,s}}function E(r,e,t=r,s){var a,c;if(e===S)return e;let o=s!==void 0?(a=t._$Co)==null?void 0:a[s]:t._$Cl;const i=R(e)?void 0:e._$litDirective$;return(o==null?void 0:o.constructor)!==i&&((c=o==null?void 0:o._$AO)==null||c.call(o,!1),i===void 0?o=void 0:(o=new i(r),o._$AT(r,t,s)),s!==void 0?(t._$Co??(t._$Co=[]))[s]=o:t._$Cl=o),o!==void 0&&(e=E(r,o._$AS(r,e.values),o,s)),e}class Ve{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:s}=this._$AD,o=((e==null?void 0:e.creationScope)??A).importNode(t,!0);_.currentNode=o;let i=_.nextNode(),a=0,c=0,n=s[0];for(;n!==void 0;){if(a===n.index){let p;n.type===2?p=new U(i,i.nextSibling,this,e):n.type===1?p=new n.ctor(i,n.name,n.strings,this,e):n.type===6&&(p=new Ke(i,this,e)),this._$AV.push(p),n=s[++c]}a!==(n==null?void 0:n.index)&&(i=_.nextNode(),a++)}return _.currentNode=A,o}p(e){let t=0;for(const s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(e,s,t),t+=s.strings.length-2):s._$AI(e[t])),t++}}class U{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,s,o){this.type=2,this._$AH=m,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=s,this.options=o,this._$Cv=(o==null?void 0:o.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=E(this,e,t),R(e)?e===m||e==null||e===""?(this._$AH!==m&&this._$AR(),this._$AH=m):e!==this._$AH&&e!==S&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Be(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==m&&R(this._$AH)?this._$AA.nextSibling.data=e:this.T(A.createTextNode(e)),this._$AH=e}$(e){var i;const{values:t,_$litType$:s}=e,o=typeof s=="number"?this._$AC(e):(s.el===void 0&&(s.el=N.createElement(Ae(s.h,s.h[0]),this.options)),s);if(((i=this._$AH)==null?void 0:i._$AD)===o)this._$AH.p(t);else{const a=new Ve(o,this),c=a.u(this.options);a.p(t),this.T(c),this._$AH=a}}_$AC(e){let t=be.get(e.strings);return t===void 0&&be.set(e.strings,t=new N(e)),t}k(e){ae(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let s,o=0;for(const i of e)o===t.length?t.push(s=new U(this.O(I()),this.O(I()),this,this.options)):s=t[o],s._$AI(i),o++;o<t.length&&(this._$AR(s&&s._$AB.nextSibling,o),t.length=o)}_$AR(e=this._$AA.nextSibling,t){var s;for((s=this._$AP)==null?void 0:s.call(this,!1,!0,t);e!==this._$AB;){const o=pe(e).nextSibling;pe(e).remove(),e=o}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class q{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,s,o,i){this.type=1,this._$AH=m,this._$AN=void 0,this.element=e,this.name=t,this._$AM=o,this.options=i,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=m}_$AI(e,t=this,s,o){const i=this.strings;let a=!1;if(i===void 0)e=E(this,e,t,0),a=!R(e)||e!==this._$AH&&e!==S,a&&(this._$AH=e);else{const c=e;let n,p;for(e=i[0],n=0;n<i.length-1;n++)p=E(this,c[s+n],t,n),p===S&&(p=this._$AH[n]),a||(a=!R(p)||p!==this._$AH[n]),p===m?e=m:e!==m&&(e+=(p??"")+i[n+1]),this._$AH[n]=p}a&&!o&&this.j(e)}j(e){e===m?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class qe extends q{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===m?void 0:e}}class Ye extends q{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==m)}}class Fe extends q{constructor(e,t,s,o,i){super(e,t,s,o,i),this.type=5}_$AI(e,t=this){if((e=E(this,e,t,0)??m)===S)return;const s=this._$AH,o=e===m&&s!==m||e.capture!==s.capture||e.once!==s.once||e.passive!==s.passive,i=e!==m&&(s===m||o);o&&this.element.removeEventListener(this.name,this,s),i&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class Ke{constructor(e,t,s){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(e){E(this,e)}}const X=z.litHtmlPolyfillSupport;X==null||X(N,U),(z.litHtmlVersions??(z.litHtmlVersions=[])).push("3.3.2");const Ce=(r,e,t)=>{const s=(t==null?void 0:t.renderBefore)??e;let o=s._$litPart$;if(o===void 0){const i=(t==null?void 0:t.renderBefore)??null;s._$litPart$=o=new U(e.insertBefore(I(),i),i,void 0,t??{})}return o._$AI(r),o};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const P=globalThis;class f extends C{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ce(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return S}}var xe;f._$litElement$=!0,f.finalized=!0,(xe=P.litElementHydrateSupport)==null||xe.call(P,{LitElement:f});const Z=P.litElementPolyfillSupport;Z==null||Z({LitElement:f});(P.litElementVersions??(P.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const b=r=>(e,t)=>{t!==void 0?t.addInitializer(()=>{customElements.define(r,e)}):customElements.define(r,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Xe={attribute:!0,type:String,converter:D,reflect:!1,hasChanged:ie},Ze=(r=Xe,e,t)=>{const{kind:s,metadata:o}=t;let i=globalThis.litPropertyMetadata.get(o);if(i===void 0&&globalThis.litPropertyMetadata.set(o,i=new Map),s==="setter"&&((r=Object.create(r)).wrapped=!0),i.set(t.name,r),s==="accessor"){const{name:a}=t;return{set(c){const n=e.get.call(this);e.set.call(this,c),this.requestUpdate(a,n,r,!0,c)},init(c){return c!==void 0&&this.C(a,void 0,r,c),c}}}if(s==="setter"){const{name:a}=t;return function(c){const n=this[a];e.call(this,c),this.requestUpdate(a,n,r,!0,c)}}throw Error("Unsupported decorator location: "+s)};function Qe(r){return(e,t)=>typeof t=="object"?Ze(r,e,t):((s,o,i)=>{const a=o.hasOwnProperty(i);return o.constructor.createProperty(i,s),a?Object.getOwnPropertyDescriptor(o,i):void 0})(r,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function k(r){return Qe({...r,state:!0,attribute:!1})}const et={common:{getStarted:"开始使用",learnMore:"了解更多",viewOnGithub:"GitHub 仓库"},navbar:{links:{features:"功能",runtime:"运行时",ecosystem:"生态",gateway:"网关",workflow:"工作流",extensions:"扩展",comparison:"对比"},cta:"开始使用"},hero:{badge:"持续进化的 Pi Runtime",title:{part1:"把 AI 编程变成",accent:"可编程系统",part2:""},description:"Pi 不只是聊天窗口：它把代码检索、上下文 checkpoint、角色记忆、原生 GAPP 界面、Provider 可观测性和 Gateway 编排放进同一个可扩展运行时。",cta:{primary:"开始使用",secondary:"阅读文档"},stats:{commands:"持久上下文",extensions:"原生生成式 UI",productivity:"端到端可观测"}},features:{label:"运行时能力",title:"从上下文到交付，一条可观察链路",subtitle:"检索真实代码路径，保存可恢复上下文，用扩展和 GAPP 增强交互，并把验证证据留在同一会话里。",workflow:{title:"证据驱动工作流",desc:"先定位真实实现，再形成计划、执行最小修改、运行验证并交付证据；流程随任务复杂度伸缩，而不是固定阶段表演。",features:["先读真实调用链，再动代码","checkpoint / compact 保留关键上下文","测试、diff、状态一起验证","工具与扩展按任务动态组合"],metrics:{tasks:"上下文标记",success:"工作树状态",active:"Provider 追踪"}},skills:{title:"按需技能与工具",desc:"语义检索、AST、浏览器、设计、诊断、文档与自动化能力按任务加载。",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"角色与长期记忆",desc:"角色配置、记忆检索与 viewer 贯穿会话，而不是每次从零开始。",agents:["角色","记忆","召回","整理","导出","Viewer","标签","向量","场景","提示","服务","适配"]},search:{title:"代码搜索",desc:"自然语言到精确位置。三层搜索，零遗漏。",example:'pi /search "认证中间件"'},gateway:{title:"多通道网关",desc:"一个服务支持 Telegram、Discord、WebChat、OpenAI API。",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"网关",title:"把 Pi 运行时分发到更多入口",subtitle:"Gateway 用 RPC worker pool、会话路由和插件管线把同一套 Pi 能力接到 Web、API 与消息通道，同时保持 worker 启动可控。",layers:{channels:{title:"通道",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"管线",desc:"分发 → 去重 → 解析 → 处理"},plugins:{title:"插件",desc:"16 钩子 · 注册表 · 冲突检测"},runtime:{title:"运行时",desc:"RPC 池 · 路由 · 定时 · 事件"},security:{title:"安全",desc:"认证 · 执行守卫 · SSRF · 白名单"}}},workflow:{label:"工作流",title:"证据驱动的工程闭环",subtitle:"不是固定五阶段，而是围绕真实代码、可恢复上下文和可复现验证形成闭环。",phases:[{num:"01",title:"定位",desc:"语义检索、精确匹配、调用链"},{num:"02",title:"建模",desc:"理解约束、选择最小改动面"},{num:"03",title:"保存",desc:"checkpoint、tag、compact 关键上下文"},{num:"04",title:"执行",desc:"精准编辑、扩展工具、GAPP 交互"},{num:"05",title:"验证",desc:"测试、diff、状态与可观测证据"}]},extensions:{label:"扩展",title:"无限扩展",subtitle:"从 CLI 命令到 TUI 组件，从网关插件到定时任务。",categories:{commands:{title:"命令",desc:"斜杠命令和快捷键"},tools:{title:"工具",desc:"可复用能力"},gateway:{title:"网关",desc:"通道集成"}}},comparison:{label:"对比",title:"不把 Agent 当一次性聊天",subtitle:"Pi 的差异在运行时：上下文能恢复、能力能扩展、行为能观察、界面能生成。",headers:{feature:"能力",pi:"Pi Agent",others:"典型工具"},rows:[{feature:"上下文生命周期",pi:"checkpoint + tag + compact",others:"会话即上下文"},{feature:"代码定位",pi:"语义 + 精确 + AST",others:"基础搜索"},{feature:"交互表面",pi:"TUI + Web + GAPP",others:"单一聊天界面"},{feature:"长期记忆",pi:"角色记忆 + 检索 + viewer",others:"临时提示词"},{feature:"可观测与分发",pi:"Provider Trace + Gateway/RPC",others:"单一接口"}]},cta:{title:"把你的 Pi 变成自己的工程系统",subtitle:"从一个可工作的 coding agent 开始，再按项目需要接入记忆、GAPP、可观测性与网关。",button:"开始使用"},footer:{tagline:"工程级 AI 编排。",links:{docs:"文档",github:"GitHub",discord:"Discord"},copyright:"精准构建。"}},tt={common:{getStarted:"Get Started",learnMore:"Learn More",viewOnGithub:"View on GitHub"},navbar:{links:{features:"Features",runtime:"Runtime",ecosystem:"Ecosystem",gateway:"Gateway",workflow:"Workflow",extensions:"Extensions",comparison:"Compare"},cta:"Get Started"},hero:{badge:"Pi Runtime, continuously evolving",title:{part1:"Make AI coding a ",accent:"programmable system",part2:""},description:"Pi is more than a chat surface: code retrieval, context checkpoints, role memory, native GAPP interfaces, provider observability, and gateway orchestration live in one extensible runtime.",cta:{primary:"Get Started",secondary:"Read Docs"},stats:{commands:"Persistent Context",extensions:"Native Generative UI",productivity:"End-to-end Observability"}},features:{label:"Runtime Capabilities",title:"One observable path from context to delivery",subtitle:"Trace real code paths, preserve recoverable context, extend the runtime with tools and GAPPs, and keep verification evidence in the same session.",workflow:{title:"Evidence-driven workflow",desc:"Locate the real implementation, model constraints, make the smallest change, verify it, and ship evidence. The loop scales with the task instead of enforcing ceremony.",features:["Read the real call path before editing","Checkpoint / compact critical context","Verify tests, diff, and worktree state together","Compose tools and extensions per task"],metrics:{tasks:"Context Tag",success:"Worktree State",active:"Provider Trace"}},skills:{title:"On-demand skills & tools",desc:"Semantic retrieval, AST, browser, design, diagnosis, docs, and automation capabilities load for the task at hand.",tags:["ace-tool","ast-grep","codemap","web-browser","diagnose"]},subagents:{title:"Roles & durable memory",desc:"Role configuration, memory retrieval, and a viewer carry knowledge across sessions instead of starting from zero.",agents:["role","memory","recall","organize","export","viewer","tags","vector","scenarios","prompt","service","adapter"]},search:{title:"Code Search",desc:"Natural language to exact location. Three layers, zero misses.",example:'pi /search "auth middleware"'},gateway:{title:"Multi-Channel Gateway",desc:"One service for Telegram, Discord, WebChat, OpenAI API.",code:"await gateway.route({ channel: 'telegram', session: uuid() });"}},gateway:{label:"Gateway",title:"Distribute the Pi runtime beyond the terminal",subtitle:"Gateway uses an RPC worker pool, session routing, and a programmable plugin pipeline to expose the same Pi capabilities through Web, APIs, and messaging channels.",layers:{channels:{title:"Channels",desc:"Telegram · Discord · WebChat · API"},pipeline:{title:"Pipeline",desc:"Dispatch → Dedup → Resolve → Process"},plugins:{title:"Plugins",desc:"16 Hooks · Registry · Conflicts"},runtime:{title:"Runtime",desc:"RPC Pool · Router · Cron · Events"},security:{title:"Security",desc:"Auth · ExecGuard · SSRF · Allowlist"}}},workflow:{label:"Workflow",title:"An evidence-driven engineering loop",subtitle:"Not a mandatory five-step ritual: a loop around real code, recoverable context, precise edits, and reproducible verification.",phases:[{num:"01",title:"Locate",desc:"Semantic retrieval, exact match, call paths"},{num:"02",title:"Model",desc:"Understand constraints, choose the smallest surface"},{num:"03",title:"Preserve",desc:"Checkpoint, tag, and compact critical context"},{num:"04",title:"Execute",desc:"Surgical edits, extension tools, GAPP interaction"},{num:"05",title:"Verify",desc:"Tests, diff, state, and observable evidence"}]},extensions:{label:"Extensions",title:"Infinite Extensibility",subtitle:"From CLI commands to TUI components, from gateway plugins to cron jobs.",categories:{commands:{title:"Commands",desc:"Slash commands and shortcuts"},tools:{title:"Tools",desc:"Reusable capabilities"},gateway:{title:"Gateway",desc:"Channel integrations"}}},comparison:{label:"Comparison",title:"An agent runtime, not disposable chat",subtitle:"Pi differs at the runtime layer: context can recover, capabilities can extend, behavior can be observed, and interfaces can be generated.",headers:{feature:"Capability",pi:"Pi Agent",others:"Typical Tools"},rows:[{feature:"Context lifecycle",pi:"checkpoint + tag + compact",others:"session-only context"},{feature:"Code location",pi:"semantic + exact + AST",others:"basic search"},{feature:"Interaction surface",pi:"TUI + Web + GAPP",others:"single chat surface"},{feature:"Durable memory",pi:"role memory + retrieval + viewer",others:"temporary prompts"},{feature:"Observe & distribute",pi:"Provider Trace + Gateway/RPC",others:"single interface"}]},cta:{title:"Turn Pi into your engineering system",subtitle:"Start with a working coding agent, then add memory, GAPPs, observability, and gateway capabilities as your project needs them.",button:"Get Started"},footer:{tagline:"Engineering-grade AI orchestration.",links:{docs:"Documentation",github:"GitHub",discord:"Discord"},copyright:"Built with precision."}},Q={"zh-CN":et,"en-US":tt},ve="pi-agent-locale";class rt{constructor(){this.currentLocale="en-US",this.listeners=new Set,this.detectLocale()}detectLocale(){try{const t=localStorage.getItem(ve);if(t&&Q[t]){this.currentLocale=t;return}}catch{}(navigator.language||"").startsWith("zh")&&(this.currentLocale="zh-CN")}getCurrentLocale(){return this.currentLocale}setLocale(e){if(Q[e]&&e!==this.currentLocale){this.currentLocale=e;try{localStorage.setItem(ve,e)}catch{}document.documentElement.lang=e==="zh-CN"?"zh-CN":"en",this.listeners.forEach(t=>t())}}t(e){const t=e.split(".");let s=Q[this.currentLocale];for(const o of t)if(s&&typeof s=="object"&&o in s)s=s[o];else return e;return typeof s=="string"?s:e}subscribe(e){return this.listeners.add(e),()=>{this.listeners.delete(e)}}getAvailableLocales(){return[{code:"en-US",label:"EN"},{code:"zh-CN",label:"中文"}]}}const d=new rt;var ot=Object.defineProperty,st=Object.getOwnPropertyDescriptor,Y=(r,e,t,s)=>{for(var o=s>1?void 0:s?st(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&ot(e,t,o),o};const ye=[{key:"features",id:"features"},{key:"runtime",id:"runtime"},{key:"ecosystem",id:"ecosystem"},{key:"extensions",id:"extensions"},{key:"comparison",id:"comparison"}],ee="https://github.com/Dwsy/agent";let O=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale(),this.menuOpen=!1,this.activeId="",this._ghIcon=h`<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>`,this._burgerIcon=h`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${this.menuOpen?h`<path d="M18 6L6 18M6 6l12 12"/>`:h`<path d="M4 8h16M4 12h16M4 16h16"/>`}
  </svg>`}connectedCallback(){super.connectedCallback(),this._unsub=d.subscribe(()=>{this.locale=d.getCurrentLocale()}),this._setupScrollSpy(),this._scrollHandler=()=>{this.toggleAttribute("scrolled",window.scrollY>20)},window.addEventListener("scroll",this._scrollHandler,{passive:!0})}disconnectedCallback(){var r,e;super.disconnectedCallback(),(r=this._unsub)==null||r.call(this),(e=this._io)==null||e.disconnect(),this._scrollHandler&&window.removeEventListener("scroll",this._scrollHandler)}_setupScrollSpy(){const r=new Map;this._io=new IntersectionObserver(e=>{for(const o of e)o.isIntersecting?r.set(o.target.id,o.intersectionRatio):r.delete(o.target.id);let t="",s=0;r.forEach((o,i)=>{o>s&&(s=o,t=i)}),t!==this.activeId&&(this.activeId=t)},{threshold:[0,.25,.5],rootMargin:"-80px 0px -40% 0px"}),requestAnimationFrame(()=>{for(const e of ye){const t=document.getElementById(e.id);t&&this._io.observe(t)}})}t(r){return d.t(r)}_toggleLocale(){d.setLocale(this.locale==="zh-CN"?"en-US":"zh-CN")}_toggleMenu(){this.menuOpen=!this.menuOpen}_closeMenu(){this.menuOpen=!1}render(){const r=ye.map(e=>({id:e.id,label:this.t(`navbar.links.${e.key}`)}));return h`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-mark">π</div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="links">
          ${r.map(e=>h`
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
        ${r.map(e=>h`
          <a href="#${e.id}" class="m-link" ?active=${this.activeId===e.id} @click=${this._closeMenu}>
            ${e.label}
          </a>
        `)}
        <a href=${ee} class="m-link" @click=${this._closeMenu}>${this.t("navbar.cta")}</a>
      </div>
    `}};O.styles=x`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 1000;
      width: 100%;
      padding: 0.75rem 1.5rem;
      background: rgba(9, 9, 11, 0.72);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
    @media (prefers-color-scheme: light) {
      :host { background: rgba(255,255,255,0.9); border-bottom-color: #e4e4e7; }
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
  `;Y([k()],O.prototype,"locale",2);Y([k()],O.prototype,"menuOpen",2);Y([k()],O.prototype,"activeId",2);O=Y([b("pi-navbar")],O);var it=Object.defineProperty,at=Object.getOwnPropertyDescriptor,Se=(r,e,t,s)=>{for(var o=s>1?void 0:s?at(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&it(e,t,o),o};let j=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var r;super.disconnectedCallback(),(r=this.unsubscribe)==null||r.call(this)}render(){const r=this.locale==="zh-CN";return h`
      <section class="hero" id="features">
        <div class="bento">
          <article class="tile main">
            <div class="badge">${r?"可编程 Agent Runtime":"Programmable agent runtime"}</div>
            <h1>${r?h`把 AI 编程变成 <span class="accent">可编程系统</span>`:h`Make AI coding a <span class="accent">programmable system</span>`}</h1>
            <p class="description">${r?"不是聊天壳。Pi 把真实代码检索、可恢复上下文、角色长期记忆、原生 GAPP、Provider 可观测性与 Gateway/RPC 编排放进同一个运行时。":"Not a chat shell. Pi puts real code retrieval, recoverable context, durable role memory, native GAPPs, provider observability, and Gateway/RPC orchestration in one runtime."}</p>
            <div class="actions"><a class="action primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${r?"开始使用":"Get started"} ↗</a><a class="action" href="https://github.com/Dwsy/agent#readme" target="_blank" rel="noopener">${r?"阅读文档":"Read docs"}</a></div>
            <div class="main-foot"><div><strong>Context</strong>tag · checkout · compact</div><div><strong>Protocol</strong>L1–L4 complexity routing</div><div><strong>Verify</strong>test · diff · worktree</div></div>
          </article>

          <article class="tile feature context"><div><div class="eyebrow">01 / Context</div><h2>${r?"上下文像 Git 一样可操作":"Operate context like Git"}</h2><p>${r?"给关键语义状态打 tag、查看 history、checkout 回任意 checkpoint；长会话 compact 后仍保留任务 handoff。":"Tag semantic states, inspect history, checkout any checkpoint, and keep the task handoff intact after long-session compaction."}</p></div><div class="tokens"><span class="token hot">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></article>

          <article class="tile feature trace"><div><div class="eyebrow">02 / Observe</div><h2>Provider Trace</h2><p>${r?"观察 provider 请求/响应、模型路由与失败链路，再把测试、diff、worktree 状态接到同一条证据链。":"Inspect provider requests/responses, model routing, and failure paths, then connect tests, diff, and worktree state to the same evidence trail."}</p></div><div class="tokens"><span class="token hot">trace</span><span class="token">insights</span><span class="token">verify</span></div></article>

          <article class="tile gapp"><div class="gapp-copy"><div><div class="eyebrow">03 / Native UI</div><h2>${r?"GAPP：Agent 原生生成交互界面":"GAPP: agent-native interactive UI"}</h2><p>${r?"不是把结果塞回聊天气泡；项目图、diff、状态和操作可以直接成为会话的一部分。":"Not another chat bubble. Project maps, diffs, live state, and actions can become part of the session itself."}</p></div><div class="tokens"><span class="token hot">project map</span><span class="token">diff</span><span class="token">live state</span></div></div><div class="gapp-stage"><div class="gapp-nav"><strong>PROJECT MAP</strong>src/<br>extensions/<br>gateway/<br>roles/</div><div class="gapp-canvas"><div class="gapp-node hot">context<br>checkpoint</div><div class="gapp-node">provider<br>trace</div><div class="gapp-node">role<br>memory</div><div class="gapp-node hot">gateway<br>RPC</div></div></div></article>

          <article class="tile evidence"><div class="evidence-label">Evidence rail</div><div class="evidence-flow"><div class="evidence-step"><strong>Locate</strong><span>semantic · AST</span></div><div class="evidence-step"><strong>Model</strong><span>callers · constraints</span></div><div class="evidence-step"><strong>Preserve</strong><span>tag · compact</span></div><div class="evidence-step"><strong>Execute</strong><span>edit · GAPP</span></div><div class="evidence-step"><strong>Verify</strong><span>test · diff · state</span></div></div></article>

          <article class="tile mini role"><div class="mark">Memory</div><strong>${r?"角色长期记忆":"Durable role memory"}</strong><span>${r?"workspace→role · daily→pending→knowledge · 向量召回 · viewer":"workspace→role · daily→pending→knowledge · vector recall · viewer"}</span></article>
          <article class="tile mini gateway"><div class="mark">Gateway</div><strong>Gateway / RPC</strong><span>${"session-aware routing · RPC worker pool · WebSocket/HTTP · offline-safe"}</span></article>
          <article class="tile mini extensions"><div class="mark">Extend</div><strong>${r?"扩展 / Skill / GAPP":"Extensions / Skills / GAPP"}</strong><span>${r?"ace-tool · AST · browser · diagnose · 自定义工具与交互面":"ace-tool · AST · browser · diagnose · custom tools and UI surfaces"}</span></article>
          <article class="tile mini companions"><div class="mark">Companion</div><strong>grok-pi-tui + PSM</strong><span>${r?"Grok Pager 原生终端 · Session 搜索/树/Kanban · resume/export":"Grok Pager native TUI · session search/tree/Kanban · resume/export"}</span></article>
        </div>
      </section>
    `}};j.styles=x`
    *, *::before, *::after { box-sizing: border-box; }
    :host { display: block; width: 100%; }
    .hero { min-height: calc(100dvh - 4.5rem); padding: 1.25rem 1.5rem 2rem; background: #09090b; }
    .bento { max-width: 1200px; height: calc(100dvh - 7.25rem); min-height: 650px; max-height: 820px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); gap: 0.75rem; }
    .tile { min-width: 0; overflow: hidden; border: 1px solid #27272a; border-radius: 0.7rem; background: #111113; }
    .main { grid-column: 1 / 8; grid-row: 1 / 6; padding: clamp(2rem, 4vw, 4rem); display: flex; flex-direction: column; justify-content: center; background: #0c0c0e; }
    .context { grid-column: 8 / 11; grid-row: 1 / 3; }
    .trace { grid-column: 11 / 13; grid-row: 1 / 3; }
    .gapp { grid-column: 8 / 13; grid-row: 3 / 5; background: #151517; border-color: #27272a; }
    .evidence { grid-column: 8 / 13; grid-row: 5 / 6; background: #151517; border-color: #27272a; }
    .role { grid-column: 1 / 4; grid-row: 6; }
    .gateway { grid-column: 4 / 7; grid-row: 6; }
    .extensions { grid-column: 7 / 10; grid-row: 6; }
    .companions { grid-column: 10 / 13; grid-row: 6; }

    .badge { display: inline-flex; align-items: center; gap: 0.5rem; width: fit-content; margin-bottom: 1.4rem; color: #34d399; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; }
    .badge::before { content: ''; width: 1.5rem; height: 1px; background: #10b981; }
    h1 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(3rem, 5.5vw, 5.25rem); line-height: 0.98; letter-spacing: -0.055em; font-weight: 650; max-width: 10ch; }
    h1 .accent { color: #10b981; }
    .description { margin: 0 0 1.75rem; max-width: 52ch; color: #a1a1aa; font-size: 1rem; line-height: 1.7; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .action { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; border: 1px solid #3f3f46; color: #d4d4d8; text-decoration: none; font-size: 0.82rem; font-weight: 600; }
    .action.primary { background: #10b981; border-color: #10b981; color: #07110d; }
    .action:hover { border-color: #71717a; color: #fafafa; }
    .action.primary:hover { background: #34d399; color: #07110d; }
    .action:focus-visible { outline: 2px solid #10b981; outline-offset: 3px; }
    .main-foot { margin-top: auto; padding-top: 1.5rem; display: flex; gap: 1.5rem; border-top: 1px solid #27272a; color: #52525b; font: 0.68rem/1.4 'JetBrains Mono', monospace; }
    .main-foot strong { display: block; color: #a1a1aa; font-weight: 500; margin-bottom: 0.2rem; }

    .gapp { padding: 1rem; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 1rem; align-items: stretch; }
    .gapp-copy { display: flex; flex-direction: column; justify-content: space-between; padding: 0.25rem; }
    .gapp-copy .eyebrow { color: #34d399; }
    .gapp-copy h2 { margin: 0.55rem 0 0.45rem; color: #f4f4f5; font-size: 1.15rem; line-height: 1.15; }
    .gapp-copy p { margin: 0; color: #71717a; font-size: 0.7rem; line-height: 1.5; }
    .gapp-stage { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 0.45rem; padding: 0.45rem; border: 1px solid #27272a; background: #0c0c0e; }
    .gapp-nav { padding: 0.55rem; border-right: 1px solid #27272a; color: #52525b; font: 0.58rem/1.8 'JetBrains Mono', monospace; }
    .gapp-nav strong { display: block; color: #34d399; font-weight: 500; }
    .gapp-canvas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
    .gapp-node { min-height: 2.5rem; padding: 0.45rem; border: 1px solid #2f2f33; color: #71717a; font: 0.55rem/1.35 'JetBrains Mono', monospace; }
    .gapp-node.hot { color: #d4d4d8; border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.06); }

    .feature { padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { color: #52525b; font: 0.62rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .feature h2 { margin: 0.65rem 0 0.4rem; color: #f4f4f5; font-size: 1rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; }
    .feature p { margin: 0; color: #71717a; font-size: 0.72rem; line-height: 1.5; }
    .tokens { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.8rem; }
    .token { color: #71717a; font: 0.61rem/1 'JetBrains Mono', monospace; border-bottom: 1px solid #3f3f46; padding-bottom: 0.2rem; }
    .token.hot { color: #34d399; border-color: rgba(52,211,153,0.5); }

    .evidence { padding: 0.8rem 1rem; display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center; }
    .evidence-label { color: #34d399; font: 0.62rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
    .evidence-flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
    .evidence-step { min-width: 0; padding-left: 0.6rem; border-left: 1px solid #3f3f46; }
    .evidence-step strong { display: block; color: #d4d4d8; font-size: 0.66rem; font-weight: 600; margin-bottom: 0.15rem; }
    .evidence-step span { color: #52525b; font: 0.56rem/1.3 'JetBrains Mono', monospace; }

    .mini { padding: 0.8rem 0.9rem; display: flex; flex-direction: column; justify-content: center; }
    .mini strong { color: #e4e4e7; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.3rem; }
    .mini span { color: #52525b; font-size: 0.64rem; line-height: 1.4; }
    .mini .mark { color: #10b981; font: 0.58rem/1 'JetBrains Mono', monospace; margin-bottom: 0.45rem; text-transform: uppercase; letter-spacing: 0.05em; }

    @media (prefers-color-scheme: light) {
      .hero { background: #ffffff; }
      .tile { border-color: #e4e4e7; background: #fafafa; }
      .main { background: #ffffff; }
      h1 { color: #18181b; }
      .description { color: #52525b; }
      .action { color: #3f3f46; border-color: #d4d4d8; background: #ffffff; }
      .action:hover { color: #18181b; border-color: #a1a1aa; }
      .main-foot { border-color: #e4e4e7; color: #71717a; }
      .main-foot strong { color: #3f3f46; }
      .context { background: #f0fdf4; border-color: #bbf7d0; }
      .trace { background: #eff6ff; border-color: #bfdbfe; }
      .gapp { background: #ecfdf5; border-color: #a7f3d0; }
      .gapp-copy .eyebrow { color: #047857; }
      .gapp-copy h2 { color: #064e3b; }
      .gapp-copy p { color: #475569; }
      .gapp-stage { background: #ffffff; border-color: #a7f3d0; }
      .gapp-nav { border-color: #d1fae5; color: #64748b; }
      .gapp-nav strong { color: #047857; }
      .gapp-node { background: #f8fafc; border-color: #dbe4ea; color: #64748b; }
      .gapp-node.hot { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
      .evidence { background: #eff6ff; border-color: #bfdbfe; }
      .evidence-label { color: #2563eb; }
      .evidence-step { border-color: #bfdbfe; }
      .evidence-step strong { color: #1e3a8a; }
      .evidence-step span { color: #64748b; }
      .role { background: #fff7ed; border-color: #fed7aa; }
      .gateway { background: #f5f3ff; border-color: #ddd6fe; }
      .extensions { background: #f0fdfa; border-color: #99f6e4; }
      .companions { background: #fdf4ff; border-color: #f5d0fe; }
      .feature h2, .mini strong { color: #18181b; }
      .feature p, .mini span, .eyebrow { color: #52525b; }
      .token { color: #475569; border-color: #cbd5e1; }
      .token.hot, .mini .mark { color: #047857; border-color: rgba(4,120,87,0.35); }
    }

    @media (max-width: 1000px) {
      .hero { min-height: auto; }
      .bento { height: auto; min-height: 0; max-height: none; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; }
      .main, .context, .trace, .gapp, .evidence, .role, .gateway, .extensions, .companions { grid-column: auto; grid-row: auto; }
      .main { grid-column: 1 / -1; min-height: 32rem; }
      .context, .trace { min-height: 14rem; }
      .gapp { min-height: 18rem; }
      .evidence { min-height: 8rem; }
      .role, .gateway, .extensions, .companions { min-height: 8rem; }
    }

    @media (max-width: 640px) {
      .hero { padding: 0.75rem 1rem 1.5rem; }
      .bento { grid-template-columns: 1fr; gap: 0.6rem; }
      .main { min-height: 30rem; padding: 2rem 1.5rem; }
      h1 { font-size: clamp(2.75rem, 14vw, 4rem); }
      .context, .trace, .gapp, .evidence, .role, .gateway, .extensions, .companions { grid-column: 1; min-height: auto; }
      .gapp { grid-template-columns: 1fr; min-height: 18rem; }
      .feature { min-height: 12rem; }
      .evidence { grid-template-columns: 1fr; min-height: 10rem; }
      .evidence-flow { grid-template-columns: 1fr 1fr; }
      .mini { min-height: 7rem; }
      .main-foot { gap: 0.75rem; flex-wrap: wrap; }
    }
  `;Se([k()],j.prototype,"locale",2);j=Se([b("hero-section")],j);var nt=Object.defineProperty,ct=Object.getOwnPropertyDescriptor,Ee=(r,e,t,s)=>{for(var o=s>1?void 0:s?ct(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&nt(e,t,o),o};let B=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var r;super.disconnectedCallback(),(r=this.unsubscribe)==null||r.call(this)}render(){const r=this.locale==="zh-CN";return h`
      <section class="scene" id="runtime">
        <div class="inner">
          <div class="intro">
            <div class="kicker">${"PI RUNTIME SYSTEM"}</div>
            <h2>${r?"不是一条流水线，是一个可恢复的运行系统":"Not a pipeline. A recoverable runtime system."}</h2>
            <p class="lead">${r?"Pi 把代码定位、上下文生命周期、角色记忆、Gateway 分发和 Provider 可观测性放在同一个工程闭环里。每一层都能独立工作，也能在同一会话中组合。":"Pi connects code location, context lifecycle, role memory, gateway distribution, and provider observability into one engineering loop. Each layer works independently and composes inside the same session."}</p>
            <div class="principle"><strong>${r?"工程协议":"Engineering protocol"}</strong><br>${r?"L1–L4 按复杂度路由；先读真实实现，再做最小修改，最后用测试、diff 与状态交付证据。":"Route by L1–L4 complexity; read the real implementation first, make the smallest change, then ship tests, diff, and state as evidence."}</div>
          </div>

          <div class="system">
            <article class="module active">
              <div class="index">01 / context</div>
              <div class="body"><h3>${r?"上下文像 Git 一样可操作":"Context you can operate like Git"}</h3><p>${r?"关键状态可 tag、查看 history、checkout 语义节点；长会话通过 compact 保存 handoff，而不是把全部历史无限塞进窗口。":"Tag important states, inspect history, checkout semantic points, and compact long sessions while preserving the handoff instead of endlessly stuffing history into the window."}</p><div class="tokens"><span class="token green">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></div>
            </article>
            <article class="module">
              <div class="index">02 / role memory</div>
              <div class="body"><h3>${r?"角色、记忆与知识分层":"Role-scoped memory and knowledge"}</h3><p>${r?"工作目录自动映射角色；短期 session context 与长期 memory 分离，经验沿 daily → pending → consolidated / knowledge 晋升，并支持向量召回与 viewer。":"Workspace paths map to roles automatically. Short-term session context stays separate from durable memory; experience promotes through daily → pending → consolidated / knowledge with vector recall and a viewer."}</p><div class="tokens"><span class="token">role mapping</span><span class="token green">memory.search</span><span class="token">LanceDB</span><span class="token">viewer</span></div></div>
            </article>
            <article class="module">
              <div class="index">03 / gateway</div>
              <div class="body"><h3>${r?"同一个 Pi，分发到更多入口":"One Pi runtime, more entry points"}</h3><p>${r?"Gateway 用 session-aware routing、RPC worker pool 和插件管线把 Pi 接到 Web、API 与消息通道；worker 启动不依赖在线 provider。":"Gateway uses session-aware routing, an RPC worker pool, and a plugin pipeline to expose Pi through Web, APIs, and messaging channels, with network-safe worker startup."}</p><div class="tokens"><span class="token">WebSocket</span><span class="token">HTTP</span><span class="token green">RPC pool</span><span class="token">offline-safe</span></div></div>
            </article>
            <article class="module">
              <div class="index">04 / observe + verify</div>
              <div class="body"><h3>${r?"从 Provider 到工作树都留下证据":"Evidence from provider to worktree"}</h3><p>${r?"Provider Trace 观察请求与响应链路；工程闭环则把 locate → model → preserve → execute → verify 连接起来，最终检查测试、diff 与 worktree 状态。":"Provider Trace observes request/response paths while the engineering loop connects locate → model → preserve → execute → verify, ending with tests, diff, and worktree state."}</p><div class="flow"><div class="flow-step"><strong>Locate</strong>semantic · exact · AST</div><div class="flow-step"><strong>Model</strong>callers · constraints</div><div class="flow-step"><strong>Preserve</strong>tag · compact</div><div class="flow-step"><strong>Execute</strong>edit · GAPP</div><div class="flow-step"><strong>Verify</strong>test · diff · state</div></div></div>
            </article>
          </div>
        </div>
      </section>
    `}};B.styles=x`
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

    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2, .body h3 { color: #18181b; }
      .lead, .body p, .principle { color: #52525b; }
      .principle, .system, .body { border-color: #e4e4e7; }
      .principle strong, .flow-step strong { color: #27272a; }
      .module::before { background: #f7f7f5; border-color: #a1a1aa; }
      .token { background: #ffffff; border-color: #e4e4e7; color: #52525b; }
      .token.green { color: #047857; background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.18); }
      .flow-step { border-color: #d4d4d8; color: #71717a; }
    }
    @media (max-width: 900px) { .inner { grid-template-columns: 1fr; gap: 3rem; } .intro { position: static; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .module { grid-template-columns: 1fr; gap: 0.75rem; padding-left: 1.5rem; } .flow { grid-template-columns: 1fr 1fr; } }
  `;Ee([k()],B.prototype,"locale",2);B=Ee([b("runtime-system-scene")],B);var lt=Object.defineProperty,dt=Object.getOwnPropertyDescriptor,Oe=(r,e,t,s)=>{for(var o=s>1?void 0:s?dt(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&lt(e,t,o),o};let W=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var r;super.disconnectedCallback(),(r=this.unsubscribe)==null||r.call(this)}render(){const r=this.locale==="zh-CN";return h`
      <section class="scene" id="ecosystem">
        <div class="inner">
          <div class="intro">
            <div class="kicker">COMPANION ECOSYSTEM</div>
            <h2>${r?"核心保持单一，边界向外延伸":"One core. Clear extensions around it."}</h2>
            <p>${r?"Pi 仍然是 Agent Runtime。配套产品只在明确边界上增强它：一个负责终端交互，一个负责跨会话连续性。":"Pi remains the agent runtime. Companion products extend it only at explicit boundaries: one owns terminal interaction, the other owns cross-session continuity."}</p>
          </div>

          <div class="map">
            <div class="core">Pi<br>Core</div>

            <article class="lane">
              <div class="lane-meta"><span class="lane-name">grok-pi-tui</span><span class="lane-role">${r?"交互面":"interaction surface"}</span></div>
              <h3>${r?"把 Pi 投射到 Grok Build 原生 Pager":"Project Pi into Grok Build's native Pager"}</h3>
              <p>${r?"Pi 保留模型、Provider、工具、扩展、Skill、Session 与执行；Grok Pager 成为唯一终端 UI。Remote TUI bridge 只连接能力，不再制造第二套界面。":"Pi keeps models, providers, tools, extensions, skills, sessions, and execution; Grok Pager becomes the only terminal UI. The Remote TUI bridge connects capabilities without inventing a second interface."}</p>
              <div class="capabilities"><span class="cap orange">Pager</span><span class="cap">ACP</span><span class="cap">JSONL RPC</span><span class="cap">Tool cards</span><span class="cap">Diffs</span><span class="cap">Dialogs</span></div>
              <div class="links"><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/grok-pi-tui/" target="_blank" rel="noopener">${r?"项目主页 ↗":"Project site ↗"}</a></div>
            </article>

            <article class="lane">
              <div class="lane-meta"><span class="lane-name">pi-session-manager</span><span class="lane-role">${r?"连续性层":"continuity layer"}</span></div>
              <h3>${r?"把 Agent 留下的 Session 变成工程资产":"Turn agent sessions into engineering artifacts"}</h3>
              <p>${r?"本地索引 Pi 与其他 coding agent 的历史，重建树、Branch Atlas、Tool Trace 和 compaction context，再通过搜索、Kanban、resume / convert / export 把工作继续下去。":"Index Pi and other coding-agent histories locally, reconstruct trees, Branch Atlas, tool traces, and compaction context, then continue work through search, Kanban, resume / convert / export."}</p>
              <div class="capabilities"><span class="cap blue">local-first</span><span class="cap">Pi</span><span class="cap">Claude Code</span><span class="cap">Codex</span><span class="cap">Gemini CLI</span><span class="cap">Cursor</span><span class="cap">Antigravity</span></div>
              <div class="links"><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/pi-session-manager/" target="_blank" rel="noopener">${r?"文档 / Demo ↗":"Docs / demo ↗"}</a></div>
            </article>

            <div class="boundary"><strong>${r?"边界原则：":"Boundary principle: "}</strong>${r?"grok-pi-tui 不接管 Agent Runtime；Pi Session Manager 不变成 Agent GUI。两者都围绕 Pi 工作，而不是把 Pi 包进新的黑盒。":"grok-pi-tui does not take over the agent runtime; Pi Session Manager does not become an agent GUI. Both work around Pi instead of wrapping it in a new black box."}</div>
          </div>
        </div>
      </section>
    `}};W.styles=x`
    :host { display: block; width: 100%; }
    .scene { padding: 8rem 1.5rem; background: #0c0c0e; border-block: 1px solid #18181b; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 5rem; }
    .intro { align-self: start; position: sticky; top: 7rem; }
    .kicker { color: #71717a; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.7rem); line-height: 1.03; letter-spacing: -0.04em; font-weight: 600; }
    .intro p { margin: 0; color: #71717a; line-height: 1.75; max-width: 44ch; }

    .map { position: relative; border-left: 1px solid #3f3f46; }
    .core { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%); width: 5.25rem; height: 5.25rem; display: grid; place-items: center; border-radius: 50%; background: #10b981; color: #07110d; font-size: 0.8rem; font-weight: 700; text-align: center; box-shadow: 0 0 0 10px #0c0c0e; z-index: 2; }
    .lane { position: relative; padding: 0 0 3.25rem 4rem; }
    .lane + .lane { padding-top: 3.25rem; border-top: 1px solid #27272a; }
    .lane::before { content: ''; position: absolute; left: 0; top: 2.25rem; width: 2.5rem; border-top: 1px solid #3f3f46; }
    .lane + .lane::before { top: 5.5rem; }
    .lane-meta { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; margin-bottom: 0.85rem; }
    .lane-name { color: #d4d4d8; font: 0.7rem/1 'JetBrains Mono', monospace; letter-spacing: 0.05em; text-transform: uppercase; }
    .lane-role { color: #52525b; font-size: 0.72rem; }
    .lane h3 { margin: 0 0 0.8rem; color: #fafafa; font-size: 1.65rem; font-weight: 600; letter-spacing: -0.02em; }
    .lane p { margin: 0 0 1.25rem; color: #a1a1aa; font-size: 0.92rem; line-height: 1.7; max-width: 62ch; }
    .capabilities { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.25rem; }
    .cap { padding: 0.35rem 0; margin-right: 0.75rem; color: #71717a; font: 0.67rem/1.2 'JetBrains Mono', monospace; border-bottom: 1px solid #3f3f46; }
    .cap.orange { color: #fb923c; border-color: rgba(249,115,22,0.45); }
    .cap.blue { color: #93c5fd; border-color: rgba(96,165,250,0.45); }
    .links { display: flex; gap: 1rem; flex-wrap: wrap; }
    a { color: #a1a1aa; text-decoration: none; font-size: 0.78rem; font-weight: 600; }
    a:hover { color: #fafafa; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    .boundary { margin-top: 3.25rem; padding: 1.25rem 0 0 4rem; border-top: 1px solid #27272a; color: #52525b; font-size: 0.75rem; line-height: 1.65; }
    .boundary strong { color: #a1a1aa; font-weight: 600; }

    @media (prefers-color-scheme: light) {
      .scene { background: #ffffff; border-color: #e4e4e7; }
      h2, .lane h3 { color: #18181b; }
      .intro p, .lane p { color: #52525b; }
      .map { border-color: #d4d4d8; }
      .core { box-shadow: 0 0 0 10px #ffffff; }
      .lane + .lane, .boundary { border-color: #e4e4e7; }
      .lane::before { border-color: #a1a1aa; }
      .lane-name, .boundary strong { color: #3f3f46; }
      .lane-role, .boundary { color: #71717a; }
      .cap { color: #52525b; border-color: #d4d4d8; }
      .cap.orange { color: #c2410c; border-color: rgba(194,65,12,0.35); }
      .cap.blue { color: #1d4ed8; border-color: rgba(29,78,216,0.3); }
      a { color: #52525b; }
      a:hover { color: #18181b; }
    }

    @media (max-width: 900px) { .inner { grid-template-columns: 1fr; gap: 3rem; } .intro { position: static; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .map { margin-left: 1rem; } .core { top: 0; transform: translate(-50%, -35%); width: 4.25rem; height: 4.25rem; } .lane { padding-left: 2.5rem; } .lane::before { width: 1.5rem; } .boundary { padding-left: 2.5rem; } }
  `;Oe([k()],W.prototype,"locale",2);W=Oe([b("companion-ecosystem-scene")],W);var pt=Object.defineProperty,ht=Object.getOwnPropertyDescriptor,Te=(r,e,t,s)=>{for(var o=s>1?void 0:s?ht(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&pt(e,t,o),o};let J=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this.unsubscribe=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var r;super.disconnectedCallback(),(r=this.unsubscribe)==null||r.call(this)}render(){const r=this.locale==="zh-CN";return h`
      <section class="scene" id="extensions">
        <div class="inner">
          <div class="head"><div class="kicker">EXTEND & PROVE</div><h2>${r?"能力可以扩展，差异必须能解释":"Extend the capability. Prove the difference."}</h2><p>${r?"Pi 的价值不来自固定功能清单，而来自可编程扩展面与可验证运行时。左边是如何接能力，右边是为什么这些能力改变了 Agent 的工作方式。":"Pi's value is not a fixed feature checklist. It comes from a programmable extension surface and a verifiable runtime. The left shows how capability plugs in; the right shows why the runtime changes the way an agent works."}</p></div>
          <div class="layout">
            <div class="extension"><h3>${r?"按任务组合资源":"Compose resources per task"}</h3><p>${r?"扩展、Skill、工具、命令、GAPP 和 Provider 都是运行时资源；需要时加载，不需要时不把复杂度塞进核心。":"Extensions, skills, tools, commands, GAPPs, and providers are runtime resources. Load them when needed instead of baking every capability into the core."}</p><div class="resource-line"><span class="resource hot">ace-tool</span><span class="resource">ast-grep</span><span class="resource">codemap</span><span class="resource">diagnose</span><span class="resource">impeccable</span><span class="resource hot">GAPP</span><span class="resource">provider-trace</span><span class="resource">role-persona</span></div><pre><b>pi</b>.registerTool({
  name: <em>"project_map"</em>,
  execute: async (ctx) => {
    await ctx.ui.custom(...)
  }
})</pre></div>
            <div class="proof" id="comparison"><div class="proof-head"><div class="proof-cell">${r?"能力":"Capability"}</div><div class="proof-cell">Pi Runtime</div><div class="proof-cell">${r?"典型工具":"Typical tools"}</div></div>${(r?[["上下文生命周期","tag + checkout + compact","会话即上下文"],["代码定位","语义 + 精确 + AST","基础搜索"],["交互表面","TUI + Web + GAPP","单一聊天界面"],["长期记忆","角色记忆 + 检索 + viewer","临时提示词"],["可观测与分发","Provider Trace + Gateway/RPC","单一接口"]]:[["Context lifecycle","tag + checkout + compact","session-only context"],["Code location","semantic + exact + AST","basic search"],["Interaction surface","TUI + Web + GAPP","single chat surface"],["Durable memory","role memory + retrieval + viewer","temporary prompts"],["Observe & distribute","Provider Trace + Gateway/RPC","single interface"]]).map(t=>h`<div class="proof-row"><div class="proof-cell">${t[0]}</div><div class="proof-cell pi">${t[1]}</div><div class="proof-cell">${t[2]}</div></div>`)}<div class="proof-note">${r?"对比的是运行时边界，不是模型排行榜：同一个模型在不同上下文、记忆、UI、可观测与分发能力下，会形成完全不同的工程体验。":"This compares runtime boundaries, not model rankings. The same model behaves very differently when context, memory, UI, observability, and distribution capabilities change."}</div></div>
          </div>
        </div>
      </section>
    `}};J.styles=x`
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
    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2, .extension h3 { color: #18181b; }
      .head p, .extension > p { color: #52525b; }
      .extension { background: #ffffff; border-color: #e4e4e7; }
      .resource { border-color: #e4e4e7; color: #52525b; background: #fafafa; }
      .resource.hot { color: #047857; border-color: rgba(16,185,129,0.18); background: rgba(16,185,129,0.06); }
      .proof { background: #ffffff; border-color: #e4e4e7; }
      .proof-head { background: #f4f4f5; }
      .proof-cell { border-color: #e4e4e7; color: #52525b; }
      .proof-head .proof-cell { color: #71717a; }
      .proof-cell.pi { color: #047857; }
      .proof-note { border-color: #e4e4e7; color: #71717a; }
    }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .proof { overflow-x: auto; } .proof-head, .proof-row { min-width: 640px; } }
  `;Te([k()],J.prototype,"locale",2);J=Te([b("extend-and-prove-scene")],J);var mt=Object.defineProperty,gt=Object.getOwnPropertyDescriptor,Me=(r,e,t,s)=>{for(var o=s>1?void 0:s?gt(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=(s?a(e,t,o):a(o))||o);return s&&o&&mt(e,t,o),o};let V=class extends f{constructor(){super(...arguments),this.locale=d.getCurrentLocale()}connectedCallback(){super.connectedCallback(),this._unsub=d.subscribe(()=>{this.locale=d.getCurrentLocale()})}disconnectedCallback(){var r;super.disconnectedCallback(),(r=this._unsub)==null||r.call(this)}t(r){return d.t(r)}render(){const r=d.t.bind(d);return h`
      <section class="section">
        <div class="inner">
          <h2 class="title">${r("cta.title")}</h2>
          <p class="subtitle">${r("cta.subtitle")}</p>
          <a href="https://github.com/Dwsy/agent" class="cta" target="_blank" rel="noopener">
            ${r("cta.button")}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </section>
    `}};V.styles=x`
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

    @media (prefers-color-scheme: light) {
      .section { background: #ffffff; }
      .title { color: #18181b; }
      .subtitle { color: #52525b; }
      .section::before { background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%); }
    }
  `;Me([k()],V.prototype,"locale",2);V=Me([b("cta-section")],V);var ft=Object.getOwnPropertyDescriptor,ut=(r,e,t,s)=>{for(var o=s>1?void 0:s?ft(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=a(o)||o);return o};let te=class extends f{render(){return h`
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
    `}};te.styles=x`
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
  `;te=ut([b("pi-footer")],te);var bt=Object.getOwnPropertyDescriptor,vt=(r,e,t,s)=>{for(var o=s>1?void 0:s?bt(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=a(o)||o);return o};let re=class extends f{constructor(){super(...arguments),this.particles=[],this.PARTICLE_COUNT=30,this.CONNECTION_DISTANCE=150,this.MAX_CONNECTIONS=3,this.animate=()=>{!this.ctx||!this.canvas||(this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height),this.particles.forEach((r,e)=>{r.x+=r.vx,r.y+=r.vy,(r.x<0||r.x>this.canvas.width)&&(r.vx*=-1),(r.y<0||r.y>this.canvas.height)&&(r.vy*=-1),this.ctx.beginPath(),this.ctx.arc(r.x,r.y,r.radius,0,Math.PI*2),this.ctx.fillStyle=`rgba(16, 185, 129, ${r.opacity})`,this.ctx.fill();let t=0;for(let s=e+1;s<this.particles.length&&!(t>=this.MAX_CONNECTIONS);s++){const o=this.particles[s],i=r.x-o.x,a=r.y-o.y,c=Math.sqrt(i*i+a*a);if(c<this.CONNECTION_DISTANCE){const n=(1-c/this.CONNECTION_DISTANCE)*.15;this.ctx.beginPath(),this.ctx.moveTo(r.x,r.y),this.ctx.lineTo(o.x,o.y),this.ctx.strokeStyle=`rgba(16, 185, 129, ${n})`,this.ctx.lineWidth=.5,this.ctx.stroke(),t++}}}),this.animationId=requestAnimationFrame(this.animate))}}firstUpdated(){this.canvas=this.renderRoot.querySelector("canvas"),this.canvas&&(this.ctx=this.canvas.getContext("2d")||void 0,this.ctx&&(this.setupCanvas(),this.initParticles(),this.animate(),this.resizeObserver=new ResizeObserver(()=>{this.setupCanvas()}),this.resizeObserver.observe(this.canvas)))}setupCanvas(){var e;if(!this.canvas)return;const r=(e=this.canvas.parentElement)==null?void 0:e.getBoundingClientRect();r&&(this.canvas.width=r.width,this.canvas.height=r.height)}initParticles(){if(this.canvas){this.particles=[];for(let r=0;r<this.PARTICLE_COUNT;r++)this.particles.push({x:Math.random()*this.canvas.width,y:Math.random()*this.canvas.height,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,radius:Math.random()*1.5+.5,opacity:Math.random()*.3+.1})}}disconnectedCallback(){var r;super.disconnectedCallback(),this.animationId&&cancelAnimationFrame(this.animationId),(r=this.resizeObserver)==null||r.disconnect()}render(){return h`<canvas></canvas>`}};re.styles=x`
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

    @media (prefers-color-scheme: light) {
      canvas { opacity: 0; }
    }
  `;re=vt([b("canvas-background")],re);var yt=Object.getOwnPropertyDescriptor,wt=(r,e,t,s)=>{for(var o=s>1?void 0:s?yt(e,t):e,i=r.length-1,a;i>=0;i--)(a=r[i])&&(o=a(o)||o);return o};let we=class extends f{createRenderRoot(){return this}render(){return h`
      <canvas-background></canvas-background>
      <pi-navbar></pi-navbar>
      <main id="main-content" style="position: relative; z-index: 1;">
        <hero-section></hero-section>
        <runtime-system-scene></runtime-system-scene>
        <companion-ecosystem-scene></companion-ecosystem-scene>
        <extend-and-prove-scene></extend-and-prove-scene>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `}};we=wt([b("pi-app")],we);Ce(h`<pi-app></pi-app>`,document.getElementById("app"));
