import { webDarkTheme } from "@fluentui/react-components";
import { agentDebuggerLightTheme } from "../theme/agentDebuggerTheme";

const variables = (theme: typeof agentDebuggerLightTheme) => Object.entries(theme).map(([key, value]) => `--${key}:${value}`).join(";");

/** Artifact chrome and complete-evidence print styles; interactive UI uses the actual shared styles. */
export const reportStyles = `
:root{${variables(agentDebuggerLightTheme)};font-family:var(--fontFamilyBase);color:var(--colorNeutralForeground1);background:var(--colorNeutralBackground1)}
html[data-theme=dark]{${variables(webDarkTheme)};color-scheme:dark}
body{margin:0}[hidden]{display:none!important}
.offline-app{--debugger-sticky-offset:12px;padding-top:var(--spacingVerticalXXL);padding-bottom:var(--spacingVerticalXXL)}
.offline-header{margin-bottom:var(--spacingVerticalXXL)}.offline-header h1{margin:0}
.offline-app [role=tabpanel]{margin-top:var(--spacingVerticalXXL)}
html[data-theme=dark] .w-shell{--appBackground:var(--colorNeutralBackground2)}
html[data-theme=dark] .w-chain{background-color:var(--colorNeutralBackground2)}
.offline-app .w-tri{min-width:0}.offline-app .w-chain{max-width:100%;min-width:0}
.offline-app .w-chain .w-rnode,.offline-app .w-chain .w-agentgrp{max-width:100%;min-width:0}
.offline-app .w-detailbody,.offline-app .w-bub{overflow-wrap:anywhere}
button:focus-visible,summary:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--colorStrokeFocus2)!important;outline-offset:3px!important}
.all-evidence{box-sizing:border-box;max-width:1728px;margin:auto;padding:var(--spacingVerticalXXL);overflow-wrap:anywhere}
.all-evidence section{margin-bottom:var(--spacingVerticalXXL)}
.all-evidence .fields,.all-evidence .metadata{margin:var(--spacingVerticalM) 0}
.all-evidence dt{font-weight:var(--fontWeightSemibold)}
.all-evidence dd{margin:var(--spacingVerticalXS) 0;white-space:pre-wrap;overflow-wrap:anywhere}
.all-evidence .fields>div{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:var(--spacingHorizontalL);padding:var(--spacingVerticalS) 0}
.all-evidence .fields dd{margin:0}
.all-evidence pre,.all-evidence .plain{white-space:pre-wrap;overflow-wrap:anywhere}
.all-evidence pre{background:var(--colorNeutralBackground2);padding:var(--spacingVerticalM);border:1px solid var(--colorNeutralStroke2)}
.all-evidence .table-wrap{overflow:auto;max-width:100%}
.all-evidence table{border-collapse:collapse;width:100%}
.all-evidence td,.all-evidence th{padding:var(--spacingVerticalS);border:1px solid var(--colorNeutralStroke2);text-align:left;overflow-wrap:anywhere}
.all-evidence .steps{padding-left:var(--spacingHorizontalXXL)}.all-evidence .step{margin:var(--spacingVerticalL) 0}
.all-evidence .prose img{display:none}
@media(max-width:1079px){.offline-app .w-chat{max-height:none}.offline-app .w-tri{grid-template-columns:minmax(0,1fr)}}
@media(max-width:479px){.all-evidence .fields>div{grid-template-columns:minmax(0,1fr)}}
@page{size:A4;margin:16mm}
@media print{
#offline-root,.fui-Portal{display:none!important}.all-evidence{display:block!important;max-width:none;padding:0}
.all-evidence,.all-evidence article,.all-evidence section,.all-evidence .table-wrap{min-width:0;max-width:100%}
.all-evidence pre,.all-evidence .table-wrap{max-height:none;overflow:visible}
.all-evidence table{table-layout:fixed;width:100%}
.all-evidence p,.all-evidence h1,.all-evidence h2,.all-evidence h3,.all-evidence h4,.all-evidence h5,
.all-evidence li,.all-evidence dt,.all-evidence dd,.all-evidence pre,.all-evidence code,.all-evidence th,.all-evidence td,.all-evidence a{overflow-wrap:anywhere;word-break:break-word}
.all-evidence pre,.all-evidence pre code,.all-evidence td,.all-evidence th,.all-evidence dd{white-space:pre-wrap!important}
.all-evidence details>*{display:block!important}.all-evidence a{color:inherit}.all-evidence h2,.all-evidence h3,.all-evidence h4{break-after:avoid}
}
`;
