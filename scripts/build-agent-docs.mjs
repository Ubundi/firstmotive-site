#!/usr/bin/env node
/**
 * Generate the agent-readable docs (llms.txt + Markdown mirrors of the page
 * sections) from index.html, the single source of truth.
 *
 *   node scripts/build-agent-docs.mjs          regenerate llms.txt and *.md
 *   node scripts/build-agent-docs.mjs --check  fail if committed files drift
 *
 * Extraction is deliberately strict: if a fact cannot be found in index.html
 * the script throws, so a site redesign forces a conscious update here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL_FALLBACK = 'https://firstmotive.ai';

/* ----------------------------------------------------------------------- */
/* HTML extraction helpers                                                  */
/* ----------------------------------------------------------------------- */

function htmlToText(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

function fail(label) {
  throw new Error(
    `Could not extract "${label}" from index.html. ` +
    'The page structure changed — update scripts/build-agent-docs.mjs.',
  );
}

function extract(html, regex, label) {
  const match = html.match(regex);
  if (!match) fail(label);
  return htmlToText(match[1]);
}

function extractAll(html, regex, label) {
  const matches = [...html.matchAll(regex)];
  if (!matches.length) fail(label);
  return matches.map((match) => htmlToText(match[1]));
}

function sliceBetween(html, startMarker, endMarker, label) {
  const start = html.indexOf(startMarker);
  const end = endMarker ? html.indexOf(endMarker, start + startMarker.length) : html.length;
  if (start < 0 || end < 0) fail(label);
  return html.slice(start, end);
}

/* Render sensor tags like "HEAD · RGB" / "CHEST · LIDAR" as "Head RGB". */
const ACRONYMS = new Map([
  ['rgb', 'RGB'],
  ['lidar', 'LiDAR'],
  ['imu', 'IMU'],
  ['hz', 'Hz'],
  ['l', 'L'],
  ['r', 'R'],
]);

function prettySensor(rawTag) {
  return rawTag
    .split('·')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((word) => {
          const lower = word.toLowerCase();
          if (ACRONYMS.has(lower)) return ACRONYMS.get(lower);
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' '),
    )
    .join(' ');
}

function prettyRate(rawHz) {
  return rawHz.replace(/\bHZ\b/gi, 'Hz');
}

function cell(text) {
  return text.replace(/\|/g, '\\|');
}

/* ----------------------------------------------------------------------- */
/* Parse index.html                                                         */
/* ----------------------------------------------------------------------- */

function parseSite(html) {
  const hero = {
    eyebrow: extract(html, /<div class="eyebrow">([\s\S]*?)<\/div>/, 'hero eyebrow'),
    title: extract(html, /<h1>([\s\S]*?)<\/h1>/, 'hero h1'),
    sub: extract(html, /<p class="sub">([\s\S]*?)<\/p>/, 'hero sub'),
    orbit: extract(html, /<div class="orbit-center-text">([\s\S]*?)<\/div>/, 'orbit summary'),
    meta: Object.fromEntries(
      [...html.matchAll(/<span class="meta-label">([\s\S]*?)<\/span>\s*<span class="meta-value">([\s\S]*?)<\/span>/g)]
        .map((match) => [htmlToText(match[1]), htmlToText(match[2])]),
    ),
  };
  if (!hero.meta.Engagement || !hero.meta.Based) fail('hero meta strip');

  const whatWeDo = sliceBetween(html, '<section class="statement" id="what-we-do">', '<section class="how"', 'what-we-do section');
  const modalities = [...whatWeDo.matchAll(/<article class="mod-card"[\s\S]*?<\/article>/g)].map((match) => {
    const card = match[0];
    return {
      num: extract(card, /<div class="mod-num">([\s\S]*?)<\/div>/, 'modality number'),
      title: extract(card, /<h3 class="mod-title">([\s\S]*?)<\/h3>/, 'modality title'),
      sub: extract(card, /<p class="mod-sub">([\s\S]*?)<\/p>/, 'modality sub'),
      body: extract(card, /<p class="mod-body">([\s\S]*?)<\/p>/, 'modality body'),
      rate: card.match(/<span class="mod-hz">([\s\S]*?)<\/span>/)?.[1] ?? null,
      sensors: [...card.matchAll(/<span class="(?:viz-cam-label|mod-tag)">([\s\S]*?)<\/span>/g)]
        .map((tag) => prettySensor(htmlToText(tag[1]))),
    };
  });
  if (modalities.length < 3) fail('modality cards');

  const what = {
    heading: extract(whatWeDo, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'what-we-do heading'),
    follow: extract(whatWeDo, /<p class="statement-follow reveal">([\s\S]*?)<\/p>/, 'what-we-do follow'),
    modalities,
  };

  const servicesSection = sliceBetween(
    html,
    '<section class="services" id="robot-data-services">',
    '<section class="how"',
    'robot-data-services section',
  );
  const services = {
    heading: extract(servicesSection, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'services heading'),
    lead: extract(servicesSection, /<p class="services-lead reveal">([\s\S]*?)<\/p>/, 'services lead'),
    cards: [...servicesSection.matchAll(/<article class="service-card reveal">([\s\S]*?)<\/article>/g)].map((match) => ({
      title: extract(match[1], /<h3>([\s\S]*?)<\/h3>/, 'service title'),
      body: extract(match[1], /<p>([\s\S]*?)<\/p>/, 'service body'),
    })),
    fitGroups: [...servicesSection.matchAll(/<div class="reveal">[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?<ul>([\s\S]*?)<\/ul>[\s\S]*?<\/div>/g)]
      .map((match) => ({
        title: htmlToText(match[1]),
        items: extractAll(match[2], /<li>([\s\S]*?)<\/li>/g, 'service fit items'),
      })),
  };
  if (services.cards.length !== 3 || services.fitGroups.length !== 2) fail('service cards and fit groups');

  const howSection = sliceBetween(html, '<section class="how" id="how-we-work">', '<section class="hood"', 'how-we-work section');
  const how = {
    heading: extract(howSection, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'how-we-work heading'),
    lead: extract(howSection, /<p class="how-lead reveal">([\s\S]*?)<\/p>/, 'how-we-work lead'),
    stages: extract(howSection, /<p class="how-stages reveal">([\s\S]*?)<\/p>/, 'how-we-work stages'),
    steps: extractAll(howSection, /<div class="how-step reveal">[\s\S]*?<span>([\s\S]*?)<\/span>/g, 'pipeline steps'),
  };

  const hoodSection = sliceBetween(html, '<section class="hood" id="under-the-hood">', '<section class="questions"', 'under-the-hood section');
  const hood = {
    heading: extract(hoodSection, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'under-the-hood heading'),
    lead: extract(hoodSection, /<p class="hood-lead reveal">([\s\S]*?)<\/p>/, 'under-the-hood lead'),
  };

  const questionsSection = sliceBetween(
    html,
    '<section class="questions" id="questions">',
    '<section class="cowork"',
    'questions section',
  );
  const questions = {
    heading: extract(questionsSection, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'questions heading'),
    lead: extract(questionsSection, /<p class="questions-lead reveal">([\s\S]*?)<\/p>/, 'questions lead'),
    items: [...questionsSection.matchAll(/<details class="reveal">([\s\S]*?)<\/details>/g)].map((match) => ({
      question: extract(match[1], /<summary>([\s\S]*?)<\/summary>/, 'FAQ question'),
      answer: extract(match[1], /<p>([\s\S]*?)<\/p>/, 'FAQ answer'),
    })),
    cta: extract(questionsSection, /<div class="questions-cta reveal">[\s\S]*?<p>([\s\S]*?)<\/p>/, 'questions CTA'),
  };
  if (questions.items.length < 4) fail('FAQ items');

  const coworkSection = sliceBetween(html, '<section class="cowork" id="work">', '<footer>', 'cowork section');
  const cowork = {
    tag: extract(coworkSection, /<span class="cw-tag">([\s\S]*?)<\/span>/, 'cowork tag'),
    place: extract(
      coworkSection.replace(/<span class="cw-tag">[\s\S]*?<\/span>/, ''),
      /<div class="cw-eyebrow reveal">([\s\S]*?)<\/div>/,
      'cowork eyebrow',
    ),
    heading: extract(coworkSection, /<h2 class="reveal">([\s\S]*?)<\/h2>/, 'cowork heading'),
    lead: extract(coworkSection, /<p class="cw-lead reveal">([\s\S]*?)<\/p>/, 'cowork lead'),
    room: extract(coworkSection, /<p class="cw-room-line">([\s\S]*?)<\/p>/, 'cowork room line'),
    chips: extractAll(coworkSection, /<span class="cw-chip">([\s\S]*?)<\/span>/g, 'cowork chips'),
    invite: extract(coworkSection, /<p class="cw-invite">([\s\S]*?)<\/p>/, 'cowork invite'),
    note: extract(coworkSection, /<p class="cw-note">([\s\S]*?)<\/p>/, 'cowork note'),
  };

  const footer = sliceBetween(html, '<footer>', '</footer>', 'footer');
  const siteUrl = extract(html, /href="(https:\/\/firstmotive\.ai[^"]*)"/, 'site URL').replace(/\/$/, '') || SITE_URL_FALLBACK;
  const foot = {
    heading: extract(footer, /<h3 class="reveal">([\s\S]*?)<\/h3>/, 'footer heading'),
    email: extract(footer, /href="mailto:([^"]+)"/, 'contact email'),
    siteUrl,
    operations: extract(footer, /<span class="foot-label">Operations<\/span>\s*<span>([\s\S]*?)<\/span>/, 'operations location'),
    bottom: extractAll(
      sliceBetween(html, '<div class="foot-bottom reveal">', '</div>', 'footer bottom'),
      /<span>([\s\S]*?)<\/span>/g,
      'footer bottom lines',
    ),
  };

  return { hero, what, services, how, hood, questions, cowork, foot };
}

