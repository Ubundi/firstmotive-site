# First Motive

Custom robot training data and multimodal capture.

We design task-specific robotics data engagements: real-world capture, dataset processing, quality validation, annotation, review, and verified delivery.

## About

First Motive helps robotics and Physical AI teams collect and use data for a defined task, model, evaluation, or deployment. We preserve source identity, quality evidence, provenance, and use boundaries from capture through delivery.

- **Engagement:** Custom data pilots
- **Based:** Stellenbosch, South Africa

## Local development

Open `index.html` in a browser. No build step required.

## Agent-readable content

The site serves Markdown mirrors for AI agents, served as `text/markdown` by the worker:

- `llms.txt` — root index that points agents at the pages worth reading
- `index.md` — the full one-pager as clean Markdown
- `robot-training-data.md` — buyer fit, service scope, delivery artifacts, formats, and common questions
- `what-we-do.md`, `how-we-work.md`, `cowork.md` — focused capture, pipeline, and cowork mirrors

`index.html` is the single source of truth. These files are generated:

```
npm run agent-docs        # regenerate after changing index.html
npm run agent-docs:check  # fail if the committed files drift from index.html
```

Never edit the generated files by hand. Run the check before deploying. The worker serves Markdown with a canonical link to the HTML page and a `noindex` header, so the mirrors help AI agents without competing with the main page in search.

The main HTML page includes visible buyer-focused service and FAQ content, canonical metadata, and Organization/Service structured data. `robots.txt` points crawlers to `sitemap.xml`.

## Contact

[adii@firstmotive.ai](mailto:adii@firstmotive.ai) · [firstmotive.ai](https://firstmotive.ai)
