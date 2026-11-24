import type { AnalysisReport, AnalysisReportBlock, AnalysisReportContentBlock, AnalysisReportStep } from "../contracts/analysis-report";
import { formatMessageText } from "../components/ui/format-message-text";
import { reportStyles } from "./html-report-presentation";
import offlineBundle from "virtual:debugger-offline-bundle";
import { visibleHtmlSections } from "../utils/html-visible-report";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function tableRegion(content: string): string {
  return `<div class="table-wrap" role="region" aria-label="Recorded table" tabindex="0">${content}</div>`;
}

function markdown(value: string, level: number): string {
  const content = formatMessageText(value)
    .replace(/<(\/?)h([1-3])>/g, (_match, closing: string, heading: string) =>
      `<${closing}h${Math.min(6, level + Number(heading) - 1)}>`)
    .replace(/<th>/g, '<th scope="col">')
    .replace(/<table>/g, '<div class="table-wrap" role="region" aria-label="Recorded table" tabindex="0"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return `<div class="prose">${content}</div>`;
}

function fields(block: Extract<AnalysisReportContentBlock, { kind: "fields" }>, metadata = false): string {
  if (!block.fields.length) return "";
  return `<dl class="${metadata ? "metadata" : "fields"}">${block.fields.map(field =>
    `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`).join("")}</dl>`;
}

function renderStep(step: AnalysisReportStep, index: number): string {
  const label = `Step ${index + 1}. ${step.heading}`;
  const first = step.blocks[0];
  const metadata = first?.kind === "fields" && first.fields.every(field =>
    ["Status", "Duration", "Time", "HTTP status"].includes(field.label)) ? first : undefined;
  const payload = metadata ? step.blocks.slice(1) : step.blocks;
  const content = payload.map(block => renderContent(block, 5)).join("");
  const details = (step.category === "tool" || step.category === "skill") && content
    ? `<details><summary aria-label="${escapeHtml(`Recorded inputs and results for ${label}`)}">Recorded inputs and results</summary>${content}</details>`
    : content;
  return `<li class="flow-item"><article class="step" data-category="${escapeHtml(step.category)}">
<h4>${escapeHtml(label)}</h4>${metadata ? fields(metadata, true) : ""}${details}</article></li>`;
}

/** Escapes captured report blocks for static evidence, fallback and full-document printing. */
export function renderReportContent(block: AnalysisReportBlock, level = 3): string {
  switch (block.kind) {
    case "exchange":
      return `<article class="exchange"><h3>${escapeHtml(block.heading)}</h3>${block.messages?.length
        ? `<section class="recorded-messages"><h4>Original recorded messages</h4>${block.messages.map(message =>
          `<article><h5>${escapeHtml(message.role)} | ${escapeHtml(message.id)} | ${escapeHtml(message.timestamp)}</h5><p class="plain">${escapeHtml(message.text)}</p></article>`).join("")}</section>` : ""}
${block.messageDetails?.map(detail => renderContent(detail, 5)).join("") ?? ""}
<ol class="steps">${block.steps.map(renderStep).join("")}</ol></article>`;
    case "heading":
      return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
    case "fields": return fields(block);
    case "table":
      return tableRegion(`<table><thead><tr>${block.columns.map(column =>
        `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${block.rows.map(row =>
        `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    case "markdown": return markdown(block.text, level);
    case "code": return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "text": return `<p class="plain">${escapeHtml(block.text)}</p>`;
  }
}

const renderContent = renderReportContent;

/** Embeds the actual debugger presentation runtime and safe captured props into one offline file. */
export function renderAnalysisHtml(report: AnalysisReport): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
  const complete = visibleHtmlSections(report).map((section, index) =>
    `<section><h2>${index + 1}. ${escapeHtml(section.heading)}</h2>${section.blocks.map(block => renderContent(block)).join("")}</section>`).join("")
    .replace(/<details>/g, "<details open>");
  const data = JSON.stringify(report.offline ?? { transcriptData: { activities: [] }, exchanges: [],
    componentNames: {}, messageLabels: {}, turnDurationByMessageId: {} })
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(report.title)}</title>
<meta id="offline-style-insertion-point">
<style>${offlineBundle.css.replace(/<\/style/gi, "<\\/style")}\n${reportStyles}</style></head>
<body>
<div id="offline-root"><p>Loading analysis.</p></div>
<div id="all-evidence" class="all-evidence" hidden></div>
<template id="complete-evidence">${complete}</template>
<noscript><main class="all-evidence"><h1>${escapeHtml(report.title)}</h1>${complete}</main></noscript>
<script id="offline-data" type="application/json" nonce="${nonce}">${data}</script>
<script nonce="${nonce}">${offlineBundle.script.replace(/<\/script/gi, "<\\/script")}</script>
</body></html>`;
}