/* ----------------------------------------------------------------------- */
/* Markdown rendering                                                       */
/* ----------------------------------------------------------------------- */

const GENERATED_NOTE =
  '_Agent-readable version of [firstmotive.ai](https://firstmotive.ai/). ' +
  'Generated from `index.html` by `scripts/build-agent-docs.mjs` — do not edit by hand._';

function modalityTable({ what }) {
  const rows = what.modalities.map((mod) => {
    const sensors = mod.sensors.length ? mod.sensors.join(', ') : '—';
    const rate = mod.rate ? prettyRate(htmlToText(mod.rate)) : '—';
    return `| ${mod.num} | ${cell(mod.title)} | ${cell(sensors)} | ${cell(rate)} | ${cell(mod.sub)} |`;
  });
  return [
    '| # | Modality | Sensors | Sample rate | What it records |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function modalityDetails({ what }) {
  return what.modalities
    .map((mod) => {
      const lines = [`### ${mod.num} · ${mod.title}`, '', `**${mod.sub}**`, '', mod.body];
      const facts = [];
      if (mod.sensors.length) facts.push(`Sensors: ${mod.sensors.join(', ')}`);
      if (mod.rate) facts.push(`Sample rate: ${prettyRate(htmlToText(mod.rate))}`);
      if (facts.length) lines.push('', facts.join(' · '));
      return lines.join('\n');
    })
    .join('\n\n');
}

function pipelineLine({ how }) {
  return `${how.stages.replace(/\.$/, '')}: ${how.steps.join(' → ')}.`;
}

function serviceDetails({ services }) {
  return services.cards
    .map((service, index) => `### ${index + 1}. ${service.title}\n\n${service.body}`)
    .join('\n\n');
}

function fitGroups({ services }) {
  return services.fitGroups
    .map((group) => `### ${group.title}\n\n${group.items.map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');
}

function faqDetails({ questions }) {
  return questions.items
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join('\n\n');
}

function renderLlmsTxt(site) {
  return `# First Motive

> ${site.hero.sub}

First Motive designs task-specific robotics data engagements: multimodal capture, dataset processing, quality validation, annotation, review, and recipient-specific delivery. We work from the downstream model, evaluation, or deployment decision so each dataset has an explicit use and evidence boundary. Engagement: ${site.hero.meta.Engagement}. Based: ${site.hero.meta.Based}. Contact: ${site.foot.email}.

## Core pages

- [First Motive website](${site.foot.siteUrl}/): visual overview and primary contact page
- [First Motive overview](${site.foot.siteUrl}/index.md): offer, services, capture modalities, pipeline, FAQ, and contact
- [Robot training data services](${site.foot.siteUrl}/robot-training-data.md): buyer fit, engagement scope, delivery artifacts, formats, and common questions
- [Multimodal data capture](${site.foot.siteUrl}/what-we-do.md): the ${site.what.modalities.length} capture modalities, sensors, sample rates, and integrity evidence
- [Data pipeline and delivery](${site.foot.siteUrl}/how-we-work.md): the ${site.how.steps.join(' → ')} pipeline, evidence chain, and operator app

## Other

- [Stellenbosch cowork](${site.foot.siteUrl}/cowork.md): the local AI workspace, who it is for, and how to request an invite
`;
}

function renderIndexMd(site) {
  return `# First Motive — ${site.hero.title}

> ${site.hero.sub}

| Fact | Value |
| --- | --- |
| Company | First Motive |
| What | ${cell(site.hero.title)} |
| Engagement | ${cell(site.hero.meta.Engagement)} |
| Based | ${cell(site.hero.meta.Based)} |
| Data format | ${cell(site.hero.orbit)} |
| Contact | ${site.foot.email} |
| Site | ${site.foot.siteUrl} |

## What we do

${site.what.heading}

${site.what.follow}

### Capture modalities

${modalityTable(site)}

${modalityDetails(site)}

## Robot data services

${site.services.heading}

${site.services.lead}

${serviceDetails(site)}

${fitGroups(site)}

## How we work

${site.how.heading}

${site.how.lead}

${pipelineLine(site)}

## The capture tool

${site.hood.heading}

${site.hood.lead}

## Common questions

${site.questions.heading}

${site.questions.lead}

${faqDetails(site)}

## Start a data brief

${site.questions.cta}

Email ${site.foot.email} with the task, environment, robot or model, required signals, intended use, and timeline.

## Cowork — Stellenbosch workspace

${site.cowork.heading}

${site.cowork.lead}

- **Who is in the room:** ${site.cowork.room} ${site.cowork.chips.join(', ')}.
- **How you get in:** ${site.cowork.invite}
- **Status:** ${site.cowork.note}

## Contact

- Email: ${site.foot.email}
- Site: ${site.foot.siteUrl}
- Operations: ${site.foot.operations}
- ${site.foot.bottom[1]}

${site.foot.bottom[0]}

---

${GENERATED_NOTE}
`;
}

function renderWhatWeDoMd(site) {
  return `# Multimodal robot data capture — First Motive

${site.what.heading}

${site.what.follow}

## Capture modalities

${modalityTable(site)}

${modalityDetails(site)}

---

${GENERATED_NOTE}
`;
}

function renderRobotTrainingDataMd(site) {
  return `# Custom robot training data and multimodal capture

> ${site.hero.sub}

First Motive designs task-specific data engagements for robotics, VLA, imitation-learning, manipulation, and Physical AI teams. We start from the model, benchmark, evaluation, or deployment decision the data must support.

## Services

${site.services.heading}

${site.services.lead}

${serviceDetails(site)}

## Fit and delivery

${fitGroups(site)}

## Capture modalities

${modalityTable(site)}

## Data pipeline

${pipelineLine(site)}

${site.how.lead}

## Common questions

${faqDetails(site)}

## Start a data brief

${site.questions.cta}

Email ${site.foot.email} with the task, environment, robot or model, required signals, intended use, and timeline.

---

${GENERATED_NOTE}
`;
}

function renderHowWeWorkMd(site) {
  return `# Robot data pipeline and delivery — First Motive

${site.how.heading}

## Pipeline

${pipelineLine(site)}

${site.how.steps.map((step, index) => `${index + 1}. **${step}**`).join('\n')}

## Evidence chain

${site.how.lead}

## The operator app

${site.hood.heading}

${site.hood.lead}

---

${GENERATED_NOTE}
`;
}

function renderCoworkMd(site) {
  return `# Cowork — a place to work in Stellenbosch

_${site.cowork.tag} · ${site.cowork.place}_

${site.cowork.heading}

${site.cowork.lead}

## Who is in the room

${site.cowork.room}

${site.cowork.chips.map((chip) => `- ${chip}`).join('\n')}

## How you get in

${site.cowork.invite}

${site.cowork.note}

Request an invite on [firstmotive.ai](${site.foot.siteUrl}/#work) or email ${site.foot.email}.

---

${GENERATED_NOTE}
`;
}

/* ----------------------------------------------------------------------- */
/* Main                                                                     */
/* ----------------------------------------------------------------------- */

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const site = parseSite(html);

const outputs = new Map([
  ['llms.txt', renderLlmsTxt(site)],
  ['index.md', renderIndexMd(site)],
  ['robot-training-data.md', renderRobotTrainingDataMd(site)],
  ['what-we-do.md', renderWhatWeDoMd(site)],
  ['how-we-work.md', renderHowWeWorkMd(site)],
  ['cowork.md', renderCoworkMd(site)],
]);

const checkOnly = process.argv.includes('--check');
let drift = 0;

for (const [name, content] of outputs) {
  const path = join(ROOT, name);
  if (checkOnly) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* missing */
    }
    if (current !== content) {
      drift += 1;
      console.error(`DRIFT: ${name} is ${current === null ? 'missing' : 'out of date'} — run \`npm run agent-docs\`.`);
    } else {
      console.log(`OK: ${name}`);
    }
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${name}`);
  }
}

if (checkOnly && drift > 0) {
  console.error(`\n${drift} agent doc(s) out of sync with index.html.`);
  process.exit(1);
}
